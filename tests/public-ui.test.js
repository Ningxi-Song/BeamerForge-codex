const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const publicDir = path.resolve(__dirname, "../workbench/public");
const read = (file) => fs.readFileSync(path.join(publicDir, file), "utf8");

test("the page is a read-only catalog shell", () => {
  const html = read("index.html");
  assert.match(html, /id="catalogGrid"/);
  assert.match(html, /id="recipeDetail"/);
  for (const retiredId of ["wizardApp", "welcomeScreen", "advancedPanel", "deliveryActions", "providerDialog"]) {
    assert.doesNotMatch(html, new RegExp(retiredId));
  }
  for (const retiredLabel of ["Start designing", "Refine with AI", "Build this design", "Choose a direction"]) {
    assert.doesNotMatch(html, new RegExp(retiredLabel));
  }
});

test("the browser script loads and renders recipes only", () => {
  const app = read("app.js");
  assert.match(app, /getJson\(["'`]\/api\/recipes["'`]/);
  assert.match(app, /\/api\/recipes\//);
  assert.match(app, /README|readme/);
  assert.match(app, /application\/pdf|\.pdf/);
  assert.match(app, /image|\.png/);
  for (const retiredToken of ["api/theme", "api/compile", "ai-customize", "provider", "generateProject"]) {
    assert.doesNotMatch(app, new RegExp(retiredToken));
  }
});
