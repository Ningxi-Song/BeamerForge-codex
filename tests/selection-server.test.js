const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createWorkbenchServer } = require("../workbench/server");
const { DEFAULT_THEME } = require("../schema/theme-schema");
const { getRegistry } = require("../registry/options");
const { resolveDesign } = require("../design/resolve-design");

const cloneTheme = () => JSON.parse(JSON.stringify(DEFAULT_THEME));
const themeHash = (theme) => resolveDesign(theme, getRegistry()).source.themeHash;
async function start(t, options) {
  const server = createWorkbenchServer({ rootDir: process.cwd(), ...options });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  return `http://127.0.0.1:${server.address().port}`;
}
function tempDir(name) { return fs.mkdtempSync(path.join(os.tmpdir(), name)); }
function jsonPost(url, body) { return fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); }
function reviewRequest(comparison) {
  return {
    expectedManualThemeHash: comparison.manualThemeHash,
    expectedDraftThemeHash: comparison.draftThemeHash,
    cycleId: comparison.cycleId,
    reviewRevision: comparison.reviewRevision
  };
}

test("persisted selection is invalidated by theme writes and enforced by generation", async (t) => {
  const stateDir = tempDir("bf-selection-");
  const manual = cloneTheme(); const ai = cloneTheme(); ai.colors.primary = "#A14D3A";
  fs.writeFileSync(path.join(stateDir, "theme.json"), JSON.stringify(manual));
  fs.writeFileSync(path.join(stateDir, "manual-theme.json"), JSON.stringify(manual));
  fs.writeFileSync(path.join(stateDir, "ai-draft-theme.json"), JSON.stringify(ai));
  let writes = 0;
  const baseUrl = await start(t, { stateDir, writeTemplateProject() { writes++; return { written: [] }; } });
  const comparison = await fetch(`${baseUrl}/api/ai/comparison`).then((response) => response.json());
  const accepted = await jsonPost(`${baseUrl}/api/ai/accept`, reviewRequest(comparison)).then((response) => response.json());
  assert.deepEqual({ version: accepted.selectedVersion, themeHash: accepted.themeHash, cycleId: accepted.cycleId, reviewRevision: accepted.reviewRevision }, { version: "ai", themeHash: themeHash(ai), cycleId: comparison.cycleId, reviewRevision: comparison.reviewRevision });
  assert.deepEqual((await fetch(`${baseUrl}/api/theme?validated=1`).then((response) => response.json())).selection, { version: "ai", themeHash: themeHash(ai), cycleId: comparison.cycleId, reviewRevision: comparison.reviewRevision });
  assert.equal((await jsonPost(`${baseUrl}/api/generate`, { selectedVersion: "ai", expectedThemeHash: accepted.themeHash, cycleId: accepted.cycleId, reviewRevision: accepted.reviewRevision })).status, 200);
  assert.equal(writes, 1);
  const edited = cloneTheme(); edited.colors.primary = "#334455";
  assert.equal((await fetch(`${baseUrl}/api/theme`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(edited) })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/selection`).then((response) => response.json())).selection, null);
  assert.equal((await jsonPost(`${baseUrl}/api/generate`, { selectedVersion: "ai", expectedThemeHash: accepted.themeHash, cycleId: accepted.cycleId, reviewRevision: accepted.reviewRevision })).status, 409);
  assert.equal(writes, 1);
});

test("build rejects missing, mismatched, and corrupt selection without invoking writer or compiler", async (t) => {
  const stateDir = tempDir("bf-selection-reject-"); const manual = cloneTheme();
  fs.writeFileSync(path.join(stateDir, "theme.json"), JSON.stringify(manual));
  fs.writeFileSync(path.join(stateDir, "manual-theme.json"), JSON.stringify(manual));
  let writes = 0; let compiles = 0;
  const baseUrl = await start(t, { stateDir, writeTemplateProject() { writes++; return { written: [] }; }, compileTemplate() { compiles++; return { ok: true }; } });
  const baseline = await fetch(`${baseUrl}/api/manual-baseline`, { method: "POST" }).then((response) => response.json());
  const selected = await jsonPost(`${baseUrl}/api/ai/restore`, reviewRequest(baseline)).then((response) => response.json());
  for (const body of [{}, { selectedVersion: "ai", expectedThemeHash: selected.themeHash }, { selectedVersion: "manual", expectedThemeHash: "f".repeat(64) }]) {
    assert.equal((await jsonPost(`${baseUrl}/api/compile`, { ...body, cycleId: selected.cycleId, reviewRevision: selected.reviewRevision })).status, 409);
  }
  fs.writeFileSync(path.join(stateDir, "selection.json"), "{broken", "utf8");
  assert.equal((await jsonPost(`${baseUrl}/api/generate`, { selectedVersion: "manual", expectedThemeHash: selected.themeHash })).status, 409);
  assert.equal(writes, 0); assert.equal(compiles, 0);
  assert.equal((await fetch(`${baseUrl}/api/theme?validated=1`).then((response) => response.json())).selection, null);
});

test("manual preview chooses current edits or frozen baseline by expected hash", async (t) => {
  const stateDir = tempDir("bf-manual-preview-");
  const baseline = cloneTheme(); baseline.identity.title = "Frozen baseline";
  const current = cloneTheme(); current.identity.title = "Current manual edit";
  fs.writeFileSync(path.join(stateDir, "manual-theme.json"), JSON.stringify(baseline));
  fs.writeFileSync(path.join(stateDir, "theme.json"), JSON.stringify(current));
  const compiled = [];
  const previewCache = { async compile(input) { compiled.push(input.theme.identity.title); const hash = input.resolvedBundle.design.source.themeHash; return { status: "ready", cached: false, cacheKey: `${hash}-v1`, themeHash: hash, pdfAvailable: false, sourceVersion: "manual" }; }, readPdf() { return null; } };
  const baseUrl = await start(t, { stateDir, previewCache });
  for (const expectedThemeHash of [themeHash(current), themeHash(baseline)]) assert.equal((await jsonPost(`${baseUrl}/api/preview/compile`, { source: "manual", expectedThemeHash })).status, 200);
  assert.deepEqual(compiled, ["Current manual edit", "Frozen baseline"]);
});

test("corrupt manual or AI selection sources never replace the current theme", async (t) => {
  const stateDir = tempDir("bf-selection-corrupt-source-"); const current = cloneTheme();
  fs.writeFileSync(path.join(stateDir, "theme.json"), JSON.stringify(current));
  fs.writeFileSync(path.join(stateDir, "manual-theme.json"), "{}");
  fs.writeFileSync(path.join(stateDir, "ai-draft-theme.json"), "{}");
  const baseUrl = await start(t, { stateDir });
  assert.equal((await jsonPost(`${baseUrl}/api/ai/accept`, { expectedThemeHash: themeHash(current) })).status, 409);
  assert.deepEqual(await fetch(`${baseUrl}/api/theme`).then((response) => response.json()), current);
  assert.equal((await jsonPost(`${baseUrl}/api/ai/restore`, { expectedThemeHash: themeHash(current) })).status, 409);
  assert.deepEqual(await fetch(`${baseUrl}/api/theme`).then((response) => response.json()), current);
});

test("accept is bound to the exact AI draft hash shown in comparison", async (t) => {
  const stateDir = tempDir("bf-reviewed-draft-"); const manual = cloneTheme();
  const reviewed = cloneTheme(); reviewed.colors.primary = "#112233";
  const replacement = cloneTheme(); replacement.colors.primary = "#445566";
  fs.writeFileSync(path.join(stateDir, "theme.json"), JSON.stringify(manual));
  fs.writeFileSync(path.join(stateDir, "manual-theme.json"), JSON.stringify(manual));
  fs.writeFileSync(path.join(stateDir, "ai-draft-theme.json"), JSON.stringify(reviewed));
  const baseUrl = await start(t, { stateDir });
  const comparison = await fetch(`${baseUrl}/api/ai/comparison`).then((response) => response.json());
  fs.writeFileSync(path.join(stateDir, "ai-draft-theme.json"), JSON.stringify(replacement));
  assert.equal((await jsonPost(`${baseUrl}/api/ai/accept`, reviewRequest(comparison))).status, 409);
  assert.deepEqual(await fetch(`${baseUrl}/api/theme`).then((response) => response.json()), manual);
});

test("accept and restore reject an identical-hash comparison from a superseded review revision", async (t) => {
  const stateDir = tempDir("bf-reviewed-revision-"); const manual = cloneTheme();
  const draft = cloneTheme(); draft.colors.primary = "#112233";
  fs.writeFileSync(path.join(stateDir, "theme.json"), JSON.stringify(manual));
  const baseUrl = await start(t, { stateDir });
  await fetch(`${baseUrl}/api/manual-baseline`, { method: "POST" });
  await jsonPost(`${baseUrl}/api/ai/import`, draft);
  const reviewed = await fetch(`${baseUrl}/api/ai/comparison`).then((response) => response.json());
  await jsonPost(`${baseUrl}/api/ai/import`, draft);
  for (const endpoint of ["accept", "restore"]) assert.equal((await jsonPost(`${baseUrl}/api/ai/${endpoint}`, reviewRequest(reviewed))).status, 409);
  assert.deepEqual(await fetch(`${baseUrl}/api/theme`).then((response) => response.json()), manual);
});

test("accept and restore require both reviewed hashes plus cycle and revision metadata", async (t) => {
  const stateDir = tempDir("bf-reviewed-contract-"); const manual = cloneTheme();
  const draft = cloneTheme(); draft.colors.primary = "#112233";
  fs.writeFileSync(path.join(stateDir, "theme.json"), JSON.stringify(manual));
  const baseUrl = await start(t, { stateDir });
  await fetch(`${baseUrl}/api/manual-baseline`, { method: "POST" });
  await jsonPost(`${baseUrl}/api/ai/import`, draft);
  const reviewed = await fetch(`${baseUrl}/api/ai/comparison`).then((response) => response.json());
  const full = reviewRequest(reviewed);
  for (const endpoint of ["accept", "restore"]) for (const field of Object.keys(full)) {
    const incomplete = { ...full }; delete incomplete[field];
    assert.equal((await jsonPost(`${baseUrl}/api/ai/${endpoint}`, incomplete)).status, 409, `${endpoint} accepted missing ${field}`);
  }
});
test("a no-op theme PUT starts a new manual cycle without deleting old AI files", async (t) => {
  const stateDir = tempDir("bf-manual-cycle-"); const manual = cloneTheme(); const draft = cloneTheme(); draft.colors.primary = "#112233";
  fs.writeFileSync(path.join(stateDir, "theme.json"), JSON.stringify(manual));
  const baseUrl = await start(t, { stateDir });
  await fetch(`${baseUrl}/api/manual-baseline`, { method: "POST" });
  await jsonPost(`${baseUrl}/api/ai/import`, draft);
  assert.equal((await fetch(`${baseUrl}/api/ai/comparison`)).status, 200);
  const oldMarker = fs.readFileSync(path.join(stateDir, "comparison-current.json"), "utf8");
  await fetch(`${baseUrl}/api/theme`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(manual) });
  fs.writeFileSync(path.join(stateDir, "comparison-current.json"), oldMarker, "utf8");
  assert.equal((await fetch(`${baseUrl}/api/ai/comparison`)).status, 409);
  assert.equal(fs.existsSync(path.join(stateDir, "ai-draft-theme.json")), true);
});

test("selection and generation are bound to the persisted manual cycle", async (t) => {
  const stateDir = tempDir("bf-selection-cycle-"); const manual = cloneTheme();
  fs.writeFileSync(path.join(stateDir, "theme.json"), JSON.stringify(manual));
  let writes = 0;
  const baseUrl = await start(t, { stateDir, writeTemplateProject() { writes++; return { written: [] }; } });
  const baseline = await fetch(`${baseUrl}/api/manual-baseline`, { method: "POST" }).then((response) => response.json());
  const selected = await jsonPost(`${baseUrl}/api/ai/restore`, reviewRequest(baseline)).then((response) => response.json());
  assert.match(selected.cycleId, /^[a-f0-9-]{36}$/);
  assert.equal(selected.reviewRevision, baseline.reviewRevision);
  assert.equal((await jsonPost(`${baseUrl}/api/generate`, { selectedVersion: selected.selectedVersion, expectedThemeHash: selected.themeHash, cycleId: selected.cycleId, reviewRevision: selected.reviewRevision })).status, 200);
  assert.equal((await jsonPost(`${baseUrl}/api/generate`, { selectedVersion: selected.selectedVersion, expectedThemeHash: selected.themeHash, cycleId: "00000000-0000-4000-8000-000000000000", reviewRevision: selected.reviewRevision })).status, 409);
  assert.equal(writes, 1);
});

test("a selection from a superseded review revision stays invalid after restart recovery", async (t) => {
  const stateDir = tempDir("bf-selection-revision-"); const manual = cloneTheme();
  fs.writeFileSync(path.join(stateDir, "theme.json"), JSON.stringify(manual));
  let writes = 0;
  const baseUrl = await start(t, { stateDir, writeTemplateProject() { writes++; return { written: [] }; } });
  const firstBaseline = await fetch(`${baseUrl}/api/manual-baseline`, { method: "POST" }).then((response) => response.json());
  const selected = await jsonPost(`${baseUrl}/api/ai/restore`, reviewRequest(firstBaseline)).then((response) => response.json());
  const staleSelection = fs.readFileSync(path.join(stateDir, "selection.json"), "utf8");

  const secondBaseline = await fetch(`${baseUrl}/api/manual-baseline`, { method: "POST" }).then((response) => response.json());
  assert.notEqual(secondBaseline.reviewRevision, firstBaseline.reviewRevision);
  fs.writeFileSync(path.join(stateDir, "selection.json"), staleSelection, "utf8");

  assert.equal((await fetch(`${baseUrl}/api/theme?validated=1`).then((response) => response.json())).selection, null);
  assert.equal((await jsonPost(`${baseUrl}/api/generate`, {
    selectedVersion: selected.selectedVersion,
    expectedThemeHash: selected.themeHash,
    cycleId: selected.cycleId,
    reviewRevision: selected.reviewRevision
  })).status, 409);
  assert.equal(writes, 0);
});
test("corrupt frozen baseline does not block previewing the valid current manual theme", async (t) => {
  const stateDir = tempDir("bf-current-preview-corrupt-baseline-"); const current = cloneTheme();
  fs.writeFileSync(path.join(stateDir, "theme.json"), JSON.stringify(current));
  fs.writeFileSync(path.join(stateDir, "manual-theme.json"), "{}");
  const hash = themeHash(current);
  const previewCache = { async compile(input) { return { status: "ready", cached: false, cacheKey: `${hash}-v1`, themeHash: hash, pdfAvailable: false, sourceVersion: input.sourceVersion }; }, readPdf() { return null; } };
  const baseUrl = await start(t, { stateDir, previewCache });
  assert.equal((await jsonPost(`${baseUrl}/api/preview/compile`, { source: "manual", expectedThemeHash: hash })).status, 200);
});
