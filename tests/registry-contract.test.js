"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { getRegistry } = require("../registry/options");
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
