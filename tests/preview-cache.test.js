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

function generationDirs(cacheRoot, cacheKey) {
  const root = path.join(cacheRoot, cacheKey, "generations");
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root).map((name) => path.join(root, name));
}

function onlyGenerationDir(cacheRoot, cacheKey) {
  const dirs = generationDirs(cacheRoot, cacheKey);
  assert.equal(dirs.length, 1);
  return dirs[0];
}

function readResolvedPdf(service, cacheKey) {
  const pdfPath = service.resolvePdf(cacheKey);
  assert.notEqual(pdfPath, null);
  return fs.readFileSync(pdfPath, "utf8");
}

function markerFiles(cacheRoot, cacheKey) {
  const current = path.join(cacheRoot, cacheKey, "current");
  return fs.existsSync(current) ? fs.readdirSync(current).sort() : [];
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
  const metadata = JSON.parse(fs.readFileSync(path.join(onlyGenerationDir(cacheRoot, first.cacheKey), "metadata.json"), "utf8"));
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
  assert.equal(fs.existsSync(path.join(onlyGenerationDir(cacheRoot, result.cacheKey), "theme.json")), true);
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
  const cacheRoot = tempDir();
  const service = createService({
    cacheRoot,
    compiler: async (templateDir) => {
      if (refresh) await new Promise((resolve) => { release = resolve; });
      fs.writeFileSync(path.join(templateDir, "main.pdf"), refresh ? "new" : "old");
      return { ok: true, status: "compiled", compilerKind: "fake" };
    }
  });
  const initial = await service.compile({ theme: cloneTheme(), sourceVersion: "initial" });
  refresh = true;

  const forced = service.compile({ theme: cloneTheme(), sourceVersion: "refresh", force: true });
  const normal = service.compile({ theme: cloneTheme(), sourceVersion: "review" });
  assert.strictEqual(forced, normal);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(generationDirs(cacheRoot, initial.cacheKey).length, 1);
  assert.equal(readResolvedPdf(service, initial.cacheKey), "old");
  release();
  const result = await normal;

  assert.equal(readResolvedPdf(service, result.cacheKey), "new");
});

test("forced refresh recompiles and publishes a newer immutable generation", async () => {
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
  assert.equal(readResolvedPdf(actual, refreshed.cacheKey), "new");
  assert.equal(generationDirs(cacheRoot, first.cacheKey).length, 2);
  assert.equal(fs.readdirSync(cacheRoot).some((name) => name.includes(".backup-")), false);
});

test("a backward clock refresh becomes active over a future-dated old generation", async () => {
  const cacheRoot = tempDir();
  let old = true;
  const service = createService({
    cacheRoot,
    now: () => new Date(old ? "2099-01-01T00:00:00.000Z" : "2000-01-01T00:00:00.000Z"),
    compiler: async (templateDir) => {
      fs.writeFileSync(path.join(templateDir, "main.pdf"), old ? "future old" : "backward new");
      return { ok: true, status: "compiled", compilerKind: "fake" };
    }
  });
  const initial = await service.compile({ theme: cloneTheme(), sourceVersion: "manual" });
  old = false;
  await service.compile({ theme: cloneTheme(), sourceVersion: "selected", force: true });

  assert.equal(readResolvedPdf(service, initial.cacheKey), "backward new");
});

test("forced compilation failure preserves old PDF bytes and reports stale availability", async () => {
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
  assert.equal(result.staleAvailable, true);
  assert.equal(result.pdfAvailable, false);
  assert.equal(readResolvedPdf(service, first.cacheKey), "old bytes");
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
    { status: stale.status, compilerKind: stale.compilerKind, staleAvailable: stale.staleAvailable },
    { status: "unavailable", compilerKind: "missing", staleAvailable: true }
  );
  assert.equal(fresh.status, "unavailable");
  assert.equal(fresh.staleAvailable, false);
});

test("corrupt, missing, or mismatched metadata and missing PDFs are cache misses", async () => {
  for (const defect of ["corrupt", "missing-metadata", "hash", "version", "key", "missing-pdf"]) {
    const cacheRoot = tempDir();
    let compiles = 0;
    const service = createService({ cacheRoot, compiler: pdfCompiler("new", () => { compiles += 1; }) });
    const key = `${resolveDesign(DEFAULT_THEME, getRegistry()).source.themeHash}-1`;
    const dir = path.join(cacheRoot, key, "generations", "manual-generation");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "main.pdf"), "stale");
    const metadata = { cacheKey: key, themeHash: key.slice(0, 64), generatorVersion: "1", compilerKind: "fake", completedAt: "2026-07-12T00:00:00.000Z", sourceVersion: "old" };
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
      const metadataPath = path.join(onlyGenerationDir(cacheRoot, ready.cacheKey), "metadata.json");
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
    const metadataPath = path.join(onlyGenerationDir(cacheRoot, ready.cacheKey), "metadata.json");
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

  assert.equal(fs.readFileSync(service.resolvePdf(ready.cacheKey), "utf8"), "pdf");
  for (const invalid of ["../x", "..%2Fx", path.resolve(cacheRoot), "A".repeat(64) + "-1", "a".repeat(63) + "-1", "a".repeat(64) + "-bad/version", "a".repeat(64) + "-"]) {
    assert.equal(service.resolvePdf(invalid), null, invalid);
    assert.equal(isSafeCacheKey(invalid), false, invalid);
  }
  const directoryKey = `${"b".repeat(64)}-1`;
  fs.mkdirSync(path.join(cacheRoot, directoryKey, "generations", "bad", "main.pdf"), { recursive: true });
  assert.equal(service.resolvePdf(directoryKey), null);
  fs.writeFileSync(path.join(onlyGenerationDir(cacheRoot, ready.cacheKey), "metadata.json"), "corrupt");
  assert.equal(service.resolvePdf(ready.cacheKey), null);
});

test("a failed generation rename leaves the previous generation ready", async () => {
  const cacheRoot = tempDir();
  let failRename = false;
  const service = createService({
    cacheRoot,
    renameSync(from, to) {
      if (failRename) throw new Error(`rename blocked ${from} ${to}`);
      return fs.renameSync(from, to);
    },
    compiler: pdfCompiler("old")
  });
  const initial = await service.compile({ theme: cloneTheme(), sourceVersion: "manual" });
  failRename = true;

  const failed = await service.compile({ theme: cloneTheme(), sourceVersion: "selected", force: true });

  assert.equal(failed.status, "failed");
  assert.equal(failed.staleAvailable, true);
  assert.equal(generationDirs(cacheRoot, initial.cacheKey).length, 1);
  assert.equal(readResolvedPdf(service, initial.cacheKey), "old");
});

test("two cache service instances use publication sequence despite clock skew", async () => {
  const cacheRoot = tempDir();
  const common = { cacheRoot, rootDir: process.cwd(), registry: getRegistry(), projectWriter: fakeWriter };
  const initialService = createPreviewCache({
    ...common,
    now: () => new Date("2026-07-12T00:00:00.000Z"),
    compiler: pdfCompiler("initial")
  });
  const initial = await initialService.compile({ theme: cloneTheme(), sourceVersion: "manual" });
  const first = createPreviewCache({
    ...common,
    now: () => new Date("2099-07-12T00:01:00.000Z"),
    compiler: pdfCompiler("first")
  });
  const second = createPreviewCache({
    ...common,
    now: () => new Date("2000-07-12T00:02:00.000Z"),
    compiler: pdfCompiler("second")
  });

  const a = await first.compile({ theme: cloneTheme(), sourceVersion: "ai", force: true });
  const b = await second.compile({ theme: cloneTheme(), sourceVersion: "selected", force: true });

  assert.equal(a.status, "ready");
  assert.equal(b.status, "ready");
  assert.equal(generationDirs(cacheRoot, initial.cacheKey).length, 3);
  assert.equal(readResolvedPdf(initialService, initial.cacheKey), "second");
});

test("invalid highest marker falls back and reserves its sequence", async () => {
  const cacheRoot = tempDir();
  let contents = "first";
  const service = createService({
    cacheRoot,
    compiler: async (templateDir) => {
      fs.writeFileSync(path.join(templateDir, "main.pdf"), contents);
      return { ok: true, status: "compiled", compilerKind: "fake" };
    }
  });
  const ready = await service.compile({ theme: cloneTheme(), sourceVersion: "manual" });
  const current = path.join(cacheRoot, ready.cacheKey, "current");
  fs.writeFileSync(path.join(current, "0000000000000002.json"), "{");
  assert.equal(readResolvedPdf(service, ready.cacheKey), "first");
  contents = "third";
  await service.compile({ theme: cloneTheme(), sourceVersion: "selected", force: true });

  assert.deepEqual(markerFiles(cacheRoot, ready.cacheKey), [
    "0000000000000001.json",
    "0000000000000002.json",
    "0000000000000003.json"
  ]);
  assert.equal(readResolvedPdf(service, ready.cacheKey), "third");
});

test("an unmarked published generation is ignored", async () => {
  const cacheRoot = tempDir();
  const service = createService({ cacheRoot });
  const ready = await service.compile({ theme: cloneTheme(), sourceVersion: "manual" });
  const source = onlyGenerationDir(cacheRoot, ready.cacheKey);
  const orphan = path.join(path.dirname(source), "gen-orphan");
  fs.cpSync(source, orphan, { recursive: true });
  fs.writeFileSync(path.join(orphan, "main.pdf"), "unmarked orphan");

  assert.equal(readResolvedPdf(service, ready.cacheKey), "pdf");
});

test("exclusive marker collision rescans and retries the next sequence", async () => {
  const cacheRoot = tempDir();
  let attempts = 0;
  const service = createService({
    cacheRoot,
    markerOpenSync(filePath, flags) {
      attempts += 1;
      if (attempts === 1) {
        fs.writeFileSync(filePath, "{", { flag: "wx" });
        const error = new Error("collision");
        error.code = "EEXIST";
        throw error;
      }
      return fs.openSync(filePath, flags);
    }
  });
  const ready = await service.compile({ theme: cloneTheme(), sourceVersion: "manual" });

  assert.equal(ready.status, "ready");
  assert.equal(attempts, 2);
  assert.deepEqual(markerFiles(cacheRoot, ready.cacheKey), [
    "0000000000000001.json",
    "0000000000000002.json"
  ]);
});

test("orphan temporary directories are ignored", async () => {
  const cacheRoot = tempDir();
  const service = createService({ cacheRoot });
  const key = `${resolveDesign(DEFAULT_THEME, getRegistry()).source.themeHash}-1`;
  const orphan = path.join(cacheRoot, `${key}.tmp-orphan`);
  fs.mkdirSync(orphan);
  fs.writeFileSync(path.join(orphan, "main.pdf"), "orphan");

  assert.equal(service.resolvePdf(key), null);
  const ready = await service.compile({ theme: cloneTheme(), sourceVersion: "manual" });
  assert.equal(ready.status, "ready");
  assert.equal(readResolvedPdf(service, key), "pdf");
  assert.equal(fs.existsSync(orphan), true);
});

function writeExternalGeneration(directory, cacheKey) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "main.pdf"), "external");
  fs.writeFileSync(path.join(directory, "metadata.json"), JSON.stringify({
    cacheKey,
    themeHash: cacheKey.slice(0, 64),
    generatorVersion: cacheKey.slice(65),
    compilerKind: "fake",
    completedAt: "2026-07-12T00:00:00.000Z",
    sourceVersion: "manual"
  }));
}

test("resolvePdf rejects a generation directory symlink escape", (t) => {
  const cacheRoot = tempDir();
  const service = createService({ cacheRoot });
  const key = `${resolveDesign(DEFAULT_THEME, getRegistry()).source.themeHash}-1`;
  const generations = path.join(cacheRoot, key, "generations");
  const outside = tempDir("beamerforge-external-generation-");
  writeExternalGeneration(outside, key);
  fs.mkdirSync(generations, { recursive: true });
  try {
    fs.symlinkSync(outside, path.join(generations, "linked"), "dir");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) {
      t.skip(`directory symlink unavailable: ${error.code}`);
      return;
    }
    throw error;
  }

  assert.equal(service.resolvePdf(key), null);
});

test("metadata publication never follows an external file symlink", async (t) => {
  const cacheRoot = tempDir();
  const outsideRoot = tempDir("beamerforge-external-metadata-");
  const outsideMetadata = path.join(outsideRoot, "metadata.json");
  fs.writeFileSync(outsideMetadata, "unchanged");
  let linkUnavailable = false;
  const service = createService({
    cacheRoot,
    compiler: async (templateDir) => {
      fs.writeFileSync(path.join(templateDir, "main.pdf"), "pdf");
      try {
        fs.symlinkSync(outsideMetadata, path.join(templateDir, "metadata.json"), "file");
      } catch (error) {
        if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) {
          linkUnavailable = true;
          return { ok: false, status: "compile-failed", message: "symlink unavailable", compilerKind: "fake" };
        }
        throw error;
      }
      return { ok: true, status: "compiled", compilerKind: "fake" };
    }
  });

  const result = await service.compile({ theme: cloneTheme(), sourceVersion: "manual" });
  if (linkUnavailable) {
    t.skip("file symlink unavailable");
    return;
  }

  assert.equal(result.status, "failed");
  assert.equal(fs.readFileSync(outsideMetadata, "utf8"), "unchanged");
});

test("resolvePdf rejects a Windows junction escape", { skip: process.platform !== "win32" }, () => {
  const cacheRoot = tempDir();
  const service = createService({ cacheRoot });
  const key = `${resolveDesign(DEFAULT_THEME, getRegistry()).source.themeHash}-1`;
  const generations = path.join(cacheRoot, key, "generations");
  const outside = tempDir("beamerforge-external-junction-");
  writeExternalGeneration(outside, key);
  fs.mkdirSync(generations, { recursive: true });
  fs.symlinkSync(outside, path.join(generations, "junction"), "junction");

  assert.equal(service.resolvePdf(key), null);
});

test("compile never creates generation folders through a Windows key junction", { skip: process.platform !== "win32" }, async () => {
  const cacheRoot = tempDir();
  const service = createService({ cacheRoot });
  const key = `${resolveDesign(DEFAULT_THEME, getRegistry()).source.themeHash}-1`;
  const outside = tempDir("beamerforge-external-key-junction-");
  fs.symlinkSync(outside, path.join(cacheRoot, key), "junction");

  const result = await service.compile({ theme: cloneTheme(), sourceVersion: "manual" });

  assert.equal(result.status, "failed");
  assert.equal(fs.existsSync(path.join(outside, "generations")), false);
});

for (const scenario of ["ready", "failed", "unavailable"]) {
  test(`temporary cleanup failure cannot reject a ${scenario} result`, async () => {
    const compiler = scenario === "ready"
      ? pdfCompiler("ready")
      : scenario === "failed"
        ? async () => ({ ok: false, status: "compile-failed", message: "bad", excerpt: "bad", compilerKind: "fake" })
        : async () => ({ ok: false, status: "missing-compiler", message: "missing", compilerKind: "missing" });
    const service = createService({
      compiler,
      cleanupTemp() { throw new Error("locked temp directory"); }
    });

    const result = await service.compile({ theme: cloneTheme(), sourceVersion: "manual" });

    assert.equal(result.status, scenario);
  });
}

test("a failing instance sees a generation published by another instance as stale", async () => {
  const cacheRoot = tempDir();
  let release;
  let started;
  const startedPromise = new Promise((resolve) => { started = resolve; });
  const failing = createService({
    cacheRoot,
    compiler: async () => {
      started();
      await new Promise((resolve) => { release = resolve; });
      return { ok: false, status: "compile-failed", message: "bad", compilerKind: "fake" };
    }
  });
  const publishing = createService({ cacheRoot, compiler: pdfCompiler("published elsewhere") });

  const failurePromise = failing.compile({ theme: cloneTheme(), sourceVersion: "manual", force: true });
  await startedPromise;
  await publishing.compile({ theme: cloneTheme(), sourceVersion: "ai", force: true });
  release();
  const failed = await failurePromise;

  assert.equal(failed.staleAvailable, true);
});

test("stale availability is false when the active generation is removed before failure", async () => {
  const cacheRoot = tempDir();
  let release;
  let fail = false;
  const service = createService({
    cacheRoot,
    compiler: async (templateDir) => {
      if (fail) {
        await new Promise((resolve) => { release = resolve; });
        return { ok: false, status: "compile-failed", message: "bad", compilerKind: "fake" };
      }
      fs.writeFileSync(path.join(templateDir, "main.pdf"), "initial");
      return { ok: true, status: "compiled", compilerKind: "fake" };
    }
  });
  const ready = await service.compile({ theme: cloneTheme(), sourceVersion: "manual" });
  fail = true;
  const failurePromise = service.compile({ theme: cloneTheme(), sourceVersion: "selected", force: true });
  await new Promise((resolve) => setImmediate(resolve));
  fs.rmSync(path.join(cacheRoot, ready.cacheKey, "current"), { recursive: true });
  release();
  const failed = await failurePromise;

  assert.equal(failed.staleAvailable, false);
});

test("async project writer rejection becomes a failed DTO and cleans its temp", async () => {
  const cacheRoot = tempDir();
  const service = createService({
    cacheRoot,
    projectWriter: async () => { throw new Error("async writer failed C:\\secret\\writer.tex"); }
  });

  const result = await service.compile({ theme: cloneTheme(), sourceVersion: "manual" });

  assert.equal(result.status, "failed");
  assert.equal(result.message, "Preview compilation failed.");
  assert.deepEqual(fs.readdirSync(cacheRoot), []);
});

test("compile results are browser-safe DTOs with redacted diagnostics", async () => {
  const cacheRoot = tempDir();
  const rootDir = process.cwd();
  const service = createService({
    cacheRoot,
    rootDir,
    compiler: async (templateDir) => {
      throw new Error(`failed ${templateDir} ${cacheRoot} ${rootDir} \\\\server\\share\\private file.tex \\\\?\\C:\\extended folder\\secret.tex \\\\?\\UNC\\server\\share\\secret.tex C:\\private folder\\secret.tex /var/private/file.tex`);
    }
  });

  const result = await service.compile({ theme: cloneTheme(), sourceVersion: "manual" });
  const serialized = JSON.stringify(result);

  assert.equal(result.status, "failed");
  assert.equal(Object.hasOwn(result, "pdfPath"), false);
  assert.equal(Object.hasOwn(result, "stalePdfPath"), false);
  assert.equal(result.message, "Preview compilation failed.");
  assert.equal(serialized.includes(cacheRoot), false);
  assert.equal(serialized.includes(rootDir), false);
  assert.doesNotMatch(serialized, /server|share|extended|private|secret|[A-Za-z]:\\|\/var\/private|\.tmp-/i);
});

test("returned compiler diagnostics redact UNC, extended, spaced, and POSIX paths", async () => {
  const service = createService({
    compiler: async () => ({
      ok: false,
      status: "compile-failed",
      compilerKind: "xelatex",
      message: "Undefined control sequence at \\\\server\\share\\private folder\\main.tex",
      excerpt: "l.42 C:\\private folder\\main.tex and /var/private/main.tex"
    })
  });
  const result = await service.compile({ theme: cloneTheme(), sourceVersion: "manual" });
  const serialized = JSON.stringify(result);

  assert.match(result.message, /Undefined control sequence/);
  assert.match(result.excerpt, /l\.42/);
  assert.doesNotMatch(serialized, /server|share|private folder|\/var\/private/i);
});

test("oversized generator versions are rejected before creating cache paths", () => {
  const parent = tempDir();
  const cacheRoot = path.join(parent, "cache");

  assert.throws(
    () => createPreviewCache({ cacheRoot, generatorVersion: "x".repeat(129) }),
    /generatorVersion/
  );
  assert.equal(fs.existsSync(cacheRoot), false);
});

for (const [field, invalid] of [
  ["completedAt", "not-an-iso-date"],
  ["compilerKind", "../latexmk"],
  ["sourceVersion", "../manual"]
]) {
  test(`metadata ${field} rejects malformed values`, async () => {
    const cacheRoot = tempDir();
    const service = createService({ cacheRoot });
    const ready = await service.compile({ theme: cloneTheme(), sourceVersion: "manual" });
    const metadataPath = path.join(onlyGenerationDir(cacheRoot, ready.cacheKey), "metadata.json");
    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
    metadata[field] = invalid;
    fs.writeFileSync(metadataPath, JSON.stringify(metadata));

    assert.equal(service.resolvePdf(ready.cacheKey), null);
  });
}

test("resolver failures return rejected promises instead of throwing synchronously", async () => {
  const service = createService();
  const invalid = cloneTheme();
  invalid.identity.title = 42;
  let promise;

  assert.doesNotThrow(() => {
    promise = service.compile({ theme: invalid, sourceVersion: "manual" });
  });
  assert.ok(promise instanceof Promise);
  await assert.rejects(promise, /Invalid theme/);
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
  assert.equal(service.resolvePdf(result.cacheKey), null);
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
