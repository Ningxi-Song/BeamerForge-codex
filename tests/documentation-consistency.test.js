const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const docs = ["README.md", "WORKFLOW.md", "ARCHITECTURE.md", "AGENTS.md"];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("current documentation describes the folder-backed recipe catalog", () => {
  for (const file of docs) {
    const content = read(file);
    assert.match(content, /recipes\//, `${file} omits the recipe folder contract`);
  }
  assert.match(read("README.md"), /npm start/);
  assert.match(read("WORKFLOW.md"), /README\.md/);
  assert.match(read("ARCHITECTURE.md"), /recipe-catalog\.js/);
});

test("current documentation does not advertise retired authoring behavior", () => {
  const content = docs.map(read).join("\n");
  for (const phrase of ["Refine with AI", "Generate Template", "Compile PDF", "/api/theme", "/api/compile", "wizardApp"]) {
    assert.equal(content.includes(phrase), false, `documentation still advertises ${phrase}`);
  }
});
