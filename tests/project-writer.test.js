const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DEFAULT_THEME } = require("../schema/theme-schema");
const { getRegistry } = require("../registry/options");
const { writeTemplateProject } = require("../generators/project-writer");
const { parseArgs } = require("../generators/cli");

test("parseArgs rejects missing --out value", () => {
  assert.throws(
    () => parseArgs(["node", "cli", "--out"]),
    /Missing value for --out/
  );
});

test("parseArgs rejects missing --theme value", () => {
  assert.throws(
    () => parseArgs(["node", "cli", "--theme"]),
    /Missing value for --theme/
  );
});

test("writes a complete template project", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "beamerforge-project-"));
  const outDir = path.join(root, "blue-academic");
  const manifest = writeTemplateProject(DEFAULT_THEME, outDir, {
    registry: getRegistry(),
    rootDir: process.cwd()
  });

  assert.equal(manifest.templateDir, outDir);
  assert.equal(fs.existsSync(path.join(outDir, "main.tex")), true);
  assert.equal(fs.existsSync(path.join(outDir, "theme.cls")), true);
  assert.equal(fs.existsSync(path.join(outDir, "theme.json")), true);
  assert.equal(fs.existsSync(path.join(outDir, "content", "overview.tex")), true);
});

test("copies font assets when a font declares assets", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "beamerforge-font-"));
  const outDir = path.join(root, "neuton-template");
  const theme = JSON.parse(JSON.stringify(DEFAULT_THEME));
  theme.identity.name = "neuton-template";
  theme.fonts.body = "neuton";
  theme.fonts.title = "neuton";

  writeTemplateProject(theme, outDir, {
    registry: getRegistry(),
    rootDir: process.cwd()
  });

  assert.equal(fs.existsSync(path.join(outDir, "font", "Neuton-Regular.ttf")), true);
});

test("rejects template output outside outputRoot", () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "beamerforge-root-"));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "beamerforge-outside-"));
  const outDir = path.join(outsideRoot, "template");

  assert.throws(
    () =>
      writeTemplateProject(DEFAULT_THEME, outDir, {
        registry: getRegistry(),
        rootDir: process.cwd(),
        outputRoot
      }),
    /outside output root/
  );
});

test("detects font asset basename collisions", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "beamerforge-collision-root-"));
  const firstFontDir = path.join(root, "first");
  const secondFontDir = path.join(root, "second");
  fs.mkdirSync(firstFontDir, { recursive: true });
  fs.mkdirSync(secondFontDir, { recursive: true });
  fs.writeFileSync(path.join(firstFontDir, "Shared.ttf"), "first");
  fs.writeFileSync(path.join(secondFontDir, "Shared.ttf"), "second");

  const registry = getRegistry();
  const collisionRegistry = {
    ...registry,
    fonts: {
      ...registry.fonts,
      "collision-body": {
        ...registry.fonts.neuton,
        assets: ["first/Shared.ttf"]
      },
      "collision-title": {
        ...registry.fonts.neuton,
        assets: ["second/Shared.ttf"]
      }
    }
  };
  const theme = JSON.parse(JSON.stringify(DEFAULT_THEME));
  theme.fonts.body = "collision-body";
  theme.fonts.title = "collision-title";
  const outDir = path.join(root, "template");

  assert.throws(
    () =>
      writeTemplateProject(theme, outDir, {
        registry: collisionRegistry,
        rootDir: root
      }),
    /Font asset basename collision/
  );
});
