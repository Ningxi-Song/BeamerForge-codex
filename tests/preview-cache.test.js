"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DEFAULT_THEME, validateTheme } = require("../schema/theme-schema");
const { getRegistry } = require("../registry/options");
const { resolveDesign, resolveDesignBundle } = require("../design/resolve-design");
const { createPreviewCache, isSafeCacheKey } = require("../workbench/preview-cache");

function tempDir(prefix = "beamerforge-preview-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cloneTheme() {
  return structuredClone(DEFAULT_THEME);
}

function fakeWriter(theme, templateDir) {
  fs.mkdirSync(templateDir, { recursive: true });
  fs.writeFileSync(path.join(templateDir, "main.tex"), theme.identity.title, "utf8");
}

function pdfCompiler(contents, onCompile = () => {}) {
  return async (templateDir) => {
    onCompile(templateDir);
    fs.writeFileSync(path.join(templateDir, "main.pdf"), contents, "utf8");
    return { ok: true, status: "compiled", compilerKind: "fake" };
  };
}

function createService(overrides = {}) {
  return createPreviewCache({
    cacheRoot: tempDir(),
    rootDir: process.cwd(),
    registry: getRegistry(),
    projectWriter: fakeWriter,
    compiler: pdfCompiler("pdf"),
    now: () => new Date("2026-07-12T00:00:00.000Z"),
    ...overrides
  });
}

test("identical normalized designs compile once despite different source versions", async () => {
  let compiles = 0;
  const cacheRoot = tempDir();
  const service = createService({
    cacheRoot,
    compiler: pdfCompiler("first", () => { compiles += 1; })
  });

  const first = await service.compile({ theme: cloneTheme(), sourceVersion: "manual" });
  const second = await service.compile({ theme: cloneTheme(), sourceVersion: "selected" });

  assert.equal(first.status, "ready");
  assert.equal(first.cached, false);
  assert.equal(second.status, "ready");
  assert.equal(second.cached, true);
  assert.equal(first.cacheKey, second.cacheKey);
  assert.equal(second.sourceVersion, "manual");
  assert.equal(compiles, 1);
  const metadata = JSON.parse(fs.readFileSync(path.join(cacheRoot, first.cacheKey, "metadata.json"), "utf8"));
  assert.equal(metadata.sourceVersion, "manual");
  assert.equal(Object.hasOwn(metadata, "pdfPath"), false);
});

test("default project writer reuses the cache service resolved bundle", async () => {
  const cacheRoot = tempDir();
  let resolutions = 0;
  const service = createPreviewCache({
    cacheRoot,
    rootDir: process.cwd(),
    registry: getRegistry(),
    resolveDesignBundle(theme, registry) {
      resolutions += 1;
      return resolveDesignBundle(theme, registry);
    },
    compiler: pdfCompiler("real writer")
  });

  const result = await service.compile({ theme: cloneTheme(), sourceVersion: "manual" });

  assert.equal(result.status, "ready");
  assert.equal(resolutions, 1);
  assert.equal(fs.existsSync(path.join(cacheRoot, result.cacheKey, "theme.json")), true);
});

test("sparse legacy and explicit normalized themes share one cache entry", async () => {
  let compiles = 0;
  const sparse = cloneTheme();
  delete sparse.identity.subtitle;
  delete sparse.colors.blockBody;
  delete sparse.colors.alert;
  delete sparse.contentDefaults.sampleBullets;
  const normalized = validateTheme(sparse, { registry: getRegistry() }).value;
  const service = createService({ compiler: pdfCompiler("same", () => { compiles += 1; }) });

  const first = await service.compile({ theme: sparse, sourceVersion: "legacy" });
  const second = await service.compile({ theme: normalized, sourceVersion: "normalized" });

  assert.equal(first.cacheKey, second.cacheKey);
  assert.equal(second.cached, true);
  assert.equal(compiles, 1);
});

test("generator version changes the key and causes a compile", async () => {
  const cacheRoot = tempDir();
  let compiles = 0;
  const options = {
    cacheRoot,
    rootDir: process.cwd(),
    registry: getRegistry(),
    projectWriter: fakeWriter,
    compiler: pdfCompiler("versioned", () => { compiles += 1; })
  };
  const v1 = createPreviewCache({ ...options, generatorVersion: "one" });
  const v2 = createPreviewCache({ ...options, generatorVersion: "two" });

  const first = await v1.compile({ theme: cloneTheme(), sourceVersion: "manual" });
  const second = await v2.compile({ theme: cloneTheme(), sourceVersion: "manual" });

  assert.notEqual(first.cacheKey, second.cacheKey);
  assert.match(first.cacheKey, /-one$/);
  assert.match(second.cacheKey, /-two$/);
  assert.equal(compiles, 2);
});

test("concurrent same-key requests, including forced requests, share one promise", async () => {
  let release;
  let compiles = 0;
  const compiler = async (templateDir) => {
    compiles += 1;
    await new Promise((resolve) => { release = resolve; });
    fs.writeFileSync(path.join(templateDir, "main.pdf"), "concurrent");
    return { ok: true, status: "compiled", compilerKind: "fake" };
  };
  const service = createService({ compiler });

  const first = service.compile({ theme: cloneTheme(), sourceVersion: "one", force: true });
  const second = service.compile({ theme: cloneTheme(), sourceVersion: "two", force: true });
  assert.strictEqual(first, second);
  await new Promise((resolve) => setImmediate(resolve));
  release();
  const [a, b] = await Promise.all([first, second]);

  assert.equal(compiles, 1);
  assert.strictEqual(a, b);
});

test("a normal request arriving during a forced refresh shares the refresh", async () => {
  let release;
  let refresh = false;
  const service = createService({
    compiler: async (templateDir) => {
      if (refresh) await new Promise((resolve) => { release = resolve; });
      fs.writeFileSync(path.join(templateDir, "main.pdf"), refresh ? "new" : "old");
      return { ok: true, status: "compiled", compilerKind: "fake" };
    }
  });
  await service.compile({ theme: cloneTheme(), sourceVersion: "initial" });
  refresh = true;

  const forced = service.compile({ theme: cloneTheme(), sourceVersion: "refresh", force: true });
  const normal = service.compile({ theme: cloneTheme(), sourceVersion: "review" });
  assert.strictEqual(forced, normal);
  await new Promise((resolve) => setImmediate(resolve));
  release();
  const result = await normal;

  assert.equal(fs.readFileSync(result.pdfPath, "utf8"), "new");
});

test("forced refresh recompiles and atomically replaces the ready PDF", async () => {
  let value = "old";
  let compiles = 0;
  const cacheRoot = tempDir();
  const actual = createService({
    cacheRoot,
    compiler: async (templateDir) => {
      compiles += 1;
      fs.writeFileSync(path.join(templateDir, "main.pdf"), value);
      return { ok: true, status: "compiled", compilerKind: "fake" };
    }
  });
  const first = await actual.compile({ theme: cloneTheme(), sourceVersion: "manual" });
  value = "new";
  const refreshed = await actual.compile({ theme: cloneTheme(), sourceVersion: "refresh", force: true });

  assert.equal(compiles, 2);
  assert.equal(refreshed.status, "ready");
  assert.equal(refreshed.cached, false);
  assert.equal(fs.readFileSync(refreshed.pdfPath, "utf8"), "new");
  assert.equal(fs.readdirSync(cacheRoot).some((name) => name.includes(".backup-")), false);
});

test("forced compilation failure preserves old PDF bytes and reports stale path", async () => {
  const cacheRoot = tempDir();
  let fail = false;
  const service = createService({
    cacheRoot,
    compiler: async (templateDir) => {
      if (fail) return { ok: false, status: "compile-failed", message: "bad", excerpt: "latex error", compilerKind: "fake" };
      fs.writeFileSync(path.join(templateDir, "main.pdf"), "old bytes");
      return { ok: true, status: "compiled", compilerKind: "fake" };
    }
  });
  const first = await service.compile({ theme: cloneTheme(), sourceVersion: "manual" });
  fail = true;
  const result = await service.compile({ theme: cloneTheme(), sourceVersion: "refresh", force: true });

  assert.equal(result.status, "failed");
  assert.equal(result.stalePdfPath, first.pdfPath);
  assert.equal(fs.readFileSync(first.pdfPath, "utf8"), "old bytes");
});

test("missing compiler returns unavailable and includes stale PDF when applicable", async () => {
  let unavailable = false;
  const service = createService({
    compiler: async (templateDir) => {
      if (unavailable) return { ok: false, status: "missing-compiler", message: "install TeX", compilerKind: "missing" };
      fs.writeFileSync(path.join(templateDir, "main.pdf"), "old");
      return { ok: true, status: "compiled", compilerKind: "fake" };
    }
  });
  const first = await service.compile({ theme: cloneTheme(), sourceVersion: "manual" });
  unavailable = true;
  const stale = await service.compile({ theme: cloneTheme(), sourceVersion: "refresh", force: true });
  const fresh = await createService({
    compiler: async () => ({ ok: false, status: "missing-compiler", message: "install TeX", compilerKind: "missing" })
  }).compile({ theme: cloneTheme(), sourceVersion: "manual" });

  assert.deepEqual(
    { status: stale.status, compilerKind: stale.compilerKind, stalePdfPath: stale.stalePdfPath },
    { status: "unavailable", compilerKind: "missing", stalePdfPath: first.pdfPath }
  );
  assert.equal(fresh.status, "unavailable");
  assert.equal(fresh.stalePdfPath, undefined);
});

test("corrupt, missing, or mismatched metadata and missing PDFs are cache misses", async () => {
  for (const defect of ["corrupt", "missing-metadata", "hash", "version", "key", "missing-pdf"]) {
    const cacheRoot = tempDir();
    let compiles = 0;
    const service = createService({ cacheRoot, compiler: pdfCompiler("new", () => { compiles += 1; }) });
    const key = `${resolveDesign(DEFAULT_THEME, getRegistry()).source.themeHash}-1`;
    const dir = path.join(cacheRoot, key);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "main.pdf"), "stale");
    const metadata = { cacheKey: key, themeHash: key.slice(0, 64), generatorVersion: "1", compilerKind: "fake", completedAt: "then", sourceVersion: "old" };
    if (defect === "corrupt") fs.writeFileSync(path.join(dir, "metadata.json"), "{");
    else if (defect !== "missing-metadata") {
      if (defect === "hash") metadata.themeHash = "0".repeat(64);
      if (defect === "version") metadata.generatorVersion = "2";
      if (defect === "key") metadata.cacheKey = `${"0".repeat(64)}-1`;
      fs.writeFileSync(path.join(dir, "metadata.json"), JSON.stringify(metadata));
    }
    if (defect === "missing-pdf") fs.rmSync(path.join(dir, "main.pdf"));

    const result = await service.compile({ theme: cloneTheme(), sourceVersion: "new" });
    assert.equal(result.cached, false, defect);
    assert.equal(compiles, 1, defect);
  }
});

const REQUIRED_METADATA_FIELDS = [
  "cacheKey",
  "themeHash",
  "generatorVersion",
  "compilerKind",
  "completedAt",
  "sourceVersion"
];

for (const field of REQUIRED_METADATA_FIELDS) {
  for (const defect of ["missing", "wrong-type"]) {
    test(`${defect} metadata ${field} is neither resolvable nor a cache hit`, async () => {
      const cacheRoot = tempDir();
      let compiles = 0;
      const service = createService({
        cacheRoot,
        compiler: pdfCompiler("rebuilt", () => { compiles += 1; })
      });
      const ready = await service.compile({ theme: cloneTheme(), sourceVersion: "manual" });
      const metadataPath = path.join(cacheRoot, ready.cacheKey, "metadata.json");
      const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
      if (defect === "missing") delete metadata[field];
      else metadata[field] = 42;
      fs.writeFileSync(metadataPath, JSON.stringify(metadata));

      assert.equal(service.resolvePdf(ready.cacheKey), null);
      const rebuilt = await service.compile({ theme: cloneTheme(), sourceVersion: "selected" });
      assert.equal(rebuilt.cached, false);
      assert.equal(compiles, 2);
    });
  }
}

for (const field of ["completedAt", "sourceVersion"]) {
  test(`blank metadata ${field} is invalid`, async () => {
    const cacheRoot = tempDir();
    const service = createService({ cacheRoot });
    const ready = await service.compile({ theme: cloneTheme(), sourceVersion: "manual" });
    const metadataPath = path.join(cacheRoot, ready.cacheKey, "metadata.json");
    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
    metadata[field] = "   ";
    fs.writeFileSync(metadataPath, JSON.stringify(metadata));

    assert.equal(service.resolvePdf(ready.cacheKey), null);
  });
}

test("resolvePdf accepts only valid ready keys and rejects unsafe or corrupt entries", async () => {
  const cacheRoot = tempDir();
  const service = createService({ cacheRoot });
  const ready = await service.compile({ theme: cloneTheme(), sourceVersion: "manual" });

  assert.equal(service.resolvePdf(ready.cacheKey), ready.pdfPath);
  for (const invalid of ["../x", "..%2Fx", path.resolve(cacheRoot), "A".repeat(64) + "-1", "a".repeat(63) + "-1", "a".repeat(64) + "-bad/version", "a".repeat(64) + "-"]) {
    assert.equal(service.resolvePdf(invalid), null, invalid);
    assert.equal(isSafeCacheKey(invalid), false, invalid);
  }
  const directoryKey = `${"b".repeat(64)}-1`;
  fs.mkdirSync(path.join(cacheRoot, directoryKey, "main.pdf"), { recursive: true });
  assert.equal(service.resolvePdf(directoryKey), null);
  fs.writeFileSync(path.join(cacheRoot, ready.cacheKey, "metadata.json"), "corrupt");
  assert.equal(service.resolvePdf(ready.cacheKey), null);
});

test("compiler success without main.pdf is failed and does not publish", async () => {
  const cacheRoot = tempDir();
  const service = createService({
    cacheRoot,
    compiler: async () => ({ ok: true, status: "compiled", compilerKind: "fake" })
  });
  const result = await service.compile({ theme: cloneTheme(), sourceVersion: "manual" });

  assert.equal(result.status, "failed");
  assert.match(result.message, /main\.pdf/i);
  assert.equal(fs.existsSync(path.join(cacheRoot, result.cacheKey)), false);
});

test("writer and compiler exceptions become bounded failures and temporary directories are cleaned", async () => {
  for (const dependency of ["writer", "compiler"]) {
    const cacheRoot = tempDir();
    const longMessage = `unsafe\u0000${"x".repeat(5000)}`;
    const service = createService({
      cacheRoot,
      projectWriter: dependency === "writer" ? () => { throw new Error(longMessage); } : fakeWriter,
      compiler: dependency === "compiler" ? async () => { throw new Error(longMessage); } : pdfCompiler("unused")
    });
    const result = await service.compile({ theme: cloneTheme(), sourceVersion: "manual" });

    assert.equal(result.status, "failed", dependency);
    assert.ok(result.message.length <= 4000, dependency);
    assert.equal(result.message.includes("\u0000"), false, dependency);
    assert.deepEqual(fs.readdirSync(cacheRoot), [], dependency);
  }
});
