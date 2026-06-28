const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createWorkbenchServer } = require("../workbench/server");
const { DEFAULT_THEME } = require("../schema/theme-schema");
const { writeTemplateProject: realWriteTemplateProject } = require("../generators/project-writer");

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

test("server exposes registry options and default theme", async (t) => {
  const stateDir = tempDir("beamerforge-server-");
  const baseUrl = await withServer(t, { stateDir });

  const options = await fetch(`${baseUrl}/api/options`).then((response) => response.json());
  assert.equal(options.palettes["academic-blue"].label, "Academic Blue");

  const theme = await fetch(`${baseUrl}/api/theme`).then((response) => response.json());
  assert.deepEqual(theme, DEFAULT_THEME);
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

test("default public directory serves index.html at root", async (t) => {
  const stateDir = tempDir("beamerforge-server-");
  const baseUrl = await withServer(t, { stateDir });

  const response = await fetch(`${baseUrl}/`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(body, /BeamerForge Workbench/);
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
