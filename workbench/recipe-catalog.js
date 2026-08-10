"use strict";

const fs = require("node:fs");
const path = require("node:path");

const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const IMAGE_RE = /\.(?:png|jpe?g|webp)$/i;

function isRegularFile(filePath) {
  try {
    const stat = fs.lstatSync(filePath);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function isDirectory(directoryPath) {
  try {
    const stat = fs.lstatSync(directoryPath);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function displayTitle(slug, readme) {
  const heading = readme.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading;
  return slug.replace(/[-_]+/g, " ");
}

function createRecipeCatalog({ recipesDir }) {
  const root = path.resolve(recipesDir);

  function listRecipes() {
    if (!isDirectory(root)) return [];
    return fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && SLUG_RE.test(entry.name))
      .map((entry) => {
        const recipeDir = path.join(root, entry.name);
        const readmePath = path.join(recipeDir, "README.md");
        const readme = isRegularFile(readmePath) ? fs.readFileSync(readmePath, "utf8") : "";
        const files = fs.readdirSync(recipeDir, { withFileTypes: true })
          .filter((file) => file.isFile() && !file.isSymbolicLink())
          .map((file) => file.name);
        return {
          slug: entry.name,
          title: displayTitle(entry.name, readme),
          readme,
          pdf: files.includes("main.pdf") ? "main.pdf" : null,
          images: files.filter((file) => IMAGE_RE.test(file)).sort((a, b) => a.localeCompare(b))
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  function getRecipe(slug) {
    return listRecipes().find((recipe) => recipe.slug === slug) || null;
  }

  function resolveAsset(slug, relativePath) {
    const recipe = getRecipe(slug);
    if (!recipe || typeof relativePath !== "string" || !relativePath || path.isAbsolute(relativePath)) {
      throw new Error("Invalid recipe asset");
    }
    const recipeDir = path.resolve(root, slug);
    const target = path.resolve(recipeDir, relativePath);
    if (path.dirname(target) !== recipeDir || !isRegularFile(target)) throw new Error("Invalid recipe asset");
    const allowed = new Set(["main.pdf", ...recipe.images]);
    if (!allowed.has(path.basename(target))) throw new Error("Invalid recipe asset");
    return target;
  }

  return { listRecipes, getRecipe, resolveAsset };
}

module.exports = { createRecipeCatalog };
