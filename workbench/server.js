"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_THEME, validateTheme } = require("../schema/theme-schema");
const { getRegistry } = require("../registry/options");
const { resolveDesign, ThemeValidationError } = require("../design/resolve-design");
const { writeTemplateProject } = require("../generators/project-writer");
const { compileTemplate } = require("./build");
const { createPreviewCache, isSafeCacheKey } = require("./preview-cache");
const { clone, isPlainObject } = require("../lib/utils");
const {
  freezeManualTheme,
  readManualTheme,
  readAiDraft,
  acceptAiDraft,
  restoreManualTheme
} = require("./theme-state");
const { createHandoff, importAiDraft } = require("./ai-handoff");
const { diffThemes } = require("./theme-diff");

const MAX_BODY_BYTES = 1024 * 1024;
const WIZARD_ROUTES = new Set([
  "/start", "/color", "/font", "/bullets", "/blocks", "/navigation", "/title-page", "/review",
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

async function readMultipart(req) {
  const contentLength = Number(req.headers["content-length"] || 0);
  if (contentLength > 101 * 1024 * 1024) throw new HttpError(413, "Upload too large");
  const request = new Request("http://localhost/upload", {
    method: "POST",
    headers: req.headers,
    body: req,
    duplex: "half"
  });
  try {
    return await request.formData();
  } catch {
    throw new HttpError(400, "Invalid multipart request body");
  }
}

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }

function themePath(stateDir) { return path.join(stateDir, "theme.json"); }
function buildStatusPath(stateDir) { return path.join(stateDir, "build-status.json"); }

function readTheme(stateDir) {
  const f = themePath(stateDir);
  if (!fs.existsSync(f)) return clone(DEFAULT_THEME);
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

function writeTheme(stateDir, theme) {
  ensureDir(stateDir);
  fs.writeFileSync(themePath(stateDir), `${JSON.stringify(theme, null, 2)}\n`, "utf8");
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
  return { ok: true, valid: validation.ok, theme: mergeThemeForClient(DEFAULT_THEME, theme), errors: validation.errors };
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

function previewThemeForSource(stateDir, registry, source) {
  if (source === "selected") return readValidatedTheme(stateDir, registry);
  if (source === "manual") {
    const manualPath = path.join(stateDir, "manual-theme.json");
    if (!fs.existsSync(manualPath)) return readValidatedTheme(stateDir, registry);
    return validatePreviewTheme(readManualTheme(stateDir), registry, "Valid manual baseline required");
  }
  const draftPath = path.join(stateDir, "ai-draft-theme.json");
  if (!fs.existsSync(draftPath)) throw new HttpError(409, "Valid AI draft required");
  return validatePreviewTheme(readAiDraft(stateDir), registry, "Valid AI draft required");
}

function previewDto(result) {
  if (!result || !["ready", "failed", "unavailable"].includes(result.status) || !isSafeCacheKey(result.cacheKey)) {
    throw new Error("Invalid preview cache response");
  }
  const fields = ["status", "cached", "cacheKey", "compilerKind", "completedAt", "sourceVersion", "message", "excerpt"];
  const dto = {};
  for (const field of fields) if (result[field] !== undefined) dto[field] = result[field];
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
  for (const logo of Object.values(registry.logos || {})) {
    if (logo.asset) set.add(normalizeAssetPath(logo.asset));
  }
  return set;
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
  const registry = options.registry || getRegistry();
  const projectWriter = options.writeTemplateProject || writeTemplateProject;
  const templateCompiler = options.compileTemplate || compileTemplate;
  const previewCache = options.previewCache || createPreviewCache({
    cacheRoot: options.previewCacheRoot || path.join(stateDir, "preview-cache"), rootDir, registry,
    projectWriter: options.previewProjectWriter,
    compiler: options.previewCompiler
  });
  const allowedAssetPaths = allowedAssets(registry);

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    try {
      if (req.method === "GET" && url.pathname === "/api/options") {
        sendJson(res, 200, registry);
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
      if (req.method === "PUT" && url.pathname === "/api/theme") {
        const theme = await readJsonBody(req);
        const v = validateTheme(theme, { registry });
        if (!v.ok) { sendJson(res, 400, { ok: false, errors: v.errors }); return; }
        writeTheme(stateDir, v.value);
        sendJson(res, 200, { ok: true, theme: v.value });
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
        try {
          const theme = previewThemeForSource(stateDir, registry, body.source);
          const result = await previewCache.compile({ theme, sourceVersion: body.source, force: Boolean(body.force) });
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
        let pdfPath = null;
        try { if (cacheKey) pdfPath = previewCache.resolvePdf(cacheKey); }
        catch { sendJson(res, 500, { ok: false, error: "Unable to load preview" }); return; }
        if (!pdfPath) { sendText(res, 404, "Not found"); return; }
        let stat;
        try { stat = fs.lstatSync(pdfPath); } catch { stat = null; }
        if (!stat || !stat.isFile() || stat.isSymbolicLink()) { sendText(res, 404, "Not found"); return; }
        let bytes;
        try { bytes = fs.readFileSync(pdfPath); }
        catch { sendJson(res, 500, { ok: false, error: "Unable to load preview" }); return; }
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
        sendJson(res, 200, { ok: true, theme });
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/manual-baseline") {
        if (!fs.existsSync(path.join(stateDir, "manual-theme.json"))) { sendJson(res, 404, { ok: false, error: "Manual baseline not found" }); return; }
        sendJson(res, 200, { ok: true, theme: readManualTheme(stateDir) });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/ai/handoff") {
        if (!fs.existsSync(path.join(stateDir, "manual-theme.json"))) throw new HttpError(409, "Manual baseline required");
        const form = await readMultipart(req);
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
        sendJson(res, 200, { ok: true, ...result });
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/ai/handoff") {
        if (!fs.existsSync(handoffRoot)) { sendJson(res, 404, { ok: false, error: "AI handoff not found" }); return; }
        sendJson(res, 200, { ok: true, handoffRoot });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/ai/import") {
        if (!fs.existsSync(path.join(stateDir, "manual-theme.json"))) throw new HttpError(409, "Manual baseline required");
        const draft = await readJsonBody(req);
        const result = importAiDraft({ stateDir, draftBuffer: Buffer.from(JSON.stringify(draft)), registry });
        sendJson(res, result.ok ? 200 : 400, result);
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/ai/comparison") {
        if (!fs.existsSync(path.join(stateDir, "manual-theme.json")) || !fs.existsSync(path.join(stateDir, "ai-draft-theme.json"))) {
          throw new HttpError(409, "Manual baseline and AI draft required");
        }
        const manual = readManualTheme(stateDir);
        const draft = readAiDraft(stateDir);
        sendJson(res, 200, { ok: true, manual, draft, changes: diffThemes(manual, draft) });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/ai/accept") {
        if (!fs.existsSync(path.join(stateDir, "ai-draft-theme.json"))) throw new HttpError(409, "AI draft required");
        acceptAiDraft(stateDir);
        sendJson(res, 200, { ok: true, selectedVersion: "ai", theme: readTheme(stateDir) });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/ai/restore") {
        if (!fs.existsSync(path.join(stateDir, "manual-theme.json"))) throw new HttpError(409, "Manual baseline required");
        restoreManualTheme(stateDir);
        sendJson(res, 200, { ok: true, selectedVersion: "manual", theme: readTheme(stateDir) });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/generate") {
        const theme = readValidatedTheme(stateDir, registry);
        const templateDir = resolveTemplateDir(outputRoot, theme.identity.name);
        const manifest = projectWriter(theme, templateDir, { registry, rootDir, outputRoot });
        const status = { ok: true, status: "generated", templateDir, written: manifest.written || [], copiedAssets: manifest.copiedAssets || [] };
        writeBuildStatus(stateDir, status);
        sendJson(res, 200, status);
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/compile") {
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

module.exports = { createWorkbenchServer };
