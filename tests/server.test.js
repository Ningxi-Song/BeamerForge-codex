const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createWorkbenchServer } = require("../workbench/server");
const { DEFAULT_THEME } = require("../schema/theme-schema");
const { getRegistry } = require("../registry/options");
const { resolveDesign } = require("../design/resolve-design");
const { writeTemplateProject: realWriteTemplateProject } = require("../generators/project-writer");
const duck = require("../elements/decorations/logos/duck-vector");
const { renderSvg } = require("../design/vector-renderers");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function withServer(t, options = {}) {
  const server = createWorkbenchServer({ rootDir: process.cwd(), ...options });
  t.after(() => close(server));
  const port = await listen(server);
  return `http://127.0.0.1:${port}`;
}

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cloneTheme() {
  return JSON.parse(JSON.stringify(DEFAULT_THEME));
}

function expectedHash(theme = DEFAULT_THEME) { return resolveDesign(theme, getRegistry()).source.themeHash; }
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }

test("preview compile rejects stale expected hashes before invoking the cache", async (t) => {
  const stateDir = tempDir("beamerforge-server-"); fs.mkdirSync(stateDir, { recursive: true });
  const original = cloneTheme();
  const changed = cloneTheme(); changed.identity.title = "Changed in another tab";
  fs.writeFileSync(path.join(stateDir, "theme.json"), JSON.stringify(changed));
  fs.writeFileSync(path.join(stateDir, "manual-theme.json"), JSON.stringify(changed));
  fs.writeFileSync(path.join(stateDir, "ai-draft-theme.json"), JSON.stringify(changed));
  let compiles = 0;
  const previewCache = { async compile() { compiles++; return {}; }, readPdf() { return null; } };
  const baseUrl = await withServer(t, { stateDir, previewCache });
  for (const source of ["manual", "ai", "selected"]) {
    const response = await fetch(`${baseUrl}/api/preview/compile`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source, expectedThemeHash: expectedHash(original) }) });
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /changed.*refresh/i);
  }
  assert.equal(compiles, 0);
});

test("default preview compilation does not block unrelated theme requests", async (t) => {
  const stateDir = tempDir("beamerforge-server-");
  const started = deferred(); const release = deferred();
  const baseUrl = await withServer(t, {
    stateDir,
    previewProjectWriter(theme, target) { fs.writeFileSync(path.join(target, "main.tex"), theme.identity.title); },
    async previewCompiler(target) { started.resolve(); await release.promise; fs.writeFileSync(path.join(target, "main.pdf"), "%PDF"); return { ok: true, compilerKind: "fake" }; }
  });
  const compilePromise = fetch(`${baseUrl}/api/preview/compile`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: "selected", expectedThemeHash: expectedHash() }) });
  await started.promise;
  const themeResponse = await fetch(`${baseUrl}/api/theme`);
  assert.equal(themeResponse.status, 200);
  release.resolve();
  assert.equal((await compilePromise).status, 200);
});

test("POST /api/preview/compile compiles the requested manual source and returns a browser-safe PDF URL", async (t) => {
  const stateDir = tempDir("beamerforge-server-");
  const current = cloneTheme();
  current.identity.name = "current-theme";
  fs.writeFileSync(path.join(stateDir, "theme.json"), `${JSON.stringify(current, null, 2)}\n`, "utf8");
  const calls = [];
  const previewCache = {
    async compile(input) {
      calls.push(input);
      return {
        status: "ready", cached: false, cacheKey: `${expectedHash(current)}-v1`, themeHash: expectedHash(current), pdfAvailable: true,
        compilerKind: "xelatex", completedAt: "2026-07-12T01:02:03.000Z", sourceVersion: "manual",
        pdfPath: "C:\\private\\main.pdf"
      };
    },
    resolvePdf() { return null; }
  };
  const baseUrl = await withServer(t, { stateDir, previewCache });

  const response = await fetch(`${baseUrl}/api/preview/compile`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ source: "manual", force: true, expectedThemeHash: expectedHash(current) })
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].theme.identity.name, "current-theme");
  assert.equal(calls[0].sourceVersion, "manual");
  assert.equal(calls[0].force, true);
  assert.equal(body.pdfUrl, `/api/preview/${expectedHash(current)}-v1/main.pdf`);
  assert.equal(JSON.stringify(body).includes("private"), false);
  assert.deepEqual(Object.keys(body).sort(), ["cacheKey", "cached", "completedAt", "compilerKind", "pdfUrl", "sourceVersion", "status", "themeHash"].sort());
});

test("preview compile enforces source prerequisites, validates input, and keeps failures at HTTP 200", async (t) => {
  const stateDir = tempDir("beamerforge-server-");
  fs.writeFileSync(path.join(stateDir, "theme.json"), `${JSON.stringify(DEFAULT_THEME)}\n`);
  const manual = cloneTheme(); manual.identity.name = "manual-source";
  fs.writeFileSync(path.join(stateDir, "manual-theme.json"), `${JSON.stringify(manual)}\n`);
  const ai = cloneTheme(); ai.identity.name = "ai-source";
  fs.writeFileSync(path.join(stateDir, "ai-draft-theme.json"), `${JSON.stringify(ai)}\n`);
  const calls = [];
  const previewCache = {
    async compile(input) {
      calls.push(input);
      const hash = input.resolvedBundle.design.source.themeHash; const key = `${hash}-v1`;
      if (input.sourceVersion === "ai") return { status: "failed", cached: false, cacheKey: key, themeHash: hash, compilerKind: "xelatex", message: "bad", excerpt: "line 1", staleAvailable: true };
      return { status: "unavailable", cached: false, cacheKey: key, themeHash: hash, compilerKind: "missing", message: "Install LaTeX", staleAvailable: false };
    }, resolvePdf() { return null; }
  };
  const baseUrl = await withServer(t, { stateDir, previewCache });
  const hashes = { manual: expectedHash(manual), ai: expectedHash(ai), selected: expectedHash(DEFAULT_THEME) };
  const post = (body) => fetch(`${baseUrl}/api/preview/compile`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  for (const source of ["manual", "ai", "selected"]) {
    const response = await post({ source, expectedThemeHash: hashes[source] });
    assert.equal(response.status, 200);
    const body = await response.json();
    if (source === "ai") assert.equal(body.stalePdfUrl, `/api/preview/${hashes.ai}-v1/main.pdf`);
    else assert.equal(body.status, "unavailable");
  }
  assert.deepEqual(calls.map((call) => call.theme.identity.name), ["manual-source", "ai-source", DEFAULT_THEME.identity.name]);
  assert.deepEqual(calls.map((call) => call.force), [false, false, false]);
  for (const invalid of [{}, { source: "bogus", expectedThemeHash: hashes.manual }, { source: "manual", force: 1, expectedThemeHash: hashes.manual }, { source: "manual", expectedThemeHash: "BAD" }]) {
    assert.equal((await post(invalid)).status, 400);
  }

  fs.rmSync(path.join(stateDir, "ai-draft-theme.json"));
  assert.equal((await post({ source: "ai", expectedThemeHash: hashes.ai })).status, 409);
  fs.writeFileSync(path.join(stateDir, "ai-draft-theme.json"), "{}\n");
  assert.equal((await post({ source: "ai", expectedThemeHash: hashes.ai })).status, 409);
});

test("GET authoritative preview serves only resolved PDFs with inline no-store headers", async (t) => {
  const stateDir = tempDir("beamerforge-server-");
  const pdfPath = path.join(stateDir, "served.pdf");
  const bytes = Buffer.from("%PDF-1.4\npreview\n");
  fs.writeFileSync(pdfPath, bytes);
  const key = `${"c".repeat(64)}-v1`;
  const resolved = [];
  const previewCache = { compile() {}, readPdf(value) { resolved.push(value); return value === key ? bytes : null; }, resolvePdf() { throw new Error("server must not resolve paths"); } };
  const baseUrl = await withServer(t, { stateDir, previewCache });

  const response = await fetch(`${baseUrl}/api/preview/${key}/main.pdf`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.equal(response.headers.get("content-disposition"), "inline");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  for (const bad of ["invalid", "%2e%2e%2fsecret", `${"d".repeat(64)}-v1`]) {
    assert.equal((await fetch(`${baseUrl}/api/preview/${bad}/main.pdf`)).status, 404);
  }
  assert.equal(resolved.includes("../secret"), true);
});

test("preview cache rejections return a generic error without internal paths", async (t) => {
  const stateDir = tempDir("beamerforge-server-");
  const previewCache = { async compile() { throw new Error("C:\\secret\\cache failure"); }, readPdf() { throw new Error("C:\\secret"); } };
  const baseUrl = await withServer(t, { stateDir, previewCache });
  const response = await fetch(`${baseUrl}/api/preview/compile`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: "selected", expectedThemeHash: expectedHash() }) });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { ok: false, error: "Unable to compile preview" });
  const pdfResponse = await fetch(`${baseUrl}/api/preview/${"e".repeat(64)}-v1/main.pdf`);
  assert.equal(pdfResponse.status, 500);
  assert.deepEqual(await pdfResponse.json(), { ok: false, error: "Unable to load preview" });
});

test("preview API sanitizes injected diagnostics and rejects mismatched cache DTO hashes", async (t) => {
  const stateDir = tempDir("beamerforge-server-"); const hash = expectedHash();
  let mismatch = false;
  const previewCache = { async compile() {
    if (mismatch) return { status: "ready", themeHash: "f".repeat(64), cacheKey: `${hash}-v1`, pdfAvailable: true };
    return { status: "failed", themeHash: hash, cacheKey: `${hash}-v1`, message: `C:\\private\\cache\u0000`, excerpt: "/secret/root/main.tex" };
  }, readPdf() { return null; } };
  const baseUrl = await withServer(t, { stateDir, previewCache });
  const request = () => fetch(`${baseUrl}/api/preview/compile`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: "selected", expectedThemeHash: hash }) });
  const safe = await request(); const body = await safe.json();
  assert.equal(safe.status, 200); assert.doesNotMatch(JSON.stringify(body), /private|secret|main\.tex/i);
  mismatch = true; const rejected = await request();
  assert.equal(rejected.status, 500); assert.deepEqual(await rejected.json(), { ok: false, error: "Unable to compile preview" });
});

test("malformed manual and AI preview state returns prerequisite conflicts", async (t) => {
  const stateDir = tempDir("beamerforge-server-"); fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, "manual-theme.json"), "{"); fs.writeFileSync(path.join(stateDir, "ai-draft-theme.json"), "{");
  const previewCache = { compile() { throw new Error("must not compile"); }, readPdf() { return null; } };
  const baseUrl = await withServer(t, { stateDir, previewCache });
  for (const source of ["manual", "ai"]) {
    const response = await fetch(`${baseUrl}/api/preview/compile`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source, expectedThemeHash: expectedHash() }) });
    assert.equal(response.status, 409); assert.doesNotMatch(JSON.stringify(await response.json()), /stateDir|manual-theme|ai-draft|[A-Z]:\\/i);
  }
});

test("server creates one default preview cache at the configured root", async (t) => {
  const stateDir = tempDir("beamerforge-server-");
  const previewCacheRoot = path.join(stateDir, "custom-preview-cache");
  let writes = 0;
  let compiles = 0;
  const baseUrl = await withServer(t, {
    stateDir, previewCacheRoot,
    previewProjectWriter(theme, target) { writes++; fs.writeFileSync(path.join(target, "main.tex"), theme.identity.name); },
    async previewCompiler(target) { compiles++; fs.writeFileSync(path.join(target, "main.pdf"), "%PDF-1.4\n"); return { ok: true, compilerKind: "fake" }; }
  });
  const request = () => fetch(`${baseUrl}/api/preview/compile`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: "selected", expectedThemeHash: expectedHash() }) });
  const first = await request();
  const second = await request();
  assert.equal(first.status, 200);
  assert.equal((await first.json()).status, "ready");
  assert.equal((await second.json()).cached, true);
  assert.equal(writes, 1);
  assert.equal(compiles, 1);
  assert.equal(fs.existsSync(previewCacheRoot), true);
});

test("server exposes registry options and default theme", async (t) => {
  const stateDir = tempDir("beamerforge-server-");
  const baseUrl = await withServer(t, { stateDir });

  const options = await fetch(`${baseUrl}/api/options`).then((response) => response.json());
  assert.equal(options.palettes["academic-blue"].label, "Academic Blue");

  const theme = await fetch(`${baseUrl}/api/theme`).then((response) => response.json());
  assert.deepEqual(theme, DEFAULT_THEME);

  const validated = await fetch(`${baseUrl}/api/theme?validated=1`).then((response) => response.json());
  assert.equal(validated.ok, true);
  assert.equal(validated.valid, true);
  assert.deepEqual(validated.theme, DEFAULT_THEME);
  assert.deepEqual(validated.errors, []);
});

test("GET /api/theme validated mode reports persisted schema errors", async (t) => {
  const stateDir = tempDir("beamerforge-server-");
  fs.mkdirSync(stateDir, { recursive: true });
  const broken = cloneTheme();
  delete broken.identity;
  broken.colors.background = "not-a-color";
  broken.contentDefaults.sampleBullets = { bad: true };
  fs.writeFileSync(path.join(stateDir, "theme.json"), `${JSON.stringify(broken, null, 2)}\n`, "utf8");
  const baseUrl = await withServer(t, { stateDir });

  const response = await fetch(`${baseUrl}/api/theme?validated=1`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.valid, false);
  const errorPaths = body.errors.map((error) => error.path);
  assert.equal(errorPaths.includes("identity"), true);
  assert.equal(errorPaths.includes("colors.background"), true);
  assert.equal(errorPaths.includes("contentDefaults.sampleBullets"), true);
  assert.equal(body.theme.identity.name, DEFAULT_THEME.identity.name);
  assert.equal(body.theme.colors.background, "not-a-color");
  assert.deepEqual(body.theme.contentDefaults.sampleBullets, DEFAULT_THEME.contentDefaults.sampleBullets);
});

test("PUT /api/theme returns validation errors without writing state", async (t) => {
  const stateDir = tempDir("beamerforge-server-");
  const baseUrl = await withServer(t, { stateDir });
  const broken = cloneTheme();
  broken.identity.name = "Bad Name With Spaces";

  const response = await fetch(`${baseUrl}/api/theme`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(broken)
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.ok, false);
  assert.deepEqual(body.errors.map((error) => error.path), ["identity.name"]);
  assert.equal(fs.existsSync(path.join(stateDir, "theme.json")), false);
});

test("PUT /api/theme persists a valid theme", async (t) => {
  const stateDir = tempDir("beamerforge-server-");
  const baseUrl = await withServer(t, { stateDir });
  const next = cloneTheme();
  next.identity.name = "server-theme";

  const response = await fetch(`${baseUrl}/api/theme`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(next)
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.theme.identity.name, "server-theme");

  const saved = JSON.parse(fs.readFileSync(path.join(stateDir, "theme.json"), "utf8"));
  assert.equal(saved.identity.name, "server-theme");
});

test("POST /api/design/resolve returns a resolved design without persisting the theme", async (t) => {
  const stateDir = tempDir("beamerforge-server-");
  const baseUrl = await withServer(t, { stateDir });

  const response = await fetch(`${baseUrl}/api/design/resolve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(DEFAULT_THEME)
  });
  const design = await response.json();

  assert.equal(response.status, 200);
  assert.equal(design.colors.primary, DEFAULT_THEME.colors.primary);
  assert.equal(design.components.bullet.id, DEFAULT_THEME.bullets.style);
  assert.match(design.source.themeHash, /^[a-f0-9]{64}$/);
  assert.equal(fs.existsSync(path.join(stateDir, "theme.json")), false);
});

test("POST /api/design/resolve reports actionable validation errors", async (t) => {
  const stateDir = tempDir("beamerforge-server-");
  const baseUrl = await withServer(t, { stateDir });
  const broken = cloneTheme();
  broken.navigation.style = "missing-navigation";

  const response = await fetch(`${baseUrl}/api/design/resolve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(broken)
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.ok, false);
  assert.equal(body.errors.some((error) => error.path === "navigation.style"), true);
});

test("server construction intentionally rejects malformed registry contracts", () => {
  const stateDir = tempDir("beamerforge-server-");
  const registry = getRegistry();
  delete registry.bullets[DEFAULT_THEME.bullets.style].marker;
  assert.throws(() => createWorkbenchServer({ rootDir: process.cwd(), stateDir, registry }), /Invalid registry renderer contract.*bullets/i);
});

test("POST /api/design/resolve retains JSON body error behavior", async (t) => {
  const stateDir = tempDir("beamerforge-server-");
  const baseUrl = await withServer(t, { stateDir });

  const invalid = await fetch(`${baseUrl}/api/design/resolve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{"
  });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error, "Invalid JSON request body");

  const oversized = await fetch(`${baseUrl}/api/design/resolve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: `{"payload":"${"x".repeat(1024 * 1024)}"}`
  });
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).error, "Request body too large");
});

test("POST /api/generate writes a template and passes outputRoot guard options", async (t) => {
  const stateDir = tempDir("beamerforge-server-");
  const outputRoot = tempDir("beamerforge-output-");
  let observedOutputRoot = null;
  const baseUrl = await withServer(t, {
    stateDir,
    outputRoot,
    writeTemplateProject(theme, templateDir, options) {
      observedOutputRoot = options.outputRoot;
      return realWriteTemplateProject(theme, templateDir, options);
    }
  });

  const response = await fetch(`${baseUrl}/api/generate`, { method: "POST" });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.status, "generated");
  assert.equal(observedOutputRoot, outputRoot);
  assert.equal(body.templateDir, path.join(outputRoot, DEFAULT_THEME.identity.name));
  assert.equal(fs.existsSync(path.join(body.templateDir, "main.tex")), true);

  const status = await fetch(`${baseUrl}/api/build-status`).then((item) => item.json());
  assert.equal(status.status, "generated");
  assert.equal(status.templateDir, body.templateDir);
});

test("POST /api/compile creates a missing project, persists success, and returns 200", async (t) => {
  const stateDir = tempDir("beamerforge-server-");
  const outputRoot = tempDir("beamerforge-output-");
  const baseUrl = await withServer(t, {
    stateDir,
    outputRoot,
    writeTemplateProject(theme, templateDir, options) {
      assert.equal(options.outputRoot, outputRoot);
      fs.mkdirSync(templateDir, { recursive: true });
      const mainPath = path.join(templateDir, "main.tex");
      fs.writeFileSync(mainPath, `% ${theme.identity.name}\n`, "utf8");
      return { templateDir, written: [mainPath], copiedAssets: [] };
    },
    compileTemplate(templateDir) {
      return {
        ok: true,
        status: "compiled",
        message: "fake compile ok",
        pdfPath: path.join(templateDir, "main.pdf")
      };
    }
  });

  const response = await fetch(`${baseUrl}/api/compile`, { method: "POST" });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "compiled");
  assert.equal(fs.existsSync(path.join(outputRoot, DEFAULT_THEME.identity.name, "main.tex")), true);

  const status = await fetch(`${baseUrl}/api/build-status`).then((item) => item.json());
  assert.equal(status.status, "compiled");
  assert.equal(status.message, "fake compile ok");
});

test("POST /api/compile regenerates the project after a saved theme change", async (t) => {
  const stateDir = tempDir("beamerforge-server-");
  const outputRoot = tempDir("beamerforge-output-");
  const baseUrl = await withServer(t, {
    stateDir,
    outputRoot,
    writeTemplateProject: realWriteTemplateProject,
    compileTemplate(templateDir) {
      const classFile = fs.readFileSync(path.join(templateDir, "theme.cls"), "utf8");
      return {
        ok: classFile.includes("\\blacktriangleright"),
        status: classFile.includes("\\blacktriangleright") ? "compiled" : "compile-failed",
        message: "fake compile checked current theme"
      };
    }
  });

  await fetch(`${baseUrl}/api/generate`, { method: "POST" });
  const next = cloneTheme();
  next.bullets.style = "triangle";

  await fetch(`${baseUrl}/api/theme`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(next)
  });
  const response = await fetch(`${baseUrl}/api/compile`, { method: "POST" });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "compiled");
});

test("POST /api/compile persists failures and returns 500", async (t) => {
  const stateDir = tempDir("beamerforge-server-");
  const outputRoot = tempDir("beamerforge-output-");
  const baseUrl = await withServer(t, {
    stateDir,
    outputRoot,
    writeTemplateProject(theme, templateDir) {
      fs.mkdirSync(templateDir, { recursive: true });
      const mainPath = path.join(templateDir, "main.tex");
      fs.writeFileSync(mainPath, "% compile target\n", "utf8");
      return { templateDir, written: [mainPath], copiedAssets: [] };
    },
    compileTemplate() {
      return {
        ok: false,
        status: "compile-failed",
        message: "fake compile failed",
        excerpt: "failure excerpt"
      };
    }
  });

  const response = await fetch(`${baseUrl}/api/compile`, { method: "POST" });
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.status, "compile-failed");

  const status = await fetch(`${baseUrl}/api/build-status`).then((item) => item.json());
  assert.equal(status.status, "compile-failed");
  assert.equal(status.excerpt, "failure excerpt");
});

test("POST /api/compile rejects malicious persisted theme before invoking compiler", async (t) => {
  const stateDir = tempDir("beamerforge-server-");
  const outputRoot = tempDir("beamerforge-output-");
  const outsideDir = tempDir("beamerforge-outside-");
  const malicious = cloneTheme();
  malicious.identity.name = `..${path.sep}${path.basename(outsideDir)}`;
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, "theme.json"), `${JSON.stringify(malicious, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outsideDir, "main.tex"), "% outside target\n", "utf8");
  let compilerCalled = false;

  const baseUrl = await withServer(t, {
    stateDir,
    outputRoot,
    compileTemplate() {
      compilerCalled = true;
      return { ok: true, status: "compiled" };
    }
  });

  const response = await fetch(`${baseUrl}/api/compile`, { method: "POST" });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.ok, false);
  assert.equal(compilerCalled, false);
});

test("static files map / to index.html and reject traversal", async (t) => {
  const stateDir = tempDir("beamerforge-server-");
  const staticRoot = tempDir("beamerforge-public-");
  const outsideFile = path.join(path.dirname(staticRoot), "secret.txt");
  fs.writeFileSync(path.join(staticRoot, "index.html"), "<h1>Workbench</h1>", "utf8");
  fs.writeFileSync(outsideFile, "secret", "utf8");
  const baseUrl = await withServer(t, { stateDir, publicDir: staticRoot });

  const index = await fetch(`${baseUrl}/`);
  assert.equal(index.status, 200);
  assert.equal(await index.text(), "<h1>Workbench</h1>");

  const traversal = await fetch(`${baseUrl}/..%5c${path.basename(outsideFile)}`);
  assert.equal(traversal.status, 404);
  assert.notEqual(await traversal.text(), "secret");
});

test("server serves read-only local font assets and rejects asset traversal", async (t) => {
  const stateDir = tempDir("beamerforge-server-");
  const baseUrl = await withServer(t, { stateDir });

  const fontResponse = await fetch(`${baseUrl}/assets/elements/fonts/local/Lato.ttf`);
  const fontBytes = Buffer.from(await fontResponse.arrayBuffer());
  assert.equal(fontResponse.status, 200);
  assert.equal(fontResponse.headers.get("content-type"), "font/ttf");
  assert.equal(fontBytes.length > 1000, true);

  const traversal = await fetch(`${baseUrl}/assets/..%5cpackage.json`);
  assert.equal(traversal.status, 404);

  const packageFile = await fetch(`${baseUrl}/assets/package.json`);
  assert.equal(packageFile.status, 404);

  const gitConfig = await fetch(`${baseUrl}/assets/.git/config`);
  assert.equal(gitConfig.status, 404);
});

test("server generates only registered vector logo SVG routes", async (t) => {
  const stateDir = tempDir("beamerforge-server-");
  const baseUrl = await withServer(t, { stateDir });

  const response = await fetch(`${baseUrl}/assets/generated/logos/duck.svg`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/svg+xml");
  assert.equal(body, renderSvg(duck));

  for (const route of [
    "/assets/generated/logos/missing.svg",
    "/assets/generated/logos/duck.svg/extra",
    "/assets/generated/logos/..%2fduck.svg",
    "/assets/generated/logos/%2e%2e%5cduck.svg"
  ]) assert.equal((await fetch(`${baseUrl}${route}`)).status, 404, route);
});

test("default public directory serves index.html at root", async (t) => {
  const stateDir = tempDir("beamerforge-server-");
  const baseUrl = await withServer(t, { stateDir });

  const response = await fetch(`${baseUrl}/`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(body, /id="wizardApp"/);
});

test("PUT /api/theme rejects bodies over 1MB without writing state", async (t) => {
  const stateDir = tempDir("beamerforge-server-");
  const baseUrl = await withServer(t, { stateDir });
  const oversized = `{"payload":"${"x".repeat(1024 * 1024)}"}`;

  const response = await fetch(`${baseUrl}/api/theme`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: oversized
  });
  const body = await response.json();

  assert.equal(response.status, 413);
  assert.equal(body.ok, false);
  assert.equal(fs.existsSync(path.join(stateDir, "theme.json")), false);
});

test("serves the wizard shell for client-side wizard routes", async (t) => {
  const stateDir = tempDir("beamerforge-server-");
  const staticRoot = tempDir("beamerforge-public-");
  fs.writeFileSync(path.join(staticRoot, "index.html"), '<main id="wizardApp">Wizard</main>', "utf8");
  const baseUrl = await withServer(t, { stateDir, publicDir: staticRoot });

  for (const route of [
    "/start",
    "/color",
    "/font",
    "/bullets",
    "/blocks",
    "/navigation",
    "/title-page",
    "/review"
  ]) {
    const response = await fetch(`${baseUrl}${route}`);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /id="wizardApp"/);
  }
});

test("manual baseline and AI draft APIs preserve explicit selection", async (t) => {
  const stateDir = tempDir("beamerforge-ai-server-");
  const handoffRoot = path.join(stateDir, "ai-handoff");
  const baseUrl = await withServer(t, { stateDir, handoffRoot });

  const saved = cloneTheme();
  saved.identity.name = "manual-baseline";
  await fetch(`${baseUrl}/api/theme`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(saved)
  });

  let response = await fetch(`${baseUrl}/api/manual-baseline`, { method: "POST" });
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(stateDir, "manual-theme.json"))), saved);

  const form = new FormData();
  form.set("brief", "Make it warmer");
  form.set("relativePaths", "[]");
  response = await fetch(`${baseUrl}/api/ai/handoff`, { method: "POST", body: form });
  assert.equal(response.status, 200);
  assert.equal(fs.existsSync(path.join(handoffRoot, "instructions.md")), true);

  const draft = cloneTheme();
  draft.identity.name = "manual-baseline";
  draft.colors.primary = "#A14D3A";
  response = await fetch(`${baseUrl}/api/ai/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(draft)
  });
  assert.equal(response.status, 200);

  response = await fetch(`${baseUrl}/api/ai/comparison`);
  const comparison = await response.json();
  assert.equal(response.status, 200);
  assert.equal(comparison.changes.some((change) => change.path === "colors.primary"), true);

  response = await fetch(`${baseUrl}/api/ai/accept`, { method: "POST" });
  assert.equal(response.status, 200);
  assert.equal((await fetch(`${baseUrl}/api/theme`).then((result) => result.json())).colors.primary, "#A14D3A");

  response = await fetch(`${baseUrl}/api/ai/restore`, { method: "POST" });
  assert.equal(response.status, 200);
  assert.equal((await fetch(`${baseUrl}/api/theme`).then((result) => result.json())).colors.primary, saved.colors.primary);
});

test("AI phase endpoints reject missing prerequisites", async (t) => {
  const stateDir = tempDir("beamerforge-ai-server-");
  const baseUrl = await withServer(t, { stateDir });
  assert.equal((await fetch(`${baseUrl}/api/manual-baseline`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/ai/comparison`)).status, 409);
  assert.equal((await fetch(`${baseUrl}/api/ai/accept`, { method: "POST" })).status, 409);
});
