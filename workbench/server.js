const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_THEME, validateTheme } = require("../schema/theme-schema");
const { getRegistry } = require("../registry/options");
const { writeTemplateProject } = require("../generators/project-writer");
const { compileTemplate } = require("./build");

const MAX_JSON_BODY_BYTES = 1024 * 1024;
const WIZARD_ROUTES = new Set([
  "/start",
  "/color",
  "/font",
  "/bullets",
  "/blocks",
  "/navigation",
  "/title-page",
  "/review"
]);

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let settled = false;

    function fail(statusCode, message) {
      if (settled) return;
      settled = true;
      reject(new HttpError(statusCode, message));
      req.resume();
    }

    req.on("data", (chunk) => {
      if (settled) return;
      totalBytes += chunk.length;
      if (totalBytes > MAX_JSON_BODY_BYTES) {
        fail(413, "Request body too large");
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (settled) return;
      settled = true;
      const body = Buffer.concat(chunks, totalBytes).toString("utf8");
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new HttpError(400, "Invalid JSON request body"));
      }
    });

    req.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

function sendText(res, status, body, contentType = "text/plain; charset=utf-8") {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  res.writeHead(status, {
    "content-type": contentType,
    "content-length": payload.length
  });
  res.end(payload);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function themePath(stateDir) {
  return path.join(stateDir, "theme.json");
}

function buildStatusPath(stateDir) {
  return path.join(stateDir, "build-status.json");
}

function readTheme(stateDir) {
  const file = themePath(stateDir);
  if (!fs.existsSync(file)) return clone(DEFAULT_THEME);
  return JSON.parse(fs.readFileSync(file, "utf8"));
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
  const file = buildStatusPath(stateDir);
  if (!fs.existsSync(file)) return { status: "idle" };
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function invalidThemeError(errors) {
  const error = new HttpError(400, "Invalid theme");
  error.errors = errors;
  return error;
}

function readValidatedTheme(stateDir, registry) {
  const theme = readTheme(stateDir);
  const validation = validateTheme(theme, { registry });
  if (!validation.ok) {
    throw invalidThemeError(validation.errors);
  }
  return validation.value;
}

function resolveTemplateDir(outputRoot, templateName) {
  const resolvedOutputRoot = path.resolve(outputRoot);
  const resolvedTemplateDir = path.resolve(resolvedOutputRoot, templateName);
  const relativePath = path.relative(resolvedOutputRoot, resolvedTemplateDir);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new HttpError(400, "Template output is outside output root");
  }

  return resolvedTemplateDir;
}

function contentTypeFor(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".ttf")) return "font/ttf";
  return "text/plain; charset=utf-8";
}

function resolveStaticPath(publicDir, requestPathname) {
  let decodedPathname;
  try {
    decodedPathname = decodeURIComponent(requestPathname);
  } catch (error) {
    return null;
  }

  if (decodedPathname.includes("\0")) return null;

  const resolvedPublicDir = path.resolve(publicDir);
  const relativeRequest =
    decodedPathname === "/" ? "index.html" : decodedPathname.replace(/^[/\\]+/, "");
  const resolvedFile = path.resolve(resolvedPublicDir, relativeRequest);
  const relativePath = path.relative(resolvedPublicDir, resolvedFile);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }

  return resolvedFile;
}

function normalizeAssetPath(assetPath) {
  return String(assetPath).replace(/\\/g, "/").replace(/^\/+/, "");
}

function allowedAssetPathsForRegistry(registry) {
  const allowed = new Set();
  for (const font of Object.values(registry.fonts || {})) {
    for (const asset of font.assets || []) {
      allowed.add(normalizeAssetPath(asset));
    }
  }
  return allowed;
}

function resolveAssetPath(rootDir, requestPathname, allowedAssetPaths) {
  let decodedPathname;
  try {
    decodedPathname = decodeURIComponent(requestPathname);
  } catch (error) {
    return null;
  }

  if (decodedPathname.includes("\0") || !decodedPathname.startsWith("/assets/")) return null;

  const resolvedRootDir = path.resolve(rootDir);
  const relativeRequest = decodedPathname.replace(/^\/assets[/\\]+/, "");
  const normalizedRequest = normalizeAssetPath(relativeRequest);

  if (!allowedAssetPaths.has(normalizedRequest)) {
    return null;
  }

  const resolvedFile = path.resolve(resolvedRootDir, normalizedRequest);
  const relativePath = path.relative(resolvedRootDir, resolvedFile);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }

  return resolvedFile;
}

function serveStatic(req, res, publicDir) {
  const url = new URL(req.url, "http://localhost");
  const pathname = WIZARD_ROUTES.has(url.pathname) ? "/" : url.pathname;
  const filePath = resolveStaticPath(publicDir, pathname);

  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    sendText(res, 404, "Not found");
    return;
  }

  sendText(res, 200, fs.readFileSync(filePath), contentTypeFor(filePath));
}

function serveAsset(req, res, rootDir, allowedAssetPaths) {
  const url = new URL(req.url, "http://localhost");
  const filePath = resolveAssetPath(rootDir, url.pathname, allowedAssetPaths);

  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    sendText(res, 404, "Not found");
    return;
  }

  sendText(res, 200, fs.readFileSync(filePath), contentTypeFor(filePath));
}

function createWorkbenchServer(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const stateDir = options.stateDir || path.join(rootDir, "workbench", "state");
  const outputRoot = options.outputRoot || path.join(rootDir, "templates");
  const publicDir = options.publicDir || path.join(rootDir, "workbench", "public");
  const registry = options.registry || getRegistry();
  const projectWriter = options.writeTemplateProject || writeTemplateProject;
  const templateCompiler = options.compileTemplate || compileTemplate;
  const allowedAssetPaths = allowedAssetPathsForRegistry(registry);

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");

    try {
      if (req.method === "GET" && url.pathname === "/api/options") {
        sendJson(res, 200, registry);
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/theme") {
        sendJson(res, 200, readTheme(stateDir));
        return;
      }

      if (req.method === "PUT" && url.pathname === "/api/theme") {
        const theme = await readJsonBody(req);
        const validation = validateTheme(theme, { registry });
        if (!validation.ok) {
          sendJson(res, 400, { ok: false, errors: validation.errors });
          return;
        }
        writeTheme(stateDir, validation.value);
        sendJson(res, 200, { ok: true, theme: validation.value });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/generate") {
        const theme = readValidatedTheme(stateDir, registry);
        const templateDir = resolveTemplateDir(outputRoot, theme.identity.name);
        const manifest = projectWriter(theme, templateDir, { registry, rootDir, outputRoot });
        const status = {
          ok: true,
          status: "generated",
          templateDir,
          written: manifest.written || [],
          copiedAssets: manifest.copiedAssets || []
        };
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
        serveAsset(req, res, rootDir, allowedAssetPaths);
        return;
      }

      if (req.method === "GET") {
        serveStatic(req, res, publicDir);
        return;
      }

      sendText(res, 405, "Method not allowed");
    } catch (error) {
      if (res.writableEnded) return;
      const statusCode = error.statusCode || 500;
      if (error.errors) {
        sendJson(res, statusCode, { ok: false, errors: error.errors });
        return;
      }
      sendJson(res, statusCode, { ok: false, error: error.message });
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

if (require.main === module) {
  main();
}

module.exports = {
  createWorkbenchServer
};
