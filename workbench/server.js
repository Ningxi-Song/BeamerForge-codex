"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { Transform } = require("node:stream");
const { DEFAULT_THEME, validateTheme } = require("../schema/theme-schema");
const { getRegistry } = require("../registry/options");
const { resolveDesign, resolveDesignBundle, deepFreeze, ThemeValidationError } = require("../design/resolve-design");
const { assertRegistryContract } = require("../design/registry-contract");
const { writeTemplateProject } = require("../generators/project-writer");
const { compileTemplate, compileTemplateAsync } = require("./build");
const { createPreviewCache, isSafeCacheKey } = require("./preview-cache");
const { clone, isPlainObject } = require("../lib/utils");
const {
  freezeManualTheme,
  readManualTheme,
  readAiDraft
} = require("./theme-state");
const { createHandoff, importAiDraft } = require("./ai-handoff");
const { diffThemes } = require("./theme-diff");
const { renderSvg } = require("../design/vector-renderers");
const { canonicalJson } = require("../lib/canonical-json");
const { listDirections } = require("./design-directions");

const MAX_BODY_BYTES = 1024 * 1024;
const MAX_MULTIPART_BYTES = 101 * 1024 * 1024;
const WIZARD_ROUTES = new Set([
  "/welcome", "/start", "/color", "/font", "/bullets", "/blocks", "/navigation", "/title-page", "/review",
  "/manual-review", "/ai-customize", "/ai-handoff", "/ai-import", "/ai-compare", "/final-review"
]);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.statusCode = status;
  }
}

function mergeThemeForClient(defaultVal, savedVal) {
  if (Array.isArray(defaultVal)) return Array.isArray(savedVal) ? clone(savedVal) : clone(defaultVal);
  if (isPlainObject(defaultVal)) {
    const merged = clone(defaultVal);
    if (!isPlainObject(savedVal)) return merged;
    for (const [k, v] of Object.entries(savedVal)) {
      merged[k] = Object.hasOwn(defaultVal, k) ? mergeThemeForClient(defaultVal[k], v) : clone(v);
    }
    return merged;
  }
  return savedVal === undefined ? clone(defaultVal) : clone(savedVal);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    let done = false;
    const fail = (status, msg) => { if (done) return; done = true; reject(new HttpError(status, msg)); req.resume(); };
    req.on("data", (chunk) => {
      if (done) return;
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) return fail(413, "Request body too large");
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (done) return; done = true;
      const body = Buffer.concat(chunks, bytes).toString("utf8");
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new HttpError(400, "Invalid JSON request body")); }
    });
    req.on("error", (err) => { if (done) return; done = true; reject(err); });
  });
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(payload) });
  res.end(payload);
}

function sendText(res, status, body, contentType = "text/plain; charset=utf-8") {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  res.writeHead(status, { "content-type": contentType, "content-length": buf.length });
  res.end(buf);
}

async function readMultipart(req, maxBytes = MAX_MULTIPART_BYTES) {
  const rawContentLength = req.headers["content-length"];
  let contentLength = null;
  if (rawContentLength !== undefined) {
    if (Array.isArray(rawContentLength) || !/^(0|[1-9]\d*)$/.test(rawContentLength)) {
      req.resume();
      throw new HttpError(400, "Invalid Content-Length");
    }
    contentLength = Number(rawContentLength);
    if (!Number.isSafeInteger(contentLength)) {
      req.resume();
      throw new HttpError(400, "Invalid Content-Length");
    }
    if (contentLength > maxBytes) {
      req.resume();
      throw new HttpError(413, "Upload too large");
    }
  }

  let bytes = 0;
  let limitError = null;
  const limitedBody = new Transform({
    transform(chunk, encoding, callback) {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        limitError = new HttpError(413, "Upload too large");
        callback(limitError);
        return;
      }
      callback(null, chunk);
    }
  });
  const abortBody = () => {
    if (!limitedBody.destroyed) limitedBody.destroy(new HttpError(400, "Invalid multipart request body"));
  };
  req.once("aborted", abortBody);
  req.once("error", abortBody);
  req.pipe(limitedBody);
  const request = new Request("http://localhost/upload", {
    method: "POST",
    headers: req.headers,
    body: limitedBody,
    duplex: "half"
  });
  try {
    const form = await request.formData();
    if (contentLength !== null && bytes !== contentLength) throw new HttpError(400, "Invalid multipart request body");
    return form;
  } catch {
    req.unpipe(limitedBody);
    req.resume();
    if (limitError) throw limitError;
    throw new HttpError(400, "Invalid multipart request body");
  } finally {
    req.off("aborted", abortBody);
    req.off("error", abortBody);
  }
}

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }

function themePath(stateDir) { return path.join(stateDir, "theme.json"); }
function buildStatusPath(stateDir) { return path.join(stateDir, "build-status.json"); }
function selectionPath(stateDir) { return path.join(stateDir, "selection.json"); }
function comparisonMarkerPath(stateDir) { return path.join(stateDir, "comparison-current.json"); }
function cycleMarkerPath(stateDir) { return path.join(stateDir, "workflow-cycle.json"); }
function baselineMarkerPath(stateDir) { return path.join(stateDir, "manual-baseline-current.json"); }
function handoffMarkerPath(stateDir) { return path.join(stateDir, "handoff-current.json"); }

const HASH_RE = /^[a-f0-9]{64}$/;
const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

function readTheme(stateDir) {
  const f = themePath(stateDir);
  if (!fs.existsSync(f)) return clone(DEFAULT_THEME);
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

function writeTheme(stateDir, theme) {
  ensureDir(stateDir);
  fs.writeFileSync(themePath(stateDir), `${JSON.stringify(theme, null, 2)}\n`, "utf8");
}

function invalidateSelection(stateDir) {
  try { fs.unlinkSync(selectionPath(stateDir)); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}

function invalidateComparison(stateDir) {
  try { fs.unlinkSync(comparisonMarkerPath(stateDir)); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}

function removeFile(file) {
  try { fs.unlinkSync(file); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}

function writeJsonAtomic(target, value) {
  ensureDir(path.dirname(target));
  const temporary = `${target}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fs.renameSync(temporary, target);
  } finally { removeFile(temporary); }
}

function readJsonObject(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    return isPlainObject(value) ? value : null;
  } catch { return null; }
}

function validReviewMarker(marker) {
  return isPlainObject(marker) && UUID_RE.test(marker.cycleId || "") && UUID_RE.test(marker.reviewRevision || "")
    && HASH_RE.test(marker.manualThemeHash || "") && HASH_RE.test(marker.draftThemeHash || "");
}

function readCycle(stateDir) {
  const marker = readJsonObject(cycleMarkerPath(stateDir));
  return UUID_RE.test(marker?.cycleId || "") ? marker.cycleId : null;
}

function startNewCycle(stateDir) {
  const cycleId = randomUUID();
  writeJsonAtomic(cycleMarkerPath(stateDir), { cycleId });
  invalidateSelection(stateDir);
  invalidateComparison(stateDir);
  removeFile(baselineMarkerPath(stateDir));
  removeFile(handoffMarkerPath(stateDir));
  return cycleId;
}

function readValidatedSource(file, registry, message) {
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { throw new HttpError(409, message); }
  return validatePreviewTheme(raw, registry, message);
}

function readBaselineMarker(stateDir) {
  const marker = readJsonObject(baselineMarkerPath(stateDir));
  return validReviewMarker(marker) ? marker : null;
}

function readHandoffMarker(stateDir) {
  const marker = readJsonObject(handoffMarkerPath(stateDir));
  return isPlainObject(marker) && UUID_RE.test(marker.cycleId || "") && UUID_RE.test(marker.reviewRevision || "")
    && HASH_RE.test(marker.manualThemeHash || "") ? marker : null;
}

function resolvedThemeHash(theme, registry) {
  return resolveDesignBundle(theme, registry).design.source.themeHash;
}

function writeSelection(stateDir, selection) {
  writeJsonAtomic(selectionPath(stateDir), selection);
}

function writeComparisonMarker(stateDir, marker) {
  writeJsonAtomic(comparisonMarkerPath(stateDir), marker);
}

function readComparisonMarker(stateDir) {
  const marker = readJsonObject(comparisonMarkerPath(stateDir));
  return validReviewMarker(marker) ? marker : null;
}

function readActiveReviewMarker(stateDir) {
  const cycleId = readCycle(stateDir);
  const baseline = readBaselineMarker(stateDir);
  if (!baseline || baseline.cycleId !== cycleId) return null;
  const comparison = readComparisonMarker(stateDir);
  if (comparison && comparison.cycleId === cycleId
    && comparison.reviewRevision === baseline.reviewRevision
    && comparison.manualThemeHash === baseline.manualThemeHash) return comparison;
  return baseline;
}

function readCurrentSelection(stateDir, registry) {
  try {
    const raw = JSON.parse(fs.readFileSync(selectionPath(stateDir), "utf8"));
    if (!isPlainObject(raw) || !["manual", "ai"].includes(raw.version) || !HASH_RE.test(raw.themeHash || "")
      || !UUID_RE.test(raw.cycleId || "") || !UUID_RE.test(raw.reviewRevision || "") || raw.cycleId !== readCycle(stateDir)) return null;
    const marker = readActiveReviewMarker(stateDir);
    if (!marker || marker.reviewRevision !== raw.reviewRevision
      || raw.themeHash !== (raw.version === "ai" ? marker.draftThemeHash : marker.manualThemeHash)) return null;
    const manual = readValidatedSource(path.join(stateDir, "manual-theme.json"), registry, "Valid manual baseline required");
    if (resolvedThemeHash(manual, registry) !== marker.manualThemeHash) return null;
    if (raw.version === "ai" && marker.draftThemeHash !== marker.manualThemeHash) {
      const draft = readValidatedSource(path.join(stateDir, "ai-draft-theme.json"), registry, "Valid AI draft required");
      if (resolvedThemeHash(draft, registry) !== marker.draftThemeHash) return null;
    }
    const current = readValidatedTheme(stateDir, registry);
    return resolvedThemeHash(current, registry) === raw.themeHash
      ? { version: raw.version, themeHash: raw.themeHash, cycleId: raw.cycleId, reviewRevision: raw.reviewRevision } : null;
  } catch { return null; }
}

function adoptLegacyState(stateDir, registry) {
  if (readCycle(stateDir)) return;
  const cycleId = randomUUID();
  writeJsonAtomic(cycleMarkerPath(stateDir), { cycleId });
  const manualFile = path.join(stateDir, "manual-theme.json");
  let manual = null;
  try { if (fs.existsSync(manualFile)) manual = readValidatedSource(manualFile, registry, "Valid manual baseline required"); } catch {}
  if (!manual) { invalidateSelection(stateDir); invalidateComparison(stateDir); return; }
  const manualThemeHash = resolvedThemeHash(manual, registry);
  const legacyComparison = readJsonObject(comparisonMarkerPath(stateDir));
  let draft = null;
  try {
    const draftFile = path.join(stateDir, "ai-draft-theme.json");
    if (fs.existsSync(draftFile)) draft = readValidatedSource(draftFile, registry, "Valid AI draft required");
  } catch {}
  const draftThemeHash = draft ? resolvedThemeHash(draft, registry) : manualThemeHash;
  const reviewRevision = randomUUID();
  const baseline = { cycleId, reviewRevision, manualThemeHash, draftThemeHash: manualThemeHash };
  writeJsonAtomic(baselineMarkerPath(stateDir), baseline);
  let currentThemeHash = null;
  try { currentThemeHash = resolvedThemeHash(readValidatedTheme(stateDir, registry), registry); } catch {}
  const legacyHashesMatch = !legacyComparison || (legacyComparison.manualThemeHash === manualThemeHash && legacyComparison.draftThemeHash === draftThemeHash);
  if (draft && currentThemeHash === manualThemeHash && legacyHashesMatch) {
    writeComparisonMarker(stateDir, { cycleId, reviewRevision, manualThemeHash, draftThemeHash });
  } else invalidateComparison(stateDir);
  const legacySelection = readJsonObject(selectionPath(stateDir));
  if (legacySelection && ["manual", "ai"].includes(legacySelection.version) && legacySelection.themeHash === resolvedThemeHash(readValidatedTheme(stateDir, registry), registry)) {
    const reviewed = legacySelection.version === "manual" || Boolean(readComparisonMarker(stateDir));
    if (reviewed) writeSelection(stateDir, { version: legacySelection.version, themeHash: legacySelection.themeHash, cycleId, reviewRevision });
    else invalidateSelection(stateDir);
  } else invalidateSelection(stateDir);
}

function currentBaseline(stateDir, registry) {
  const marker = readBaselineMarker(stateDir);
  const cycleId = readCycle(stateDir);
  if (!marker || marker.cycleId !== cycleId) throw new HttpError(409, "Manual baseline belongs to an earlier design cycle");
  const manual = readValidatedSource(path.join(stateDir, "manual-theme.json"), registry, "Valid manual baseline required");
  if (resolvedThemeHash(manual, registry) !== marker.manualThemeHash) throw new HttpError(409, "Manual baseline changed; save it again before continuing");
  return { marker, manual };
}

function reviewedSources(stateDir, registry, body) {
  const marker = readActiveReviewMarker(stateDir);
  const cycleId = readCycle(stateDir);
  if (!marker || marker.cycleId !== cycleId || body?.cycleId !== marker.cycleId || body?.reviewRevision !== marker.reviewRevision
    || body?.expectedManualThemeHash !== marker.manualThemeHash || body?.expectedDraftThemeHash !== marker.draftThemeHash) {
    throw new HttpError(409, "Reviewed design changed; review it again before selecting");
  }
  const manual = readValidatedSource(path.join(stateDir, "manual-theme.json"), registry, "Valid manual baseline required");
  const manualThemeHash = resolvedThemeHash(manual, registry);
  if (manualThemeHash !== marker.manualThemeHash) throw new HttpError(409, "Manual baseline changed; review it again before selecting");
  let draft = manual;
  if (marker.draftThemeHash !== marker.manualThemeHash) {
    draft = readValidatedSource(path.join(stateDir, "ai-draft-theme.json"), registry, "Valid AI draft required");
    if (resolvedThemeHash(draft, registry) !== marker.draftThemeHash) throw new HttpError(409, "AI draft changed; review it again before selecting");
  }
  return { marker, manual, draft };
}

function writeBuildStatus(stateDir, status) {
  ensureDir(stateDir);
  fs.writeFileSync(buildStatusPath(stateDir), `${JSON.stringify(status, null, 2)}\n`, "utf8");
}

function readBuildStatus(stateDir) {
  const f = buildStatusPath(stateDir);
  if (!fs.existsSync(f)) return { status: "idle" };
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

function validatedResponse(stateDir, registry) {
  const theme = readTheme(stateDir);
  const validation = validateTheme(theme, { registry });
  return {
    ok: true, valid: validation.ok, theme: mergeThemeForClient(DEFAULT_THEME, theme), errors: validation.errors,
    selection: validation.ok ? readCurrentSelection(stateDir, registry) : null,
    themeHash: validation.ok ? resolvedThemeHash(validation.value, registry) : null,
    cycleId: readCycle(stateDir)
  };
}

function readValidatedTheme(stateDir, registry) {
  const theme = readTheme(stateDir);
  const v = validateTheme(theme, { registry });
  if (!v.ok) {
    const err = new HttpError(400, "Invalid theme");
    err.errors = v.errors;
    throw err;
  }
  return v.value;
}

function validatePreviewTheme(theme, registry, message) {
  const validation = validateTheme(theme, { registry });
  if (!validation.ok) throw new HttpError(409, message);
  return validation.value;
}

function previewThemeForSource(stateDir, registry, source, expectedThemeHash) {
  if (source === "selected") {
    const selection = readCurrentSelection(stateDir, registry);
    if (!selection || selection.themeHash !== expectedThemeHash) throw new HttpError(409, "Select a version again before compiling preview");
    return readValidatedTheme(stateDir, registry);
  }
  if (source === "manual") {
    const current = readValidatedTheme(stateDir, registry);
    if (resolvedThemeHash(current, registry) === expectedThemeHash) return current;
    const manualPath = path.join(stateDir, "manual-theme.json");
    if (!fs.existsSync(manualPath)) throw new HttpError(409, "Theme changed; refresh the review before compiling preview");
    let manual;
    try { manual = validatePreviewTheme(readManualTheme(stateDir), registry, "Valid manual baseline required"); }
    catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(409, "Valid manual baseline required"); }
    if (resolvedThemeHash(manual, registry) !== expectedThemeHash) throw new HttpError(409, "Theme changed; refresh the review before compiling preview");
    return manual;
  }
  const draftPath = path.join(stateDir, "ai-draft-theme.json");
  if (!fs.existsSync(draftPath)) throw new HttpError(409, "Valid AI draft required");
  try { return validatePreviewTheme(readAiDraft(stateDir), registry, "Valid AI draft required"); }
  catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(409, "Valid AI draft required"); }
}

function safePreviewDiagnostic(value) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/[A-Za-z]:[\\/][^\r\n]*/g, "[path]").replace(/\/(?:[^/\r\n]+\/)+[^\r\n]*/g, "[path]").slice(0, 4000);
}

function previewDto(result) {
  if (!result || !["ready", "failed", "unavailable"].includes(result.status) || !isSafeCacheKey(result.cacheKey)
    || !/^[a-f0-9]{64}$/.test(result.themeHash || "") || !result.cacheKey.startsWith(`${result.themeHash}-`)) {
    throw new Error("Invalid preview cache response");
  }
  const fields = ["status", "cached", "cacheKey", "compilerKind", "completedAt", "sourceVersion", "message", "excerpt"];
  const dto = {};
  for (const field of fields) if (result[field] !== undefined) dto[field] = ["message", "excerpt"].includes(field) ? safePreviewDiagnostic(result[field]) : result[field];
  dto.themeHash = result.themeHash;
  const encodedKey = encodeURIComponent(String(result.cacheKey || ""));
  const pdfUrl = `/api/preview/${encodedKey}/main.pdf`;
  if (result.pdfAvailable) dto.pdfUrl = pdfUrl;
  if (result.staleAvailable) dto.stalePdfUrl = pdfUrl;
  return dto;
}

function resolveTemplateDir(outputRoot, name) {
  const root = path.resolve(outputRoot);
  const dir = path.resolve(root, name);
  const rel = path.relative(root, dir);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new HttpError(400, "Template output is outside output root");
  return dir;
}

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf"
};

function resolveStaticPath(publicDir, requestPath) {
  let decoded;
  try { decoded = decodeURIComponent(requestPath); } catch { return null; }
  if (decoded.includes("\0")) return null;
  const rel = decoded === "/" ? "index.html" : decoded.replace(/^[/\\]+/, "");
  const abs = path.resolve(publicDir, rel);
  const r = path.relative(publicDir, abs);
  if (r.startsWith("..") || path.isAbsolute(r)) return null;
  return abs;
}

function normalizeAssetPath(p) { return String(p).replace(/\\/g, "/").replace(/^\/+/, ""); }

function allowedAssets(registry) {
  const set = new Set();
  for (const font of Object.values(registry.fonts || {})) {
    for (const a of font.assets || []) set.add(normalizeAssetPath(a));
  }
  return set;
}

function generatedLogoAssets(registry) {
  const assets = new Map();
  const owners = new Map();
  for (const [id, logo] of Object.entries(registry.logos || {})) {
    if (logo.vector === null) continue;
    const signature = canonicalJson(logo.vector);
    const previous = owners.get(logo.previewUrl);
    if (previous && previous.signature !== signature) {
      throw new Error(`Conflicting generated logo route ${logo.previewUrl}: logos.${previous.id} and logos.${id}`);
    }
    if (!previous) {
      owners.set(logo.previewUrl, { id, signature });
      assets.set(logo.previewUrl, logo.vector);
    }
  }
  return assets;
}

function resolveAssetFile(rootDir, requestPath, allowed) {
  let decoded;
  try { decoded = decodeURIComponent(requestPath); } catch { return null; }
  if (decoded.includes("\0") || !decoded.startsWith("/assets/")) return null;
  const rel = decoded.replace(/^\/assets[/\\]+/, "");
  const norm = normalizeAssetPath(rel);
  if (!allowed.has(norm)) return null;
  const abs = path.resolve(rootDir, norm);
  const r = path.relative(rootDir, abs);
  if (r.startsWith("..") || path.isAbsolute(r)) return null;
  return abs;
}

function createWorkbenchServer(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const stateDir = options.stateDir || path.join(rootDir, "workbench", "state");
  const outputRoot = options.outputRoot || path.join(rootDir, "templates");
  const publicDir = options.publicDir || path.join(rootDir, "workbench", "public");
  const handoffRoot = options.handoffRoot || path.join(stateDir, "ai-handoff");
  const multipartMaxBytes = Number.isSafeInteger(options.multipartMaxBytes) && options.multipartMaxBytes > 0
    ? options.multipartMaxBytes : MAX_MULTIPART_BYTES;
  const registry = deepFreeze(assertRegistryContract(clone(options.registry || getRegistry())));
  adoptLegacyState(stateDir, registry);
  const projectWriter = options.writeTemplateProject || writeTemplateProject;
  const templateCompiler = options.compileTemplate || compileTemplate;
  const previewCache = options.previewCache || createPreviewCache({
    cacheRoot: options.previewCacheRoot || path.join(stateDir, "preview-cache"), rootDir, registry,
    projectWriter: options.previewProjectWriter,
    compiler: options.previewCompiler || compileTemplateAsync
  });
  const allowedAssetPaths = allowedAssets(registry);
  const generatedLogos = generatedLogoAssets(registry);

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    try {
      if (req.method === "GET" && url.pathname === "/api/options") {
        sendJson(res, 200, registry);
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/directions") {
        sendJson(res, 200, { ok: true, directions: listDirections(registry) });
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/theme") {
        if (url.searchParams.get("validated") === "1") {
          sendJson(res, 200, validatedResponse(stateDir, registry));
        } else {
          sendJson(res, 200, readTheme(stateDir));
        }
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/selection") {
        sendJson(res, 200, { ok: true, selection: readCurrentSelection(stateDir, registry) });
        return;
      }
      if (req.method === "PUT" && url.pathname === "/api/theme") {
        const theme = await readJsonBody(req);
        const v = validateTheme(theme, { registry });
        if (!v.ok) { sendJson(res, 400, { ok: false, errors: v.errors }); return; }
        writeTheme(stateDir, v.value);
        const cycleId = startNewCycle(stateDir);
        sendJson(res, 200, { ok: true, theme: v.value, cycleId });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/design/resolve") {
        const theme = await readJsonBody(req);
        let design;
        try {
          design = resolveDesign(theme, registry);
        } catch (error) {
          if (error instanceof ThemeValidationError) {
            sendJson(res, 400, { ok: false, errors: error.errors });
            return;
          }
          sendJson(res, 500, { ok: false, error: "Unable to resolve design" });
          return;
        }
        sendJson(res, 200, design);
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/preview/compile") {
        const body = await readJsonBody(req);
        if (!isPlainObject(body) || !["manual", "ai", "selected"].includes(body.source)) {
          throw new HttpError(400, "source must be manual, ai, or selected");
        }
        if (body.force !== undefined && typeof body.force !== "boolean") {
          throw new HttpError(400, "force must be a boolean");
        }
        if (typeof body.expectedThemeHash !== "string" || !/^[a-f0-9]{64}$/.test(body.expectedThemeHash)) {
          throw new HttpError(400, "expectedThemeHash must be a lowercase 64-character hash");
        }
        try {
          const theme = previewThemeForSource(stateDir, registry, body.source, body.expectedThemeHash);
          const resolvedBundle = resolveDesignBundle(theme, registry);
          if (resolvedBundle.design.source.themeHash !== body.expectedThemeHash) {
            throw new HttpError(409, "Theme changed; refresh the review before compiling preview");
          }
          const result = await previewCache.compile({ theme: resolvedBundle.theme, resolvedBundle, sourceVersion: body.source, force: Boolean(body.force) });
          sendJson(res, 200, previewDto(result));
        } catch (error) {
          if (error instanceof HttpError) throw error;
          sendJson(res, 500, { ok: false, error: "Unable to compile preview" });
        }
        return;
      }
      if (req.method === "GET" && /^\/api\/preview\/[^/]+\/main\.pdf$/.test(url.pathname)) {
        const encodedKey = url.pathname.slice("/api/preview/".length, -"/main.pdf".length);
        let cacheKey;
        try { cacheKey = decodeURIComponent(encodedKey); } catch { cacheKey = null; }
        let bytes = null;
        try { if (cacheKey) bytes = previewCache.readPdf(cacheKey); }
        catch { sendJson(res, 500, { ok: false, error: "Unable to load preview" }); return; }
        if (!Buffer.isBuffer(bytes)) { sendText(res, 404, "Not found"); return; }
        res.writeHead(200, {
          "content-type": "application/pdf", "content-disposition": "inline",
          "cache-control": "no-store", "content-length": bytes.length
        });
        res.end(bytes);
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/manual-baseline") {
        const theme = readValidatedTheme(stateDir, registry);
        freezeManualTheme(stateDir, theme);
        const cycleId = readCycle(stateDir) || startNewCycle(stateDir);
        const manualThemeHash = resolvedThemeHash(theme, registry);
        const marker = { cycleId, reviewRevision: randomUUID(), manualThemeHash, draftThemeHash: manualThemeHash };
        invalidateSelection(stateDir);
        invalidateComparison(stateDir);
        removeFile(handoffMarkerPath(stateDir));
        writeJsonAtomic(baselineMarkerPath(stateDir), marker);
        sendJson(res, 200, { ok: true, theme, ...marker });
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/manual-baseline") {
        if (!fs.existsSync(path.join(stateDir, "manual-theme.json"))) { sendJson(res, 404, { ok: false, error: "Manual baseline not found" }); return; }
        const { marker, manual } = currentBaseline(stateDir, registry);
        sendJson(res, 200, { ok: true, theme: manual, ...marker });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/ai/handoff") {
        const { marker } = currentBaseline(stateDir, registry);
        const form = await readMultipart(req, multipartMaxBytes);
        const files = form.getAll("references").filter((entry) => typeof entry !== "string");
        let relativePaths;
        try { relativePaths = JSON.parse(String(form.get("relativePaths") || "[]")); }
        catch { throw new HttpError(400, "relativePaths must be valid JSON"); }
        if (!Array.isArray(relativePaths) || relativePaths.length !== files.length) throw new HttpError(400, "Reference path count does not match files");
        const references = await Promise.all(files.map(async (file, index) => ({
          name: file.name,
          relativePath: relativePaths[index],
          bytes: Buffer.from(await file.arrayBuffer())
        })));
        const result = createHandoff({ stateDir, handoffRoot, brief: String(form.get("brief") || ""), references });
        writeJsonAtomic(handoffMarkerPath(stateDir), { cycleId: marker.cycleId, reviewRevision: marker.reviewRevision, manualThemeHash: marker.manualThemeHash });
        sendJson(res, 200, { ok: true, ...result, cycleId: marker.cycleId });
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/ai/handoff") {
        if (!fs.existsSync(handoffRoot)) { sendJson(res, 404, { ok: false, error: "AI handoff not found" }); return; }
        const marker = readHandoffMarker(stateDir);
        if (!marker || marker.cycleId !== readCycle(stateDir)) throw new HttpError(409, "AI handoff belongs to an earlier design cycle");
        sendJson(res, 200, { ok: true, handoffRoot, ...marker });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/ai/import") {
        const { marker: baselineMarker, manual } = currentBaseline(stateDir, registry);
        const draft = await readJsonBody(req);
        invalidateSelection(stateDir);
        const result = importAiDraft({ stateDir, draftBuffer: Buffer.from(JSON.stringify(draft)), registry });
        if (result.ok) {
          const marker = { cycleId: baselineMarker.cycleId, reviewRevision: randomUUID(), manualThemeHash: resolvedThemeHash(manual, registry), draftThemeHash: resolvedThemeHash(result.theme, registry) };
          writeJsonAtomic(baselineMarkerPath(stateDir), { ...baselineMarker, reviewRevision: marker.reviewRevision });
          writeComparisonMarker(stateDir, marker);
          sendJson(res, 200, { ...result, ...marker });
        } else sendJson(res, 400, result);
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/ai/comparison") {
        if (!fs.existsSync(path.join(stateDir, "manual-theme.json")) || !fs.existsSync(path.join(stateDir, "ai-draft-theme.json"))) {
          throw new HttpError(409, "Manual baseline and AI draft required");
        }
        const manual = readValidatedSource(path.join(stateDir, "manual-theme.json"), registry, "Valid manual baseline required");
        const draft = readValidatedSource(path.join(stateDir, "ai-draft-theme.json"), registry, "Valid AI draft required");
        const hashes = { manualThemeHash: resolvedThemeHash(manual, registry), draftThemeHash: resolvedThemeHash(draft, registry) };
        const marker = readComparisonMarker(stateDir);
        const baselineMarker = readBaselineMarker(stateDir);
        if (!marker || !baselineMarker || marker.cycleId !== readCycle(stateDir)
          || marker.reviewRevision !== baselineMarker.reviewRevision
          || marker.manualThemeHash !== hashes.manualThemeHash || marker.draftThemeHash !== hashes.draftThemeHash) throw new HttpError(409, "AI comparison belongs to an earlier manual design cycle");
        sendJson(res, 200, { ok: true, manual, draft, ...marker, changes: diffThemes(manual, draft) });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/ai/accept") {
        const body = await readJsonBody(req);
        const { marker, draft: theme } = reviewedSources(stateDir, registry, body);
        if (marker.draftThemeHash === marker.manualThemeHash && !fs.existsSync(path.join(stateDir, "ai-draft-theme.json"))) throw new HttpError(409, "AI draft required");
        writeTheme(stateDir, theme);
        const selection = { version: "ai", themeHash: resolvedThemeHash(theme, registry), cycleId: marker.cycleId, reviewRevision: marker.reviewRevision };
        writeSelection(stateDir, selection);
        sendJson(res, 200, { ok: true, selectedVersion: selection.version, themeHash: selection.themeHash, cycleId: selection.cycleId, reviewRevision: selection.reviewRevision, theme });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/ai/restore") {
        if (!fs.existsSync(path.join(stateDir, "manual-theme.json"))) throw new HttpError(409, "Manual baseline required");
        const body = await readJsonBody(req);
        const { marker, manual: theme } = reviewedSources(stateDir, registry, body);
        writeTheme(stateDir, theme);
        const selection = { version: "manual", themeHash: resolvedThemeHash(theme, registry), cycleId: marker.cycleId, reviewRevision: marker.reviewRevision };
        writeSelection(stateDir, selection);
        sendJson(res, 200, { ok: true, selectedVersion: selection.version, themeHash: selection.themeHash, cycleId: selection.cycleId, reviewRevision: selection.reviewRevision, theme });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/generate") {
        const body = await readJsonBody(req);
        const selection = readCurrentSelection(stateDir, registry);
        if (!selection || body.selectedVersion !== selection.version || body.expectedThemeHash !== selection.themeHash
          || body.cycleId !== selection.cycleId || body.reviewRevision !== selection.reviewRevision) throw new HttpError(409, "Select a version again before generating");
        const theme = readValidatedTheme(stateDir, registry);
        const templateDir = resolveTemplateDir(outputRoot, theme.identity.name);
        const manifest = projectWriter(theme, templateDir, { registry, rootDir, outputRoot });
        const status = { ok: true, status: "generated", templateDir, written: manifest.written || [], copiedAssets: manifest.copiedAssets || [] };
        writeBuildStatus(stateDir, status);
        sendJson(res, 200, status);
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/compile") {
        const body = await readJsonBody(req);
        const selection = readCurrentSelection(stateDir, registry);
        if (!selection || body.selectedVersion !== selection.version || body.expectedThemeHash !== selection.themeHash
          || body.cycleId !== selection.cycleId || body.reviewRevision !== selection.reviewRevision) throw new HttpError(409, "Select a version again before compiling");
        const theme = readValidatedTheme(stateDir, registry);
        const templateDir = resolveTemplateDir(outputRoot, theme.identity.name);
        projectWriter(theme, templateDir, { registry, rootDir, outputRoot });
        const result = templateCompiler(templateDir);
        const status = { templateDir, ...result };
        writeBuildStatus(stateDir, status);
        sendJson(res, result.ok ? 200 : 500, status);
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/build-status") {
        sendJson(res, 200, readBuildStatus(stateDir));
        return;
      }
      if (req.method === "GET" && url.pathname.startsWith("/assets/")) {
        if (url.pathname.startsWith("/assets/generated/logos/")) {
          const vector = generatedLogos.get(url.pathname);
          if (!vector) { sendText(res, 404, "Not found"); return; }
          sendText(res, 200, renderSvg(vector), "image/svg+xml");
          return;
        }
        const filePath = resolveAssetFile(rootDir, url.pathname, allowedAssetPaths);
        if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) { sendText(res, 404, "Not found"); return; }
        const ext = path.extname(filePath).toLowerCase();
        sendText(res, 200, fs.readFileSync(filePath), CONTENT_TYPES[ext] || "application/octet-stream");
        return;
      }
      if (req.method === "GET") {
        const routePath = WIZARD_ROUTES.has(url.pathname) ? "/" : url.pathname;
        const filePath = resolveStaticPath(publicDir, routePath);
        if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) { sendText(res, 404, "Not found"); return; }
        const ext = path.extname(filePath).toLowerCase();
        sendText(res, 200, fs.readFileSync(filePath), CONTENT_TYPES[ext] || "text/plain; charset=utf-8");
        return;
      }
      sendText(res, 405, "Method not allowed");
    } catch (error) {
      if (res.writableEnded) return;
      const code = error.statusCode || 500;
      if (error.errors) { sendJson(res, code, { ok: false, errors: error.errors }); return; }
      sendJson(res, code, { ok: false, error: error.message });
    }
  });
}

function main() {
  const port = Number(process.env.PORT || 5177);
  const server = createWorkbenchServer();
  server.listen(port, "127.0.0.1", () => {
    process.stdout.write(`BeamerForge workbench running at http://localhost:${port}\n`);
  });
}

if (require.main === module) main();

module.exports = { createWorkbenchServer, generatedLogoAssets };
