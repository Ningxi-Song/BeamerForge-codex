const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DEFAULT_THEME } = require("../schema/theme-schema");
const { getRegistry } = require("../registry/options");
const { writeTemplateProject } = require("../generators/project-writer");
const { resolveDesignBundle } = require("../design/resolve-design");
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

test("writes a normalized complete theme.json for legacy sparse themes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "beamerforge-legacy-project-"));
  const outDir = path.join(root, "legacy-theme");
  const theme = structuredClone(DEFAULT_THEME);
  delete theme.identity.subtitle;
  delete theme.colors.blockBody;
  delete theme.colors.alert;
  delete theme.contentDefaults.sampleBullets;

  writeTemplateProject(theme, outDir, { registry: getRegistry(), rootDir: process.cwd() });
  const writtenTheme = JSON.parse(fs.readFileSync(path.join(outDir, "theme.json"), "utf8"));

  assert.equal(writtenTheme.identity.subtitle, "");
  assert.equal(writtenTheme.colors.blockBody, theme.colors.background);
  assert.equal(writtenTheme.colors.alert, theme.colors.accent);
  assert.deepEqual(writtenTheme.contentDefaults.sampleBullets, DEFAULT_THEME.contentDefaults.sampleBullets);
});

test("project writer invokes one resolved bundle pipeline", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "beamerforge-one-bundle-"));
  const outDir = path.join(root, "one-bundle");
  let calls = 0;

  writeTemplateProject(DEFAULT_THEME, outDir, {
    registry: getRegistry(),
    rootDir: process.cwd(),
    resolveDesignBundle(theme, registry) {
      calls += 1;
      return resolveDesignBundle(theme, registry);
    }
  });

  assert.equal(calls, 1);
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

test("copies a trusted corner logo into the generated project", () => {
  const theme = structuredClone(DEFAULT_THEME);
  theme.decorations.cornerLogo = { id: "duck", position: "top-right", size: "small", scope: "content-frames" };
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "beamerforge-logo-output-"));
  const templateDir = path.join(outputRoot, "duck-theme");
  const result = writeTemplateProject(theme, templateDir, { registry: getRegistry(), rootDir: process.cwd(), outputRoot });
  assert.equal(fs.existsSync(path.join(templateDir, "assets", "corner-logo.svg")), true);
  assert.equal(result.copiedAssets.includes(path.join(templateDir, "assets", "corner-logo.svg")), true);
});

test("rejects trusted font and decoration assets that escape rootDir", () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "beamerforge-asset-root-"));
  const rootDir = path.join(parent, "root");
  fs.mkdirSync(rootDir);
  const outputRoot = path.join(parent, "output");
  fs.mkdirSync(outputRoot);

  const fontRegistry = getRegistry();
  fontRegistry.fonts["escaping-font"] = {
    ...fontRegistry.fonts.neuton,
    id: "escaping-font",
    assets: ["../outside.ttf"]
  };
  const fontTheme = structuredClone(DEFAULT_THEME);
  fontTheme.fonts.body = "escaping-font";
  assert.throws(
    () => writeTemplateProject(fontTheme, path.join(outputRoot, "font"), { registry: fontRegistry, rootDir, outputRoot }),
    /Trusted asset path escapes rootDir/
  );

  const logoRegistry = getRegistry();
  logoRegistry.logos["escaping-logo"] = {
    ...logoRegistry.logos.duck,
    id: "escaping-logo",
    asset: "../outside.svg"
  };
  const logoTheme = structuredClone(DEFAULT_THEME);
  logoTheme.decorations.cornerLogo.id = "escaping-logo";
  assert.throws(
    () => writeTemplateProject(logoTheme, path.join(outputRoot, "logo"), { registry: logoRegistry, rootDir, outputRoot }),
    /Trusted asset path escapes rootDir/
  );
});
