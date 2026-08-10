const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRecipeCatalog } = require("../workbench/recipe-catalog");

function temporaryDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "beamerforge-recipes-"));
}

test("discovers recipe introductions and supported previews", () => {
  const recipesDir = temporaryDirectory();
  const recipeDir = path.join(recipesDir, "clean-academic");
  fs.mkdirSync(recipeDir);
  fs.writeFileSync(path.join(recipeDir, "README.md"), "# Clean Academic\n\nA quiet template.", "utf8");
  fs.writeFileSync(path.join(recipeDir, "main.pdf"), "pdf", "utf8");
  fs.writeFileSync(path.join(recipeDir, "page02.png"), "two", "utf8");
  fs.writeFileSync(path.join(recipeDir, "page01.png"), "one", "utf8");
  fs.writeFileSync(path.join(recipeDir, "main.tex"), "\\documentclass{beamer}", "utf8");

  const catalog = createRecipeCatalog({ recipesDir });
  assert.deepEqual(catalog.listRecipes(), [{
    slug: "clean-academic",
    title: "Clean Academic",
    readme: "# Clean Academic\n\nA quiet template.",
    pdf: "main.pdf",
    images: ["page01.png", "page02.png"]
  }]);
  assert.deepEqual(catalog.getRecipe("clean-academic"), catalog.listRecipes()[0]);
  assert.equal(catalog.resolveAsset("clean-academic", "main.pdf"), path.join(recipeDir, "main.pdf"));
});

test("ignores invalid or incomplete recipe folders", () => {
  const recipesDir = temporaryDirectory();
  fs.mkdirSync(path.join(recipesDir, "valid_recipe"));
  fs.mkdirSync(path.join(recipesDir, "bad.slug"));
  fs.writeFileSync(path.join(recipesDir, "not-a-recipe.txt"), "ignored", "utf8");

  const catalog = createRecipeCatalog({ recipesDir });
  assert.deepEqual(catalog.listRecipes(), [{
    slug: "valid_recipe",
    title: "valid recipe",
    readme: "",
    pdf: null,
    images: []
  }]);
  assert.equal(catalog.getRecipe("missing"), null);
});

test("rejects traversal, symlinks, and unsupported assets", () => {
  const recipesDir = temporaryDirectory();
  const recipeDir = path.join(recipesDir, "safe");
  fs.mkdirSync(recipeDir);
  fs.writeFileSync(path.join(recipeDir, "README.md"), "safe", "utf8");
  fs.writeFileSync(path.join(recipesDir, "outside.txt"), "outside", "utf8");
  fs.writeFileSync(path.join(recipeDir, "notes.txt"), "notes", "utf8");
  const catalog = createRecipeCatalog({ recipesDir });

  assert.throws(() => catalog.resolveAsset("safe", "../outside.txt"), /Invalid recipe asset/);
  assert.throws(() => catalog.resolveAsset("safe", "notes.txt"), /Invalid recipe asset/);
  assert.throws(() => catalog.resolveAsset("safe", "missing.png"), /Invalid recipe asset/);
});
