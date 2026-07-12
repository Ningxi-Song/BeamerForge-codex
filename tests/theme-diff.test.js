"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_THEME } = require("../schema/theme-schema");
const { diffThemes } = require("../workbench/theme-diff");

test("diffThemes reports user-facing changes and ignores identical values", () => {
  const draft = structuredClone(DEFAULT_THEME);
  draft.colors.primary = "#A14D3A";
  draft.fonts.title = "playfair-display";
  assert.deepEqual(diffThemes(DEFAULT_THEME, draft), [
    { path: "colors.primary", label: "Primary color", before: DEFAULT_THEME.colors.primary, after: "#A14D3A" },
    { path: "fonts.title", label: "Title font", before: DEFAULT_THEME.fonts.title, after: "playfair-display" }
  ]);
});

test("diffThemes returns an empty list for equivalent themes", () => {
  assert.deepEqual(diffThemes(DEFAULT_THEME, structuredClone(DEFAULT_THEME)), []);
});

test("diffThemes reports corner logo changes", () => {
  const draft = structuredClone(DEFAULT_THEME);
  draft.decorations.cornerLogo = { id: "duck", position: "top-right", size: "small", scope: "content-frames" };
  assert.deepEqual(diffThemes(DEFAULT_THEME, draft).filter((change) => change.path.startsWith("decorations.")), [
    { path: "decorations.cornerLogo.id", label: "Corner logo", before: "none", after: "duck" }
  ]);
});
