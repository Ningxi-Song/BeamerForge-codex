"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_THEME, validateTheme } = require("../schema/theme-schema");
const { getRegistry } = require("../registry/options");
const {
  resolveDesign,
  deepFreeze,
  GENERATOR_VERSION
} = require("../design/resolve-design");

function clone(value) {
  return structuredClone(value);
}

function reverseObjectKeys(value) {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).reverse().map((key) => [key, reverseObjectKeys(value[key])])
    );
  }
  return value;
}

test("resolved design contains full identity, exact canvas, colors, and component IDs", () => {
  const design = resolveDesign(DEFAULT_THEME, getRegistry());

  assert.deepEqual(design.identity, DEFAULT_THEME.identity);
  assert.deepEqual(design.canvas, {
    aspectRatio: "16:9",
    widthUnits: 16,
    heightUnits: 9
  });
  assert.equal(design.colors.primary, "#456990");
  assert.equal(design.components.bullet.id, "pifont-outline");
  assert.equal(design.components.navigation.id, "page-number");
  assert.equal(design.source.generatorVersion, GENERATOR_VERSION);
  assert.equal(GENERATOR_VERSION, "1");
  assert.match(design.source.themeHash, /^[a-f0-9]{64}$/);
});

test("resolved designs are deeply frozen, serializable, and detached from inputs", () => {
  const theme = clone(DEFAULT_THEME);
  const registry = getRegistry();
  const design = resolveDesign(theme, registry);

  assert.equal(Object.isFrozen(design), true);
  assert.equal(Object.isFrozen(design.identity), true);
  assert.equal(Object.isFrozen(design.components.cornerLogo), true);
  assert.equal(Object.isFrozen(design.content.bullets), true);
  assert.doesNotThrow(() => JSON.stringify(design));
  assert.throws(() => { design.colors.primary = "#000000"; }, TypeError);
  assert.throws(() => { design.content.bullets.push("mutated"); }, TypeError);

  theme.identity.title = "Changed after resolution";
  theme.contentDefaults.sampleBullets[0] = "Changed after resolution";
  registry.bullets[DEFAULT_THEME.bullets.style].label = "Changed registry label";

  assert.equal(design.identity.title, DEFAULT_THEME.identity.title);
  assert.equal(design.content.bullets[0], DEFAULT_THEME.contentDefaults.sampleBullets[0]);
  assert.equal(design.components.bullet.label, "Pifont Outline");
});

test("deepFreeze recursively freezes arrays and object members", () => {
  const value = deepFreeze({ nested: [{ value: 1 }] });

  assert.equal(Object.isFrozen(value), true);
  assert.equal(Object.isFrozen(value.nested), true);
  assert.equal(Object.isFrozen(value.nested[0]), true);
});

test("resolver reports every validation path before registry lookup", () => {
  const theme = clone(DEFAULT_THEME);
  theme.navigation.style = "missing";
  theme.identity.title = 42;

  assert.throws(
    () => resolveDesign(theme, getRegistry()),
    (error) => error.message.startsWith("Invalid theme: ")
      && error.message.includes("identity.title")
      && error.message.includes("navigation.style")
  );
});

test("legacy sparse themes normalize to complete detached resolved designs", () => {
  const theme = clone(DEFAULT_THEME);
  const registry = getRegistry();
  for (const field of ["title", "subtitle", "author", "institute", "date"]) {
    delete theme.identity[field];
  }
  delete theme.colors.blockBody;
  delete theme.colors.alert;
  delete theme.contentDefaults.sampleBullets;

  const validation = validateTheme(theme, { registry });
  assert.equal(validation.ok, true);
  assert.deepEqual(validation.value.identity, {
    name: DEFAULT_THEME.identity.name,
    title: "",
    subtitle: "",
    author: "",
    institute: "",
    date: ""
  });
  assert.equal(validation.value.colors.blockBody, theme.colors.background);
  assert.equal(validation.value.colors.alert, theme.colors.accent);
  assert.deepEqual(
    validation.value.contentDefaults.sampleBullets,
    DEFAULT_THEME.contentDefaults.sampleBullets
  );
  assert.notEqual(
    validation.value.contentDefaults.sampleBullets,
    DEFAULT_THEME.contentDefaults.sampleBullets
  );

  const design = resolveDesign(theme, registry);
  const serialized = JSON.parse(JSON.stringify(design));
  assert.deepEqual(serialized.identity, validation.value.identity);
  assert.equal(serialized.colors.blockBody, theme.colors.background);
  assert.equal(serialized.colors.alert, theme.colors.accent);
  assert.deepEqual(serialized.content.bullets, DEFAULT_THEME.contentDefaults.sampleBullets);
  assert.equal(
    design.source.themeHash,
    resolveDesign(validation.value, registry).source.themeHash
  );
});

for (const field of ["title", "subtitle", "author", "institute", "date"]) {
  test(`present non-string identity.${field} keeps its exact validation path`, () => {
    const theme = clone(DEFAULT_THEME);
    theme.identity[field] = 42;
    const validation = validateTheme(theme, { registry: getRegistry() });

    assert.equal(validation.ok, false);
    assert.deepEqual(validation.errors.map((error) => error.path), [`identity.${field}`]);
  });
}

for (const field of ["blockBody", "alert"]) {
  test(`present non-color colors.${field} keeps its exact validation path`, () => {
    const theme = clone(DEFAULT_THEME);
    theme.colors[field] = 42;
    const validation = validateTheme(theme, { registry: getRegistry() });

    assert.equal(validation.ok, false);
    assert.deepEqual(validation.errors.map((error) => error.path), [`colors.${field}`]);
  });
}

test("present non-array sample bullets keep their exact validation path", () => {
  const theme = clone(DEFAULT_THEME);
  theme.contentDefaults.sampleBullets = "not an array";
  const validation = validateTheme(theme, { registry: getRegistry() });

  assert.equal(validation.ok, false);
  assert.deepEqual(
    validation.errors.map((error) => error.path),
    ["contentDefaults.sampleBullets"]
  );
});

test("serialized resolved identity and colors contain every contract field", () => {
  const serialized = JSON.parse(JSON.stringify(resolveDesign(DEFAULT_THEME, getRegistry())));

  for (const field of ["name", "title", "subtitle", "author", "institute", "date"]) {
    assert.notEqual(serialized.identity[field], undefined, `identity.${field}`);
  }
  for (const field of [
    "background",
    "primary",
    "accent",
    "text",
    "blockBody",
    "alert",
    "primaryText"
  ]) {
    assert.notEqual(serialized.colors[field], undefined, `colors.${field}`);
  }
});

test("4:3 themes resolve to normalized canvas units", () => {
  const theme = clone(DEFAULT_THEME);
  theme.foundation.aspectRatio = "4:3";

  assert.deepEqual(resolveDesign(theme, getRegistry()).canvas, {
    aspectRatio: "4:3",
    widthUnits: 4,
    heightUnits: 3
  });
});

test("medium duck logos resolve normalized size, vector identity, and trusted asset path", () => {
  const theme = clone(DEFAULT_THEME);
  theme.decorations.cornerLogo = {
    id: "duck",
    position: "top-left",
    size: "medium",
    scope: "all-frames"
  };

  assert.deepEqual(resolveDesign(theme, getRegistry()).components.cornerLogo, {
    id: "duck",
    label: "Duck",
    position: "top-left",
    sizeUnits: 1.2,
    scope: "all-frames",
    vectorId: "duck",
    previewUrl: "/assets/elements/decorations/logos/duck.svg",
    trustedAssetPath: "elements/decorations/logos/duck.svg"
  });
});

test("trusted logo asset paths are frozen and detached from the registry", () => {
  const theme = clone(DEFAULT_THEME);
  theme.decorations.cornerLogo.id = "duck";
  const registry = getRegistry();
  const design = resolveDesign(theme, registry);

  registry.logos.duck.asset = "changed-after-resolution.svg";

  assert.equal(design.components.cornerLogo.trustedAssetPath, "elements/decorations/logos/duck.svg");
  assert.equal(Object.isFrozen(design.components.cornerLogo), true);
  assert.throws(() => { design.components.cornerLogo.trustedAssetPath = "mutated.svg"; }, TypeError);
});

test("typography assets are detached from the registry", () => {
  const theme = clone(DEFAULT_THEME);
  theme.fonts.body = "neuton";
  const registry = getRegistry();
  const design = resolveDesign(theme, registry);

  assert.notEqual(design.typography.body.assets, registry.fonts.neuton.assets);
  registry.fonts.neuton.assets.push("late-mutation.ttf");
  assert.equal(design.typography.body.assets.includes("late-mutation.ttf"), false);
});

test("theme hashes ignore object key order and track meaningful nested changes", () => {
  const theme = clone(DEFAULT_THEME);
  const reordered = reverseObjectKeys(theme);
  const changed = clone(theme);
  changed.identity.subtitle = "Meaningfully different subtitle";

  const originalHash = resolveDesign(theme, getRegistry()).source.themeHash;
  const reorderedHash = resolveDesign(reordered, getRegistry()).source.themeHash;
  const changedHash = resolveDesign(changed, getRegistry()).source.themeHash;

  assert.equal(originalHash, reorderedHash);
  assert.notEqual(originalHash, changedHash);
});

test("selected unsupported renderers propagate deterministic limitations", () => {
  const registry = getRegistry();
  registry.blocks.rounded.renderers.html = false;
  registry.blocks.rounded.limitations = {
    html: "Rounded blocks fall back to square corners."
  };

  const design = resolveDesign(DEFAULT_THEME, registry);

  assert.equal(design.capabilities.html, false);
  assert.equal(design.capabilities.latex, true);
  assert.deepEqual(design.capabilities.approximations, [
    {
      renderer: "html",
      optionId: "rounded",
      limitation: "Rounded blocks fall back to square corners."
    }
  ]);
});

test("unsupported renderer limitations are normalized without freezing registry values", () => {
  const registry = getRegistry();
  const limitation = {
    toString() {
      return "  HTML uses a simplified block treatment.  ";
    }
  };
  registry.blocks.rounded.renderers.html = false;
  registry.blocks.rounded.limitations = { html: limitation };

  const design = resolveDesign(DEFAULT_THEME, registry);

  assert.equal(
    design.capabilities.approximations[0].limitation,
    "HTML uses a simplified block treatment."
  );
  assert.equal(Object.isFrozen(limitation), false);
  assert.doesNotThrow(() => JSON.stringify(design));
});
