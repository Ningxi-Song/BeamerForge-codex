"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { getRegistry } = require("../registry/options");
const { resolveDesignBundle, GENERATOR_VERSION } = require("../design/resolve-design");
const { writeTemplateProject } = require("../generators/project-writer");
const { compileTemplate } = require("./build");

const CACHE_KEY_RE = /^[a-f0-9]{64}-[A-Za-z0-9._-]+$/;
const GENERATOR_TOKEN_RE = /^[A-Za-z0-9._-]+$/;
const MAX_ERROR_LENGTH = 4000;

function isSafeCacheKey(value) {
  return typeof value === "string" && CACHE_KEY_RE.test(value);
}

function makeCacheKey(themeHash, generatorVersion) {
  const hash = String(themeHash);
  const version = String(generatorVersion);
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error("Invalid theme hash for preview cache");
  if (!GENERATOR_TOKEN_RE.test(version)) throw new Error("Invalid generator version for preview cache");
  return `${hash}-${version}`;
}

function boundedText(value, fallback = "Preview compilation failed.") {
  const text = String(value || fallback)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .slice(0, MAX_ERROR_LENGTH);
  return text || fallback;
}

function isFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function readReadyEntry(cacheRoot, cacheKey, themeHash, generatorVersion) {
  const entryDir = path.join(cacheRoot, cacheKey);
  const metadataPath = path.join(entryDir, "metadata.json");
  const pdfPath = path.join(entryDir, "main.pdf");
  let metadata;
  try {
    metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  } catch {
    return null;
  }
  if (!metadata || typeof metadata !== "object") return null;
  if (metadata.cacheKey !== cacheKey) return null;
  if (metadata.themeHash !== themeHash) return null;
  if (metadata.generatorVersion !== generatorVersion) return null;
  if (typeof metadata.compilerKind !== "string" || !metadata.compilerKind.trim()) return null;
  if (typeof metadata.completedAt !== "string" || !metadata.completedAt.trim()) return null;
  if (typeof metadata.sourceVersion !== "string" || !metadata.sourceVersion.trim()) return null;
  if (!isFile(pdfPath)) return null;
  return { entryDir, metadata, pdfPath };
}

function timestamp(now) {
  const value = now();
  return value instanceof Date ? value.toISOString() : String(value);
}

function createPreviewCache(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const cacheRoot = path.resolve(options.cacheRoot || path.join(rootDir, ".beamerforge-preview-cache"));
  const registry = options.registry || getRegistry();
  const projectWriter = options.projectWriter || writeTemplateProject;
  const compiler = options.compiler || compileTemplate;
  const bundleResolver = options.resolveDesignBundle || resolveDesignBundle;
  const generatorVersion = String(
    options.generatorVersion === undefined ? GENERATOR_VERSION : options.generatorVersion
  );
  const now = options.now || (() => new Date());
  const inFlight = new Map();

  if (!GENERATOR_TOKEN_RE.test(generatorVersion)) {
    throw new Error("generatorVersion must be a safe cache token");
  }
  fs.mkdirSync(cacheRoot, { recursive: true });

  function readyEntry(cacheKey, themeHash) {
    return readReadyEntry(cacheRoot, cacheKey, themeHash, generatorVersion);
  }

  function responseFromReady(entry, cached) {
    return {
      status: "ready",
      cached,
      cacheKey: entry.metadata.cacheKey,
      compilerKind: entry.metadata.compilerKind,
      completedAt: entry.metadata.completedAt,
      pdfPath: entry.pdfPath,
      sourceVersion: entry.metadata.sourceVersion
    };
  }

  function safelyRemove(target) {
    const relative = path.relative(cacheRoot, path.resolve(target));
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Refusing to remove a path outside the preview cache");
    }
    fs.rmSync(target, { recursive: true, force: true });
  }

  function publish(tempDir, finalDir) {
    if (!fs.existsSync(finalDir)) {
      fs.renameSync(tempDir, finalDir);
      return;
    }

    const backupDir = path.join(cacheRoot, `${path.basename(finalDir)}.backup-${crypto.randomUUID()}`);
    fs.renameSync(finalDir, backupDir);
    try {
      fs.renameSync(tempDir, finalDir);
    } catch (error) {
      try {
        fs.renameSync(backupDir, finalDir);
      } catch (restoreError) {
        error.restoreError = restoreError;
      }
      throw error;
    }
    safelyRemove(backupDir);
  }

  async function compileMiss({ bundle, cacheKey, sourceVersion, stale }) {
    const themeHash = bundle.design.source.themeHash;
    const finalDir = path.join(cacheRoot, cacheKey);
    const tempDir = fs.mkdtempSync(path.join(cacheRoot, `${cacheKey}.tmp-`));
    try {
      projectWriter(bundle.theme, tempDir, {
        registry,
        rootDir,
        outputRoot: cacheRoot,
        resolveDesignBundle: () => bundle
      });
      const result = await compiler(tempDir);
      const compilerKind = boundedText(result && result.compilerKind, "unknown");

      if (!result || !result.ok) {
        if (result && result.status === "missing-compiler") {
          return {
            status: "unavailable",
            cached: false,
            cacheKey,
            message: boundedText(result.message, "No LaTeX compiler is available."),
            compilerKind: "missing",
            ...(stale ? { stalePdfPath: stale.pdfPath } : {})
          };
        }
        return {
          status: "failed",
          cached: false,
          cacheKey,
          message: boundedText(result && result.message),
          excerpt: boundedText(result && result.excerpt, ""),
          compilerKind,
          ...(stale ? { stalePdfPath: stale.pdfPath } : {})
        };
      }

      const tempPdf = path.join(tempDir, "main.pdf");
      if (!isFile(tempPdf)) {
        return {
          status: "failed",
          cached: false,
          cacheKey,
          message: "Compiler reported success but main.pdf was not created.",
          excerpt: "",
          compilerKind,
          ...(stale ? { stalePdfPath: stale.pdfPath } : {})
        };
      }

      const metadata = {
        cacheKey,
        themeHash,
        generatorVersion,
        compilerKind,
        completedAt: timestamp(now),
        sourceVersion: boundedText(sourceVersion, "unknown")
      };
      fs.writeFileSync(path.join(tempDir, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
      publish(tempDir, finalDir);
      return responseFromReady({ metadata, pdfPath: path.join(finalDir, "main.pdf") }, false);
    } catch (error) {
      return {
        status: "failed",
        cached: false,
        cacheKey,
        message: boundedText(error && error.message),
        excerpt: "",
        compilerKind: "unknown",
        ...(stale ? { stalePdfPath: stale.pdfPath } : {})
      };
    } finally {
      if (fs.existsSync(tempDir)) safelyRemove(tempDir);
    }
  }

  function compile({ theme, sourceVersion, force = false }) {
    const bundle = bundleResolver(theme, registry);
    const themeHash = bundle.design.source.themeHash;
    const cacheKey = makeCacheKey(themeHash, generatorVersion);
    const existing = readyEntry(cacheKey, themeHash);

    if (inFlight.has(cacheKey)) return inFlight.get(cacheKey);
    if (!force && existing) return Promise.resolve(responseFromReady(existing, true));

    let promise;
    promise = compileMiss({ bundle, cacheKey, sourceVersion, stale: existing })
      .finally(() => {
        if (inFlight.get(cacheKey) === promise) inFlight.delete(cacheKey);
      });
    inFlight.set(cacheKey, promise);
    return promise;
  }

  function resolvePdf(cacheKey) {
    if (!isSafeCacheKey(cacheKey)) return null;
    const themeHash = cacheKey.slice(0, 64);
    const version = cacheKey.slice(65);
    const entry = readReadyEntry(cacheRoot, cacheKey, themeHash, version);
    return entry ? entry.pdfPath : null;
  }

  return { compile, resolvePdf };
}

module.exports = { createPreviewCache, isSafeCacheKey, makeCacheKey };
