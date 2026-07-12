"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { getRegistry, defineRegistryCollection } = require("../registry/options");
const { validateRegistryContract, assertRegistryContract } = require("../design/registry-contract");

test("every selectable registry option declares HTML and LaTeX support", () => {
  assert.deepEqual(validateRegistryContract(getRegistry()), []);
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
