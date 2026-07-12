"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { generateResolvedFiles } = require("./latex");
const { getRegistry, resolveAssetPath } = require("../registry/options");
const { resolveDesignBundle } = require("../design/resolve-design");
const { renderSvg } = require("../design/vector-renderers");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeTextFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
}

function trustedSourcePath(rootDir, asset) {
  const root = path.resolve(rootDir);
  const source = path.resolve(resolveAssetPath(root, asset));
  const relative = path.relative(root, source);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Trusted asset path escapes rootDir: ${asset}`);
  }
  return source;
}

function copyFontAssets(design, templateDir, rootDir) {
  const assets = new Set([
    ...design.typography.body.assets,
    ...design.typography.title.assets
  ]);
  if (assets.size === 0) return [];

  const seen = new Map();
  for (const asset of assets) {
    const base = path.basename(asset);
    if (seen.has(base) && seen.get(base) !== asset) {
      throw new Error(`Font asset basename collision: '${seen.get(base)}' and '${asset}' both resolve to '${base}'`);
    }
    seen.set(base, asset);
  }

  const fontDir = path.join(templateDir, "font");
  ensureDir(fontDir);
  const copied = [];
  for (const asset of assets) {
    const src = trustedSourcePath(rootDir, asset);
    const dest = path.join(fontDir, path.basename(asset));
    fs.copyFileSync(src, dest);
    copied.push(dest);
  }
  return copied;
}

function assertInsideRoot(templateDir, outputRoot) {
  if (!outputRoot) return;
  const rel = path.relative(path.resolve(outputRoot), path.resolve(templateDir));
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Template output is outside output root: ${path.resolve(templateDir)}`);
  }
}

function writeTemplateProject(theme, templateDir, options = {}) {
  const registry = options.registry || getRegistry();
  const rootDir = options.rootDir || process.cwd();
  assertInsideRoot(templateDir, options.outputRoot);

  const bundleResolver = options.resolveDesignBundle || resolveDesignBundle;
  const bundle = bundleResolver(theme, registry);
  const normalizedTheme = bundle.theme;
  const design = bundle.design;

  ensureDir(templateDir);
  const files = {
    ...generateResolvedFiles(design),
    "theme.json": `${JSON.stringify(normalizedTheme, null, 2)}\n`
  };
  if (design.components.cornerLogo.vector !== null) {
    files["assets/corner-logo.svg"] = renderSvg(design.components.cornerLogo.vector);
  }
  const written = [];
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(templateDir, rel);
    writeTextFile(abs, content);
    written.push(abs);
  }

  const copiedAssets = copyFontAssets(design, templateDir, rootDir);
  return { templateDir, written, copiedAssets };
}

module.exports = { writeTemplateProject };
