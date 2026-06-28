const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DEFAULT_THEME } = require("../schema/theme-schema");
const { getRegistry } = require("../registry/options");
const { writeTemplateProject } = require("../generators/project-writer");
const { compileTemplate } = require("./build");

const templateDir = fs.mkdtempSync(path.join(os.tmpdir(), "beamerforge-compile-"));

writeTemplateProject(DEFAULT_THEME, templateDir, {
  registry: getRegistry(),
  rootDir: process.cwd()
});

const result = compileTemplate(templateDir);
console.log(JSON.stringify({ templateDir, result }, null, 2));

if (result.ok) {
  process.exit(0);
}

if (result.status === "missing-compiler") {
  process.exit(2);
}

process.exit(1);
