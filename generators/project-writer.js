"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { validateTheme } = require("../schema/theme-schema");
const { generateResolvedFiles } = require("./latex");
const { getRegistry, resolveAssetPath } = require("../registry/options");
const { resolveDesign } = require("../design/resolve-design");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeTextFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
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
    const src = resolveAssetPath(rootDir, asset);
    const dest = path.join(fontDir, path.basename(asset));
    fs.copyFileSync(src, dest);
    copied.push(dest);
  }
  return copied;
}

function copyDecorationAssets(design, templateDir, rootDir) {
  const asset = design.components.cornerLogo.trustedAssetPath;
  if (!asset) return [];
  const source = resolveAssetPath(rootDir, asset);
  const destination = path.join(templateDir, "assets", "corner-logo.svg");
  ensureDir(path.dirname(destination));
  fs.copyFileSync(source, destination);
  return [destination];
}

function assertInsideRoot(templateDir, outputRoot) {
  if (!outputRoot) return;
  const rel = path.relative(path.resolve(outputRoot), path.resolve(templateDir));
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Template output is outside output root: ${path.resolve(templateDir)}`);
  }
}

function formatErrors(errors) {
  return errors.map((e) => `${e.path}: ${e.message}`).join("; ");
}

function writeTemplateProject(theme, templateDir, options = {}) {
  const registry = options.registry || getRegistry();
  const rootDir = options.rootDir || process.cwd();
  assertInsideRoot(templateDir, options.outputRoot);

  const validation = validateTheme(theme, { registry });
  if (!validation.ok) throw new Error(`Invalid theme: ${formatErrors(validation.errors)}`);
  const normalizedTheme = validation.value;
  const design = resolveDesign(normalizedTheme, registry);

  ensureDir(templateDir);
  const files = {
    ...generateResolvedFiles(design),
    "theme.json": `${JSON.stringify(normalizedTheme, null, 2)}\n`
  };
  const written = [];
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(templateDir, rel);
    writeTextFile(abs, content);
    written.push(abs);
  }

  const copiedAssets = [
    ...copyFontAssets(design, templateDir, rootDir),
    ...copyDecorationAssets(design, templateDir, rootDir)
  ];
  return { templateDir, written, copiedAssets };
}

module.exports = { writeTemplateProject };
