"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_THEME } = require("../schema/theme-schema");
const { getRegistry, defineRegistryCollection } = require("../registry/options");
const { validateRegistryContract, assertRegistryContract } = require("../design/registry-contract");
const { resolveDesign } = require("../design/resolve-design");

test("every selectable registry option declares HTML and LaTeX support", () => {
  assert.deepEqual(validateRegistryContract(getRegistry()), []);
});

const SEMANTIC_FIELDS = [
  ["palettes", "academic-blue", "id", "must be a non-empty string"],
  ["palettes", "academic-blue", "label", "must be a non-empty string"],
  ["fonts", "palatino", "cssFamily", "must be a non-empty string"],
  ["fonts", "palatino", "latexPreamble", "must be a non-empty string"],
  ["fonts", "palatino", "latexTitlePackage", "must be a string"],
  ["fonts", "palatino", "latexTitleFamily", "must be a string"],
  ["fonts", "palatino", "assets", "must be an array of strings"],
  ["bullets", "pifont-outline", "marker", "must be a non-empty string"],
  ["bullets", "pifont-outline", "latexPackages", "must be a string"],
  ["bullets", "pifont-outline", "latexItem", "must be a non-empty string"],
  ["bullets", "pifont-outline", "latexSubitem", "must be a non-empty string"],
  ["blocks", "rounded", "radiusUnits", "must be a finite number"],
  ["blocks", "rounded", "shadow", "must be a boolean"],
  ["blocks", "rounded", "cssRadius", "must be a string"],
  ["blocks", "rounded", "cssShadow", "must be a string"],
  ["blocks", "rounded", "latexTemplate", "must be a string"],
  ["navigation", "page-number", "header", "must be a boolean"],
  ["navigation", "page-number", "footline", "must be a boolean"],
  ["navigation", "page-number", "latexOuterTheme", "must be a string"],
  ["navigation", "page-number", "latexFootline", "must be a string"],
  ["titlePages", "left-curtain", "alignment", "must be a non-empty string"],
  ["titlePages", "left-curtain", "layout", "must be a non-empty string"],
  ["logos", "duck", "previewUrl", "must be a string"]
];

for (const [collection, id, field, message] of SEMANTIC_FIELDS) {
  for (const variant of ["deleted", "wrong type"]) {
    test(`${collection}.${id}.${field} rejects ${variant}`, () => {
      const registry = getRegistry();
      if (variant === "deleted") delete registry[collection][id][field];
      else registry[collection][id][field] = field === "radiusUnits" ? "42" : 42;

      assert.deepEqual(validateRegistryContract(registry), [
        { collection, id, field, message }
      ]);
      const expected = new Error(
        `Invalid registry renderer contract: ${collection}.${id}.${field}: ${message}`
      );
      assert.throws(() => assertRegistryContract(registry), expected);
      assert.throws(() => resolveDesign(DEFAULT_THEME, registry), expected);
    });
  }
}

test("registry semantic validation checks non-empty strings and font asset entries", () => {
  const registry = getRegistry();
  registry.logos.duck.label = "   ";
  registry.fonts.neuton.assets = ["valid.ttf", 42];

  assert.deepEqual(validateRegistryContract(registry), [
    {
      collection: "fonts",
      id: "neuton",
      field: "assets",
      message: "must be an array of strings"
    },
    {
      collection: "logos",
      id: "duck",
      field: "label",
      message: "must be a non-empty string"
    }
  ]);
});

test("logo registry contract validates canonical vectors and semantic identity", () => {
  const malformed = getRegistry();
  malformed.logos.duck.vector.primitives[0].fill = "missing";
  assert.deepEqual(validateRegistryContract(malformed), [{
    collection: "logos",
    id: "duck",
    field: "vector.primitives[0].fill",
    message: "must name a declared color"
  }]);

  const unmatched = getRegistry();
  unmatched.logos.duck.vectorId = "other";
  assert.deepEqual(validateRegistryContract(unmatched), [{
    collection: "logos",
    id: "duck",
    field: "vectorId",
    message: "must equal vector.id"
  }]);
});

function registerVectorLogo(registry, id, vector) {
  registry.logos[id] = {
    ...structuredClone(registry.logos.duck),
    id,
    label: id,
    vector,
    vectorId: id,
    previewUrl: `/assets/generated/logos/${id}.svg`
  };
}

test("logo registry rejects supported vectors whose derived target scale is unrenderable", () => {
  const registry = getRegistry();
  registerVectorLogo(registry, "microscopic-logo", {
    id: "microscopic-logo",
    viewBox: [0, 0, 0.000001, 0.000001],
    colors: { ink: "#17202A" },
    primitives: [{
      type: "polygon",
      points: [[0, 0], [0.000001, 0], [0, 0.000001]],
      fill: "ink"
    }]
  });

  const errors = validateRegistryContract(registry);
  assert.equal(errors.some((item) => (
    item.collection === "logos"
    && item.id === "microscopic-logo"
    && item.field === "vector.viewBox[2]"
    && /target width 0\.8cm.*strokeScale.*at most 10000/.test(item.message)
  )), true);
});

test("logo registry rejects a vector whose supported scaled stroke serializes to zero", () => {
  const registry = getRegistry();
  registerVectorLogo(registry, "thin-supported-line", {
    id: "thin-supported-line",
    viewBox: [0, 0, 2, 1],
    colors: { ink: "#17202A" },
    primitives: [{
      type: "line", x1: 0.000001, y1: 0.5, x2: 1.999999, y2: 0.5,
      stroke: "ink", strokeWidth: 0.000001
    }]
  });

  const errors = validateRegistryContract(registry);
  assert.equal(errors.some((item) => (
    item.id === "thin-supported-line"
    && item.field === "vector.primitives[0].strokeWidth"
    && /target width 0\.8cm.*positive at 6-decimal precision/.test(item.message)
  )), true);
});

test("logo registry accepts scale and transformed-coordinate boundary fixtures at both target widths", () => {
  const registry = getRegistry();
  registerVectorLogo(registry, "max-scale-logo", {
    id: "max-scale-logo",
    viewBox: [0, 0, 0.00012, 0.00012],
    colors: { ink: "#17202A" },
    primitives: [{
      type: "polygon",
      points: [[0, 0], [0.00012, 0], [0, 0.00012]],
      fill: "ink"
    }]
  });
  registerVectorLogo(registry, "dimension-boundary-logo", {
    id: "dimension-boundary-logo",
    viewBox: [415.666666, 0, 1, 1],
    colors: { ink: "#17202A" },
    primitives: [{
      type: "polygon",
      points: [[415.666666, 0], [416.666666, 0], [415.666666, 1]],
      fill: "ink"
    }]
  });

  assert.deepEqual(validateRegistryContract(registry), []);
});

test("logo registry rejects a transformed coordinate immediately above the TeX-safe boundary", () => {
  const registry = getRegistry();
  registerVectorLogo(registry, "dimension-overflow-logo", {
    id: "dimension-overflow-logo",
    viewBox: [415.666668, 0, 1, 1],
    colors: { ink: "#17202A" },
    primitives: [{
      type: "polygon",
      points: [[415.666668, 0], [416.666668, 0], [415.666668, 1]],
      fill: "ink"
    }]
  });

  const errors = validateRegistryContract(registry);
  assert.equal(errors.some((item) => (
    item.id === "dimension-overflow-logo"
    && item.field === "vector.viewBox[2]"
    && /target width 1\.2cm.*transformed coordinate.*at most 500cm/.test(item.message)
  )), true);
});

test("logo registry contract permits only its exact generated same-origin preview URL", () => {
  for (const previewUrl of [
    "https://example.test/assets/generated/logos/duck.svg",
    "//example.test/assets/generated/logos/duck.svg",
    "/assets/generated/logos/other.svg",
    "/assets/generated/logos/../duck.svg"
  ]) {
    const registry = getRegistry();
    registry.logos.duck.previewUrl = previewUrl;
    assert.deepEqual(validateRegistryContract(registry), [{
      collection: "logos",
      id: "duck",
      field: "previewUrl",
      message: "must equal the generated vector asset path"
    }]);
  }
});

test("null logo vectors require null identity, empty preview URL, and no asset", () => {
  const registry = getRegistry();
  registry.logos.none.vectorId = "duck";
  registry.logos.none.previewUrl = "/assets/generated/logos/duck.svg";
  registry.logos.none.asset = "duck.svg";

  assert.deepEqual(validateRegistryContract(registry), [
    { collection: "logos", id: "none", field: "asset", message: "must be null" },
    { collection: "logos", id: "none", field: "vectorId", message: "must be null when vector is null" },
    { collection: "logos", id: "none", field: "previewUrl", message: "must be empty when vector is null" }
  ]);
});

test("equivalent logo aliases may share vector identity and generated route", () => {
  const registry = getRegistry();
  registry.logos["duck-alias"] = {
    ...structuredClone(registry.logos.duck),
    id: "duck-alias"
  };

  assert.deepEqual(validateRegistryContract(registry), []);
});

test("conflicting duplicate vector identities and routes identify both logo entries", () => {
  const registry = getRegistry();
  const conflicting = structuredClone(registry.logos.duck);
  conflicting.id = "conflicting-duck";
  conflicting.vector.primitives[3].cx = 4.2;
  registry.logos["conflicting-duck"] = conflicting;

  assert.deepEqual(validateRegistryContract(registry), [
    {
      collection: "logos",
      id: "conflicting-duck",
      field: "vectorId",
      message: "conflicts with logos.duck for vectorId duck"
    },
    {
      collection: "logos",
      id: "conflicting-duck",
      field: "previewUrl",
      message: "conflicts with logos.duck for previewUrl /assets/generated/logos/duck.svg"
    }
  ]);
});

test("registry contract identifies the collection, ID, and missing renderer", () => {
  const registry = getRegistry();
  delete registry.blocks.classic.renderers.latex;

  assert.deepEqual(validateRegistryContract(registry), [
    {
      collection: "blocks",
      id: "classic",
      renderer: "latex",
      message: "renderer support must be boolean"
    }
  ]);
});

test("unsupported renderers require an explicit limitation", () => {
  const registry = getRegistry();
  registry.blocks.classic.renderers.html = false;

  assert.deepEqual(validateRegistryContract(registry), [
    {
      collection: "blocks",
      id: "classic",
      renderer: "html",
      message: "unsupported renderer requires a limitation"
    }
  ]);
});

test("registry collection definitions reject omitted renderer support", () => {
  assert.throws(
    () => defineRegistryCollection({ future: { id: "future" } }, {}),
    new Error("Registry option future must explicitly declare renderer support")
  );
});

test("malformed registries return structured collection errors", () => {
  const expected = [
    "palettes",
    "fonts",
    "bullets",
    "blocks",
    "navigation",
    "titlePages",
    "logos"
  ].map((collection) => ({
    collection,
    id: null,
    renderer: null,
    message: "collection must be an object"
  }));

  assert.deepEqual(validateRegistryContract(null), expected);
  assert.deepEqual(validateRegistryContract({}), expected);

  const malformed = getRegistry();
  malformed.blocks = [];
  malformed.logos = "logos";
  assert.deepEqual(validateRegistryContract(malformed), [expected[3], expected[6]]);
});

test("malformed options return renderer errors instead of throwing", () => {
  const registry = getRegistry();
  registry.blocks = { classic: null };

  assert.deepEqual(validateRegistryContract(registry), [
    {
      collection: "blocks",
      id: "classic",
      renderer: "html",
      message: "renderer support must be boolean"
    },
    {
      collection: "blocks",
      id: "classic",
      renderer: "latex",
      message: "renderer support must be boolean"
    }
  ]);
});

test("assertRegistryContract intentionally rejects malformed registries", () => {
  assert.throws(
    () => assertRegistryContract(null),
    new Error(
      "Invalid registry renderer contract: palettes.null.null, fonts.null.null, "
      + "bullets.null.null, blocks.null.null, navigation.null.null, "
      + "titlePages.null.null, logos.null.null"
    )
  );
});

test("whitespace-only limitations do not justify unsupported renderers", () => {
  const registry = getRegistry();
  registry.blocks.classic.renderers.html = false;
  registry.blocks.classic.limitations = { html: "  \n\t " };

  assert.deepEqual(validateRegistryContract(registry), [
    {
      collection: "blocks",
      id: "classic",
      renderer: "html",
      message: "unsupported renderer requires a limitation"
    }
  ]);
});

test("nested renderer mutations do not escape a registry clone", () => {
  const first = getRegistry();
  first.blocks.classic.renderers.html = false;

  const second = getRegistry();
  assert.deepEqual(second.blocks.classic.renderers, { html: true, latex: true });
});

test("assertRegistryContract returns valid registries and summarizes invalid paths", () => {
  const valid = getRegistry();
  assert.equal(assertRegistryContract(valid), valid);

  delete valid.blocks.classic.renderers.latex;
  valid.logos.duck.renderers.html = "yes";
  assert.throws(
    () => assertRegistryContract(valid),
    new Error("Invalid registry renderer contract: blocks.classic.latex, logos.duck.html")
  );
});
