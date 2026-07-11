"use strict";

const FIELDS = Object.freeze([
  ["colors.paletteId", "Palette"],
  ["colors.primary", "Primary color"],
  ["colors.accent", "Accent color"],
  ["colors.background", "Background color"],
  ["colors.text", "Text color"],
  ["colors.blockBody", "Block body color"],
  ["colors.alert", "Alert color"],
  ["fonts.body", "Body font"],
  ["fonts.title", "Title font"],
  ["fonts.mode", "Font mode"],
  ["bullets.style", "Bullet style"],
  ["blocks.style", "Block style"],
  ["navigation.style", "Navigation"],
  ["titlePage.layout", "Title page"],
  ["foundation.aspectRatio", "Aspect ratio"],
  ["foundation.baseLayout", "Base layout"]
]);

function valueAt(object, fieldPath) {
  return fieldPath.split(".").reduce((value, key) => value == null ? undefined : value[key], object);
}

function diffThemes(before, after) {
  return FIELDS.flatMap(([fieldPath, label]) => {
    const oldValue = valueAt(before, fieldPath);
    const newValue = valueAt(after, fieldPath);
    return Object.is(oldValue, newValue) ? [] : [{ path: fieldPath, label, before: oldValue, after: newValue }];
  });
}

module.exports = { FIELDS, diffThemes };
