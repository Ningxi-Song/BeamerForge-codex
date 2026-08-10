"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { createRecipeCatalog } = require("./recipe-catalog");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".webp": "image/webp"
};

function send(res, status, body, contentType = "text/plain; charset=utf-8") {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  res.writeHead(status, { "content-type": contentType, "content-length": buffer.length });
  res.end(buffer);
}

function sendJson(res, status, value) {
  send(res, status, JSON.stringify(value), "application/json; charset=utf-8");
}

function safePath(root, relativePath) {
  if (typeof relativePath !== "string" || relativePath.includes("\0")) return null;
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, relativePath);
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${path.sep}`)) return null;
  return target;
}

function contentTypeFor(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function serveFile(res, root, relativePath) {
  const target = safePath(root, relativePath);
  if (!target) return send(res, 404, "Not found");
  let stat;
  try {
    stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink()) return send(res, 404, "Not found");
  } catch {
    return send(res, 404, "Not found");
  }
  return send(res, 200, fs.readFileSync(target), contentTypeFor(target));
}

function decodePathPart(value) {
  try { return decodeURIComponent(value); }
  catch { return null; }
}

function createWorkbenchServer({ rootDir = path.resolve(__dirname, ".."), publicDir, recipesDir } = {}) {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedPublicDir = path.resolve(publicDir || path.join(resolvedRoot, "workbench", "public"));
  const resolvedRecipesDir = path.resolve(recipesDir || path.join(resolvedRoot, "recipes"));
  const catalog = createRecipeCatalog({ recipesDir: resolvedRecipesDir });

  return http.createServer((req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed");
    const url = new URL(req.url || "/", "http://localhost");
    const pathname = url.pathname;

    if (pathname === "/api/recipes") return sendJson(res, 200, catalog.listRecipes());
    if (pathname.startsWith("/api/recipes/")) {
      const slug = decodePathPart(pathname.slice("/api/recipes/".length));
      const recipe = slug && !slug.includes("/") ? catalog.getRecipe(slug) : null;
      return recipe ? sendJson(res, 200, recipe) : sendJson(res, 404, { error: "Recipe not found" });
    }
    if (pathname.startsWith("/recipes/")) {
      const parts = pathname.slice("/recipes/".length).split("/");
      const slug = decodePathPart(parts.shift());
      const relativePath = parts.map(decodePathPart);
      if (!slug || relativePath.some((part) => part === null) || relativePath.length === 0) return send(res, 404, "Not found");
      try {
        const target = catalog.resolveAsset(slug, relativePath.join("/"));
        return serveFile(res, resolvedRecipesDir, path.relative(resolvedRecipesDir, target));
      } catch {
        return send(res, 404, "Not found");
      }
    }

    const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
    return serveFile(res, resolvedPublicDir, relativePath);
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 5177);
  createWorkbenchServer().listen(port, () => {
    console.log(`Beamer template catalog listening at http://localhost:${port}`);
  });
}

module.exports = { createWorkbenchServer };
