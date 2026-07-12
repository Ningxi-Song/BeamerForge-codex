const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_THEME, validateTheme } = require("../schema/theme-schema");
const { getRegistry, resolveThemeChoices, resolveAssetPath } = require("../registry/options");

test("registry covers the rollout minimum", () => {
  const registry = getRegistry();
  assert.equal(Object.keys(registry.palettes).length >= 5, true);
  assert.equal(Object.keys(registry.fonts).length >= 5, true);
  assert.equal(Object.keys(registry.bullets).length >= 5, true);
  assert.equal(Object.keys(registry.navigation).length >= 4, true);
  assert.equal(Object.keys(registry.blocks).length >= 3, true);
  assert.deepEqual(Object.keys(registry.titlePages), ["left-curtain"]);
});

test("registry exposes broader local font and bullet catalogs", () => {
  const registry = getRegistry();

  assert.equal(Object.keys(registry.fonts).length >= 35, true);
  assert.equal(Object.keys(registry.bullets).length >= 18, true);
  assert.equal(Boolean(registry.fonts.lato), true);
  assert.equal(Boolean(registry.fonts["fira-sans"]), true);
  assert.equal(Boolean(registry.fonts["ibm-plex-mono"]), true);
  assert.equal(Boolean(registry.bullets["pifont-ding67"]), true);
  assert.equal(Boolean(registry.bullets["math-oplus"]), true);
  assert.match(registry.bullets["tikz-octagon"].packageLine, /tikz/);
});

test("default theme IDs resolve against registry", () => {
  const registry = getRegistry();
  const validation = validateTheme(DEFAULT_THEME, { registry });
  assert.equal(validation.ok, true);
  const choices = resolveThemeChoices(DEFAULT_THEME, registry);
  assert.equal(choices.palette.label, "Academic Blue");
  assert.equal(choices.bodyFont.label, "Palatino");
  assert.equal(choices.navigation.label, "Page Number");
});

test("unknown IDs produce schema errors", () => {
  const registry = getRegistry();
  const broken = JSON.parse(JSON.stringify(DEFAULT_THEME));
  broken.navigation.style = "not-a-navigation-style";
  const validation = validateTheme(broken, { registry });
  assert.equal(validation.ok, false);
  assert.deepEqual(validation.errors.map((error) => error.path), ["navigation.style"]);
});

test("all palette options validate when applied to the default theme", () => {
  const registry = getRegistry();

  for (const palette of Object.values(registry.palettes)) {
    const theme = JSON.parse(JSON.stringify(DEFAULT_THEME));
    theme.colors.paletteId = palette.id;
    Object.assign(theme.colors, palette.colors);

    const validation = validateTheme(theme, { registry });
    assert.equal(validation.ok, true, `${palette.id} should validate`);
  }
});

test("custom palette is available for workbench-authored colors", () => {
  const registry = getRegistry();

  assert.equal(registry.palettes.custom.id, "custom");
  assert.equal(registry.palettes.custom.label, "Custom");
  assert.equal(/^#[0-9A-Fa-f]{6}$/.test(registry.palettes.custom.colors.alert), true);
});

test("registry preview metadata covers visible workbench controls", () => {
  const registry = getRegistry();

  for (const palette of Object.values(registry.palettes)) {
    assert.equal(/^#[0-9A-Fa-f]{6}$/.test(palette.colors.background), true);
    assert.equal(/^#[0-9A-Fa-f]{6}$/.test(palette.colors.primary), true);
    assert.equal(/^#[0-9A-Fa-f]{6}$/.test(palette.colors.accent), true);
  }

  for (const bullet of Object.values(registry.bullets)) {
    assert.equal(typeof bullet.cssMarker, "string");
    assert.notEqual(bullet.cssMarker.length, 0);
  }

  for (const font of Object.values(registry.fonts)) {
    assert.equal(typeof font.cssFamily, "string");
    assert.notEqual(font.cssFamily.length, 0);
    assert.equal(Array.isArray(font.assets), true);
  }

  const rootDir = path.resolve(__dirname, "..");
  for (const font of Object.values(registry.fonts)) {
    for (const asset of font.assets) {
      assert.equal(fs.existsSync(resolveAssetPath(rootDir, asset)), true, asset);
    }
  }

  for (const navigation of Object.values(registry.navigation)) {
    assert.equal(typeof navigation.hasHeader, "boolean");
    assert.equal(typeof navigation.hasFootline, "boolean");
    assert.equal(typeof navigation.latexFootline, "string");
  }

  for (const block of Object.values(registry.blocks)) {
    assert.equal(typeof block.cssRadius, "string");
    assert.equal(typeof block.cssShadow, "string");
  }
});

test("getRegistry returns isolated clones", () => {
  const first = getRegistry();
  first.fonts.palatino.label = "Changed Palatino";

  const second = getRegistry();
  assert.equal(second.fonts.palatino.label, "Palatino");
});

test("Neuton font assets exist and use valid fontspec order", () => {
  const registry = getRegistry();
  const neuton = registry.fonts.neuton;
  const rootDir = path.resolve(__dirname, "..");

  for (const asset of neuton.assets) {
    assert.equal(fs.existsSync(resolveAssetPath(rootDir, asset)), true);
  }

  const optionIndex = neuton.latexPreamble.indexOf("\\setmainfont[Path=font/");
  const fontIndex = neuton.latexPreamble.indexOf("{Neuton-Regular.ttf}");
  assert.notEqual(optionIndex, -1);
  assert.notEqual(fontIndex, -1);
  assert.equal(optionIndex < fontIndex, true);
});

test("registry exposes trusted corner logos", () => {
  const registry = getRegistry();
  assert.equal(registry.logos.none.asset, null);
  assert.equal(registry.logos.duck.asset, "elements/decorations/logos/duck.svg");
  assert.equal(fs.existsSync(path.resolve(registry.logos.duck.asset)), true);
});
