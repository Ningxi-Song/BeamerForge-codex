"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { getRegistry } = require("../registry/options");
const { resolveDesignBundle, GENERATOR_VERSION } = require("../design/resolve-design");
const { writeTemplateProject } = require("../generators/project-writer");
const { compileTemplate } = require("./build");

const CACHE_KEY_RE = /^[a-f0-9]{64}-[A-Za-z0-9._-]+$/;
const SAFE_TOKEN_RE = /^[A-Za-z0-9._-]+$/;
const GENERATION_ID_RE = /^[A-Za-z0-9._-]+$/;
const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_ERROR_LENGTH = 4000;
const MAX_TOKEN_LENGTH = 128;
const MARKER_WIDTH = 16;

function isSafeCacheKey(value) {
  return typeof value === "string" && CACHE_KEY_RE.test(value);
}

function makeCacheKey(themeHash, generatorVersion) {
  const hash = String(themeHash);
  const version = String(generatorVersion);
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error("Invalid theme hash for preview cache");
  if (!isSafeToken(version)) throw new Error("Invalid generator version for preview cache");
  return `${hash}-${version}`;
}

function isSafeToken(value) {
  return typeof value === "string" && value.length <= MAX_TOKEN_LENGTH && SAFE_TOKEN_RE.test(value);
}

function isStrictIsoTimestamp(value) {
  if (typeof value !== "string" || !ISO_TIMESTAMP_RE.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function safeToken(value, fallback) {
  return isSafeToken(value) ? value : fallback;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function boundedDiagnostic(value, roots, fallback = "Preview compilation failed.") {
  let text = String(value || fallback)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  for (const root of [...roots].sort((a, b) => String(b).length - String(a).length)) {
    if (!root) continue;
    const variants = new Set([root, root.replace(/\\/g, "/"), root.replace(/\//g, "\\")]);
    for (const variant of variants) {
      text = text.replace(new RegExp(escapeRegExp(variant), "gi"), "[path]");
    }
  }
  text = text
    .replace(/\\\\(?:\?\\(?:UNC\\)?|[^\\\r\n]+\\)[^\r\n]*/gi, "[path]")
    .replace(/[A-Za-z]:[\\/][^\r\n]*/g, "[path]")
    .replace(/\/(?:[^/\r\n]+\/)+[^\r\n]*/g, "[path]")
    .slice(0, MAX_ERROR_LENGTH);
  return text || fallback;
}

function lstatOrNull(target) {
  try {
    return fs.lstatSync(target);
  } catch {
    return null;
  }
}

function isPlainDirectory(target) {
  const stat = lstatOrNull(target);
  return Boolean(stat && stat.isDirectory() && !stat.isSymbolicLink());
}

function isPlainFile(target) {
  const stat = lstatOrNull(target);
  return Boolean(stat && stat.isFile() && !stat.isSymbolicLink());
}

function isRealPathBeneath(rootReal, target, allowRoot = false) {
  try {
    const targetReal = fs.realpathSync(target);
    const relative = path.relative(rootReal, targetReal);
    if (!relative) return allowRoot;
    return !relative.startsWith("..") && !path.isAbsolute(relative);
  } catch {
    return false;
  }
}

function validMetadata(metadata, expected) {
  return Boolean(
    metadata
    && typeof metadata === "object"
    && metadata.cacheKey === expected.cacheKey
    && metadata.themeHash === expected.themeHash
    && metadata.generatorVersion === expected.generatorVersion
    && typeof metadata.compilerKind === "string"
    && isSafeToken(metadata.compilerKind)
    && isStrictIsoTimestamp(metadata.completedAt)
    && typeof metadata.sourceVersion === "string"
    && isSafeToken(metadata.sourceVersion)
  );
}

function timestamp(now) {
  const value = now();
  const result = value instanceof Date ? value.toISOString() : String(value);
  if (!isStrictIsoTimestamp(result)) throw new Error("Preview completion time must be a strict ISO timestamp");
  return result;
}

function writeAllSync(fd, buffer, fsOps = fs) {
  let offset = 0;
  while (offset < buffer.length) {
    const written = fsOps.writeSync(fd, buffer, offset, buffer.length - offset);
    if (!Number.isInteger(written) || written <= 0) throw new Error("Preview marker write made no progress");
    offset += written;
  }
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
  const fsOps = options.fsOps || fs;
  const renameSync = options.renameSync || fs.renameSync;
  const markerOpenSync = options.markerOpenSync || fsOps.openSync.bind(fsOps);
  const removeReservation = options.removeReservation || ((target) => fs.rmSync(target, { force: true }));
  const inFlight = new Map();

  if (!isSafeToken(generatorVersion)) {
    throw new Error("generatorVersion must be a safe cache token");
  }
  fs.mkdirSync(cacheRoot, { recursive: true });
  if (!isPlainDirectory(cacheRoot)) throw new Error("Preview cache root must not be a link");
  const cacheRootReal = fs.realpathSync(cacheRoot);

  function rootIsSafe() {
    return isPlainDirectory(cacheRoot)
      && fs.realpathSync(cacheRoot) === cacheRootReal;
  }

  function readGeneration(generationDir, generationId, expected) {
    if (!GENERATION_ID_RE.test(generationId) || !isPlainDirectory(generationDir)) return null;
    if (!isRealPathBeneath(cacheRootReal, generationDir)) return null;
    const generationReal = fs.realpathSync(generationDir);
    const metadataPath = path.join(generationDir, "metadata.json");
    const pdfPath = path.join(generationDir, "main.pdf");
    if (!isPlainFile(metadataPath) || !isPlainFile(pdfPath)) return null;
    if (!isRealPathBeneath(cacheRootReal, metadataPath) || !isRealPathBeneath(cacheRootReal, pdfPath)) return null;
    if (!isRealPathBeneath(generationReal, metadataPath) || !isRealPathBeneath(generationReal, pdfPath)) return null;
    let metadata;
    try {
      metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
    } catch {
      return null;
    }
    if (!validMetadata(metadata, expected)) return null;
    return { generationId, generationDir, metadata, pdfPath };
  }

  function readReadyEntry(cacheKey, themeHash, version = generatorVersion) {
    try {
      if (!rootIsSafe()) return null;
      const keyDir = path.join(cacheRoot, cacheKey);
      const generationsDir = path.join(keyDir, "generations");
      const currentDir = path.join(keyDir, "current");
      if (!isPlainDirectory(keyDir) || !isPlainDirectory(generationsDir) || !isPlainDirectory(currentDir)) return null;
      if (!isRealPathBeneath(cacheRootReal, keyDir) || !isRealPathBeneath(cacheRootReal, generationsDir) || !isRealPathBeneath(cacheRootReal, currentDir)) return null;
      const expected = { cacheKey, themeHash, generatorVersion: version };
      const markers = fs.readdirSync(currentDir)
        .map((name) => ({ name, match: name.match(/^(\d+)\.json$/) }))
        .filter((item) => item.match)
        .sort((a, b) => Number(b.match[1]) - Number(a.match[1]));
      for (const marker of markers) {
        const markerPath = path.join(currentDir, marker.name);
        if (!isPlainFile(markerPath) || !isRealPathBeneath(cacheRootReal, markerPath)) continue;
        let value;
        try { value = JSON.parse(fs.readFileSync(markerPath, "utf8")); } catch { continue; }
        const sequence = Number(marker.match[1]);
        if (!Number.isSafeInteger(sequence) || !value || value.sequence !== sequence || !isSafeToken(value.generationId)) continue;
        const generation = readGeneration(path.join(generationsDir, value.generationId), value.generationId, expected);
        if (generation) return generation;
      }
      return null;
    } catch {
      return null;
    }
  }

  function responseFromReady(entry, cached) {
    return {
      status: "ready",
      cached,
      cacheKey: entry.metadata.cacheKey,
      compilerKind: entry.metadata.compilerKind,
      completedAt: entry.metadata.completedAt,
      sourceVersion: entry.metadata.sourceVersion,
      pdfAvailable: true,
      staleAvailable: false
    };
  }

  function safelyRemoveTemp(target) {
    const relative = path.relative(cacheRoot, path.resolve(target));
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return;
    fs.rmSync(target, { recursive: true, force: true });
  }
  const cleanupTemp = options.cleanupTemp || safelyRemoveTemp;

  function ensurePublicationDirectory(cacheKey) {
    if (!rootIsSafe()) throw new Error("Preview cache root is unsafe");
    const keyDir = path.join(cacheRoot, cacheKey);
    const generationsDir = path.join(keyDir, "generations");
    const currentDir = path.join(keyDir, "current");
    if (!lstatOrNull(keyDir)) {
      try {
        fs.mkdirSync(keyDir);
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
      }
    }
    if (!isPlainDirectory(keyDir) || !isRealPathBeneath(cacheRootReal, keyDir)) {
      throw new Error("Preview cache key directory must not be a link");
    }
    if (!lstatOrNull(generationsDir)) {
      try {
        fs.mkdirSync(generationsDir);
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
      }
    }
    if (!isPlainDirectory(generationsDir)) {
      throw new Error("Preview generation directory must not be a link");
    }
    if (!isRealPathBeneath(cacheRootReal, generationsDir)) {
      throw new Error("Preview generation directory escapes the cache root");
    }
    if (!lstatOrNull(currentDir)) {
      try { fs.mkdirSync(currentDir); } catch (error) { if (error.code !== "EEXIST") throw error; }
    }
    if (!isPlainDirectory(currentDir) || !isRealPathBeneath(cacheRootReal, currentDir)) {
      throw new Error("Preview current directory must not be a link");
    }
    return { generationsDir, currentDir };
  }

  function allocateMarker(currentDir, generationId) {
    let collisionFloor = 0;
    for (;;) {
      let max = 0;
      for (const name of fs.readdirSync(currentDir)) {
        const match = name.match(new RegExp(`^(\\d{${MARKER_WIDTH}})\\.(?:json|reserve)$`));
        if (!match) continue;
        const value = Number(match[1]);
        if (Number.isSafeInteger(value)) max = Math.max(max, value);
      }
      const sequence = Math.max(max, collisionFloor) + 1;
      if (!Number.isSafeInteger(sequence)) throw new Error("Preview marker sequence exhausted");
      const padded = String(sequence).padStart(MARKER_WIDTH, "0");
      const reservationPath = path.join(currentDir, `${padded}.reserve`);
      let fd;
      try {
        fd = markerOpenSync(reservationPath, "wx");
      } catch (error) {
        if (error.code === "EEXIST") {
          collisionFloor = sequence;
          continue;
        }
        throw error;
      }
      fsOps.closeSync(fd);
      const stagingPath = path.join(currentDir, `${padded}.staging-${crypto.randomUUID()}`);
      const markerPath = path.join(currentDir, `${padded}.json`);
      const stagingFd = fsOps.openSync(stagingPath, "wx");
      try {
        writeAllSync(stagingFd, Buffer.from(JSON.stringify({ sequence, generationId })), fsOps);
        if (typeof fsOps.fsyncSync === "function") fsOps.fsyncSync(stagingFd);
      } finally {
        fsOps.closeSync(stagingFd);
      }
      let verified;
      try { verified = JSON.parse(fs.readFileSync(stagingPath, "utf8")); } catch { verified = null; }
      if (!verified || verified.sequence !== sequence || verified.generationId !== generationId) {
        throw new Error("Preview publication marker failed verification");
      }
      fsOps.renameSync(stagingPath, markerPath);
      try { removeReservation(reservationPath); } catch { /* best effort */ }
      return sequence;
    }
  }

  function makeGenerationId(completedAt) {
    const monotonic = process.hrtime.bigint().toString(16).padStart(16, "0");
    return `gen-${completedAt.replace(/\D/g, "")}-${monotonic}-${crypto.randomUUID()}`;
  }

  function failureDto({ status, cacheKey, themeHash, compilerKind, message, excerpt, roots }) {
    return {
      status,
      cached: false,
      cacheKey,
      message: boundedDiagnostic(message, roots, status === "unavailable" ? "No LaTeX compiler is available." : "Preview compilation failed."),
      ...(status === "failed" ? { excerpt: boundedDiagnostic(excerpt, roots, "") } : {}),
      compilerKind,
      pdfAvailable: false,
      staleAvailable: Boolean(readReadyEntry(cacheKey, themeHash))
    };
  }

  async function compileMiss({ bundle, cacheKey, sourceVersion }) {
    const themeHash = bundle.design.source.themeHash;
    let tempDir = null;
    const roots = [cacheRoot, rootDir];
    let compilerKind = "unknown";
    try {
      tempDir = fsOps.mkdtempSync(path.join(cacheRoot, `${cacheKey}.tmp-`));
      roots.push(tempDir);
      await Promise.resolve(projectWriter(bundle.theme, tempDir, {
        registry,
        rootDir,
        outputRoot: cacheRoot,
        resolveDesignBundle: () => bundle
      }));
      const result = await compiler(tempDir);
      compilerKind = safeToken(result && result.compilerKind, "unknown");

      if (!result || !result.ok) {
        if (result && result.status === "missing-compiler") {
          return failureDto({ status: "unavailable", cacheKey, themeHash, compilerKind: "missing", message: result.message, roots });
        }
        return failureDto({ status: "failed", cacheKey, themeHash, compilerKind, message: result && result.message, excerpt: result && result.excerpt, roots });
      }

      const tempPdf = path.join(tempDir, "main.pdf");
      if (!isPlainFile(tempPdf) || !isRealPathBeneath(cacheRootReal, tempPdf)) {
        return failureDto({ status: "failed", cacheKey, themeHash, compilerKind, message: "Compiler reported success but main.pdf was not created safely.", excerpt: "", roots });
      }

      const completedAt = timestamp(now);
      const normalizedSource = safeToken(sourceVersion, null);
      if (!normalizedSource) throw new Error("sourceVersion must be a safe token");
      const metadata = {
        cacheKey,
        themeHash,
        generatorVersion,
        compilerKind,
        completedAt,
        sourceVersion: normalizedSource
      };
      if (!validMetadata(metadata, { cacheKey, themeHash, generatorVersion })) {
        throw new Error("Preview metadata is invalid");
      }
      fs.writeFileSync(
        path.join(tempDir, "metadata.json"),
        `${JSON.stringify(metadata, null, 2)}\n`,
        { encoding: "utf8", flag: "wx" }
      );

      const { generationsDir, currentDir } = ensurePublicationDirectory(cacheKey);
      const generationId = makeGenerationId(completedAt);
      const generationDir = path.join(generationsDir, generationId);
      renameSync(tempDir, generationDir);
      const published = readGeneration(
        generationDir,
        generationId,
        { cacheKey, themeHash, generatorVersion }
      );
      if (!published) throw new Error("Published preview generation failed validation");
      allocateMarker(currentDir, generationId);
      const active = readReadyEntry(cacheKey, themeHash);
      if (!active) throw new Error("Published preview marker failed validation");
      return responseFromReady(active, false);
    } catch (error) {
      return failureDto({ status: "failed", cacheKey, themeHash, compilerKind, message: "Preview compilation failed.", excerpt: "", roots });
    } finally {
      try {
        if (tempDir) cleanupTemp(tempDir);
      } catch {
        // Cleanup is best-effort and must not change the documented result.
      }
    }
  }

  function compile({ theme, sourceVersion, force = false }) {
    let bundle;
    try {
      bundle = bundleResolver(theme, registry);
    } catch (error) {
      return Promise.reject(error);
    }
    const themeHash = bundle.design.source.themeHash;
    const cacheKey = makeCacheKey(themeHash, generatorVersion);
    const existing = readReadyEntry(cacheKey, themeHash);

    if (inFlight.has(cacheKey)) return inFlight.get(cacheKey);
    if (!force && existing) return Promise.resolve(responseFromReady(existing, true));

    let promise;
    promise = compileMiss({ bundle, cacheKey, sourceVersion })
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
    const entry = readReadyEntry(cacheKey, themeHash, version);
    return entry ? entry.pdfPath : null;
  }

  return { compile, resolvePdf };
}

module.exports = { createPreviewCache, isSafeCacheKey, makeCacheKey, writeAllSync };
