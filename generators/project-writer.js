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

  const assetByBasename = new Map();
  for (const asset of assets) {
    const basename = path.basename(asset);
    const existing = assetByBasename.get(basename);
    if (existing && existing !== asset) {
      throw new Error(
        `Font asset basename collision: ${existing} and ${asset} both target ${basename}`
      );
    }
    assetByBasename.set(basename, asset);
  }

  const copied = [];
  const fontDir = path.join(templateDir, "font");
  ensureDir(fontDir);

  for (const asset of assets) {
    const source = resolveAssetPath(rootDir, asset);
    const target = path.join(fontDir, path.basename(asset));
    fs.copyFileSync(source, target);
    copied.push(target);
  }

  return copied;
}

function assertInsideOutputRoot(templateDir, outputRoot) {
  if (!outputRoot) return;

  const resolvedTemplateDir = path.resolve(templateDir);
  const resolvedOutputRoot = path.resolve(outputRoot);
  const relativePath = path.relative(resolvedOutputRoot, resolvedTemplateDir);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`Template output is outside output root: ${resolvedTemplateDir}`);
  }
}

function validationMessage(errors) {
  return errors.map((error) => `${error.path}: ${error.message}`).join("; ");
}

function writeTemplateProject(theme, templateDir, options = {}) {
  const registry = options.registry;
  const rootDir = options.rootDir || process.cwd();
  assertInsideOutputRoot(templateDir, options.outputRoot);
  const validation = validateTheme(theme, { registry });
  if (!validation.ok) {
    throw new Error(`Invalid theme: ${validationMessage(validation.errors)}`);
  }

  ensureDir(templateDir);
  const files = generateFiles(theme, registry);
  const written = [];

  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(templateDir, relativePath);
    writeTextFile(absolutePath, content);
    written.push(absolutePath);
  }

  const copiedAssets = copyFontAssets(theme, templateDir, registry, rootDir);

  return {
    templateDir,
    written,
    copiedAssets
  };
}

module.exports = {
  writeTemplateProject
};
