const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("package scripts define the workbench commands", () => {
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.equal(pkg.private, true);
  assert.equal(pkg.type, "commonjs");
  assert.equal(pkg.scripts.test, "node --test tests");
  assert.match(pkg.scripts.check, /node --check schema\/theme-schema\.js/);
  assert.equal(pkg.scripts.start, "node workbench/server.js");
  assert.equal(pkg.scripts.generate, "node generators/cli.js --theme theme.json --out templates/generated");
  assert.equal(pkg.scripts["smoke:compile"], "node workbench/smoke-compile.js");
});
