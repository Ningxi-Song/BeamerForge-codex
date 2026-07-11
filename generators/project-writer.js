"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { validateTheme } = require("../schema/theme-schema");
const { generateFiles } = require("./latex");
const { resolveThemeChoices, resolveAssetPath } = require("../registry/options");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeTextFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
}

function copyFontAssets(theme, templateDir, registry, rootDir) {
  const choices = resolveThemeChoices(theme, registry);
  const assets = new Set([...choices.bodyFont.assets, ...choices.titleFont.assets]);
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
  const registry = options.registry;
  const rootDir = options.rootDir || process.cwd();
  assertInsideRoot(templateDir, options.outputRoot);

  const validation = validateTheme(theme, { registry });
  if (!validation.ok) throw new Error(`Invalid theme: ${formatErrors(validation.errors)}`);

  ensureDir(templateDir);
  const files = generateFiles(theme, registry);
  const written = [];
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(templateDir, rel);
    writeTextFile(abs, content);
    written.push(abs);
  }

  const copiedAssets = copyFontAssets(theme, templateDir, registry, rootDir);
  return { templateDir, written, copiedAssets };
}

module.exports = { writeTemplateProject };
