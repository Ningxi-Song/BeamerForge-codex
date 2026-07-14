"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createWorkbenchServer } = require("../workbench/server");
const { DEFAULT_THEME } = require("../schema/theme-schema");
const { getRegistry } = require("../registry/options");
const { resolveDesign } = require("../design/resolve-design");
const { generateFiles } = require("../generators/latex");

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function withServer(t, options) {
  const server = createWorkbenchServer({ rootDir: process.cwd(), ...options });
  t.after(() => close(server));
  return `http://127.0.0.1:${await listen(server)}`;
}

function cloneTheme() {
  return structuredClone(DEFAULT_THEME);
}

async function prepareBaseline(baseUrl, theme = cloneTheme()) {
  const saved = await fetch(`${baseUrl}/api/theme`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(theme)
  });
  assert.equal(saved.status, 200);
  const response = await fetch(`${baseUrl}/api/manual-baseline`, { method: "POST" });
  assert.equal(response.status, 200);
  return response.json();
}

function suggestionForm(baseline, brief = "Make this warmer") {
  const form = new FormData();
  form.set("brief", brief);
  form.set("cycleId", baseline.cycleId);
  form.set("reviewRevision", baseline.reviewRevision);
  form.set("expectedManualThemeHash", baseline.manualThemeHash);
  form.set("relativePaths", "[]");
  return form;
}

function fakeStatus() {
  return {
    connected: true,
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "model-a",
    capabilities: { modelList: true, jsonOutput: true, imageInput: true }
  };
}

test("AI connection routes expose only the injected provider's public state", async (t) => {
  const calls = [];
  let connected = false;
  const providerService = {
    status: () => connected ? fakeStatus() : { connected: false },
    connect: async (input) => {
      calls.push(input);
      connected = true;
      return { ...fakeStatus(), models: [{ id: "model-a" }] };
    },
    disconnect: () => { const prior = connected; connected = false; return prior; },
    complete: async () => { throw new Error("not used"); }
  };
  const baseUrl = await withServer(t, {
    stateDir: tempDir("beamerforge-ai-connect-"),
    providerService
  });

  let response = await fetch(`${baseUrl}/api/ai/connection`);
  assert.deepEqual(await response.json(), { connected: false });
  response = await fetch(`${baseUrl}/api/ai/connect`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: "openai", apiKey: "secret", model: "model-a" })
  });
  assert.equal(response.status, 200);
  assert.equal(JSON.stringify(await response.json()).includes("secret"), false);
  assert.equal(calls[0].apiKey, "secret");
  response = await fetch(`${baseUrl}/api/ai/disconnect`, { method: "POST" });
  assert.deepEqual(await response.json(), { ok: true, disconnected: true });
});

test("provider failures never return API keys or provider response bodies", async (t) => {
  const secret = "secret-that-must-not-escape";
  const baseUrl = await withServer(t, {
    stateDir: tempDir("beamerforge-ai-secret-"),
    providerFetch: async () => new Response(JSON.stringify({
      providerDebug: `rejected ${secret}`
    }), {
      status: 401,
      headers: { "content-type": "application/json" }
    })
  });
  const response = await fetch(`${baseUrl}/api/ai/connect`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: "openai", apiKey: secret, model: "model-a" })
  });
  const text = await response.text();
  assert.equal(response.status, 502);
  assert.equal(text.includes(secret), false);
  assert.equal(text.includes("providerDebug"), false);
  assert.equal((await fetch(`${baseUrl}/api/ai/connection`).then((result) => result.text())).includes(secret), false);
});

test("snapshot-bound suggestions create a draft and comparison without selecting it", async (t) => {
  const stateDir = tempDir("beamerforge-ai-suggest-");
  const candidate = cloneTheme();
  candidate.colors.primary = "#A14D3A";
  const completeCalls = [];
  const providerService = {
    status: fakeStatus,
    connect: async () => fakeStatus(),
    disconnect: () => true,
    complete: async (input) => { completeCalls.push(input); return JSON.stringify(candidate); }
  };
  const baseUrl = await withServer(t, { stateDir, providerService });
  const baseline = await prepareBaseline(baseUrl);

  const response = await fetch(`${baseUrl}/api/ai/suggest`, {
    method: "POST",
    body: suggestionForm(baseline)
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.draft.colors.primary, "#A14D3A");
  assert.equal(body.changes.some(({ path: changed }) => changed === "colors.primary"), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(stateDir, "ai-draft-theme.json"), "utf8")), candidate);
  assert.equal((await fetch(`${baseUrl}/api/selection`).then((result) => result.json())).selection, null);
  assert.equal((await fetch(`${baseUrl}/api/theme`).then((result) => result.json())).colors.primary, DEFAULT_THEME.colors.primary);
  assert.equal(completeCalls.length, 1);
  assert.equal(completeCalls[0].messages[1].content.includes("Make this warmer"), true);
  assert.equal(completeCalls[0].messages[1].content.includes("warm-neutral"), true);
});

test("mismatched baseline metadata rejects before provider invocation", async (t) => {
  let completions = 0;
  const providerService = {
    status: fakeStatus,
    connect: async () => fakeStatus(),
    disconnect: () => true,
    complete: async () => { completions += 1; return JSON.stringify(DEFAULT_THEME); }
  };
  const baseUrl = await withServer(t, {
    stateDir: tempDir("beamerforge-ai-mismatch-"),
    providerService
  });
  const baseline = await prepareBaseline(baseUrl);
  const form = suggestionForm(baseline);
  form.set("expectedManualThemeHash", "0".repeat(64));
  const response = await fetch(`${baseUrl}/api/ai/suggest`, { method: "POST", body: form });
  assert.equal(response.status, 409);
  assert.equal(completions, 0);
});

test("invalid candidates preserve the existing draft and active theme", async (t) => {
  const stateDir = tempDir("beamerforge-ai-invalid-");
  const existing = cloneTheme();
  existing.colors.primary = "#336699";
  const providerService = {
    status: fakeStatus,
    connect: async () => fakeStatus(),
    disconnect: () => true,
    complete: async () => "not JSON"
  };
  const baseUrl = await withServer(t, { stateDir, providerService });
  const baseline = await prepareBaseline(baseUrl);
  fs.writeFileSync(path.join(stateDir, "ai-draft-theme.json"), `${JSON.stringify(existing)}\n`);

  const response = await fetch(`${baseUrl}/api/ai/suggest`, {
    method: "POST",
    body: suggestionForm(baseline)
  });
  const body = await response.json();
  assert.equal(response.status, 502);
  assert.equal(body.code, "provider_invalid_response");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(stateDir, "ai-draft-theme.json"), "utf8")), existing);
  assert.deepEqual(await fetch(`${baseUrl}/api/theme`).then((result) => result.json()), DEFAULT_THEME);
});

test("a late response cannot save after the manual design starts a new cycle", async (t) => {
  const stateDir = tempDir("beamerforge-ai-stale-");
  let release;
  let started;
  const startedPromise = new Promise((resolve) => { started = resolve; });
  const providerService = {
    status: fakeStatus,
    connect: async () => fakeStatus(),
    disconnect: () => true,
    complete: async () => {
      started();
      return new Promise((resolve) => { release = resolve; });
    }
  };
  const baseUrl = await withServer(t, { stateDir, providerService });
  const baseline = await prepareBaseline(baseUrl);
  const pending = fetch(`${baseUrl}/api/ai/suggest`, {
    method: "POST",
    body: suggestionForm(baseline)
  });
  await startedPromise;

  const changed = cloneTheme();
  changed.colors.primary = "#112233";
  await fetch(`${baseUrl}/api/theme`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(changed)
  });
  release(JSON.stringify(DEFAULT_THEME));

  const response = await pending;
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /changed while AI was working/);
  assert.equal(fs.existsSync(path.join(stateDir, "ai-draft-theme.json")), false);
});

test("cancelling aborts provider work without altering any theme state", async (t) => {
  const stateDir = tempDir("beamerforge-ai-cancel-");
  let started;
  const startedPromise = new Promise((resolve) => { started = resolve; });
  const providerService = {
    status: fakeStatus,
    connect: async () => fakeStatus(),
    disconnect: () => true,
    complete: ({ signal }) => new Promise((_resolve, reject) => {
      started();
      signal.addEventListener("abort", () => reject(Object.assign(
        new Error("AI request cancelled"),
        { code: "provider_cancelled", statusCode: 409 }
      )), { once: true });
    })
  };
  const baseUrl = await withServer(t, { stateDir, providerService });
  const baseline = await prepareBaseline(baseUrl);
  const pending = fetch(`${baseUrl}/api/ai/suggest`, {
    method: "POST",
    body: suggestionForm(baseline)
  });
  await startedPromise;
  const cancel = await fetch(`${baseUrl}/api/ai/cancel`, { method: "POST" });
  assert.deepEqual(await cancel.json(), { ok: true, cancelled: true });
  assert.equal((await pending).status, 409);
  assert.deepEqual(await fetch(`${baseUrl}/api/theme`).then((result) => result.json()), DEFAULT_THEME);
  assert.equal(fs.existsSync(path.join(stateDir, "ai-draft-theme.json")), false);
  assert.equal((await fetch(`${baseUrl}/api/selection`).then((result) => result.json())).selection, null);
});

test("an AI suggestion can remove a duck from HTML and LaTeX while preserving manual restore", async (t) => {
  const stateDir = tempDir("beamerforge-ai-remove-duck-");
  const manual = cloneTheme();
  manual.decorations.cornerLogo.id = "duck";
  const candidate = cloneTheme();
  candidate.decorations.cornerLogo.id = "none";
  const providerService = {
    status: fakeStatus,
    connect: async () => fakeStatus(),
    disconnect: () => true,
    complete: async () => JSON.stringify(candidate)
  };
  const baseUrl = await withServer(t, { stateDir, providerService });
  const baseline = await prepareBaseline(baseUrl, manual);
  const response = await fetch(`${baseUrl}/api/ai/suggest`, {
    method: "POST",
    body: suggestionForm(baseline, "Remove the duck logo")
  });
  const comparison = await response.json();
  assert.equal(response.status, 200);

  const resolved = resolveDesign(comparison.draft, getRegistry());
  assert.equal(resolved.components.cornerLogo.vectorId, null);
  assert.equal(resolved.components.cornerLogo.previewUrl, "");
  assert.doesNotMatch(generateFiles(comparison.draft, getRegistry())["theme.cls"], /tikzpicture|Duck corner logo/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(stateDir, "manual-theme.json"), "utf8")).decorations.cornerLogo.id, "duck");

  const review = {
    expectedManualThemeHash: comparison.manualThemeHash,
    expectedDraftThemeHash: comparison.draftThemeHash,
    cycleId: comparison.cycleId,
    reviewRevision: comparison.reviewRevision
  };
  let selection = await fetch(`${baseUrl}/api/ai/accept`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(review)
  });
  assert.equal(selection.status, 200);
  assert.equal((await fetch(`${baseUrl}/api/theme`).then((result) => result.json())).decorations.cornerLogo.id, "none");
  selection = await fetch(`${baseUrl}/api/ai/restore`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(review)
  });
  assert.equal(selection.status, 200);
  assert.equal((await fetch(`${baseUrl}/api/theme`).then((result) => result.json())).decorations.cornerLogo.id, "duck");
});
