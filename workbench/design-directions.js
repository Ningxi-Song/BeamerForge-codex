"use strict";

const { clone } = require("../lib/utils");

const DIRECTIONS = Object.freeze([
  Object.freeze({
    id: "quiet-academic",
    label: "Quiet academic",
    description: "Serif type, academic blue, and restrained structure.",
    paletteId: "academic-blue",
    fontId: "palatino"
  }),
  Object.freeze({
    id: "clean-modern",
    label: "Clean modern",
    description: "Clear sans serif type, slate teal accents, and generous white space.",
    paletteId: "slate-teal",
    fontId: "inter"
  }),
  Object.freeze({
    id: "bold-editorial",
    label: "Bold editorial",
    description: "High-contrast display type with a confident rose-red palette.",
    paletteId: "rose-red",
    fontId: "playfair-display"
  })
]);

function requireOption(registry, collection, id) {
  const option = registry?.[collection]?.[id];
  if (!option) throw new Error(`Direction references unknown ${collection} option: ${id}`);
  return option;
}

function listDirections(registry) {
  return DIRECTIONS.map((direction) => {
    const palette = requireOption(registry, "palettes", direction.paletteId);
    requireOption(registry, "fonts", direction.fontId);
    return {
      ...direction,
      swatches: [
        palette.colors.background,
        palette.colors.primary,
        palette.colors.accent,
        palette.colors.text,
        palette.colors.alert
      ]
    };
  });
}

function applyDirection(theme, directionId, registry) {
  const direction = DIRECTIONS.find(({ id }) => id === directionId);
  if (!direction) throw new Error(`Unknown design direction: ${directionId}`);
  const palette = requireOption(registry, "palettes", direction.paletteId);
  const font = requireOption(registry, "fonts", direction.fontId);
  const next = clone(theme);
  next.colors.paletteId = palette.id;
  Object.assign(next.colors, clone(palette.colors));
  next.fonts.body = font.id;
  next.fonts.title = font.id;
  next.fonts.mode = font.mode;
  return next;
}

module.exports = { DIRECTIONS, listDirections, applyDirection };
