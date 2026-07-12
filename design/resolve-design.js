"use strict";

const { validateTheme } = require("../schema/theme-schema");
const { resolveThemeChoices } = require("../registry/options");
const { assertRegistryContract } = require("./registry-contract");
const { LOGO_TARGET_WIDTHS_CM } = require("./vector-renderers");
const { hashCanonical } = require("../lib/canonical-json");
const { clone, textColorForBg } = require("../lib/utils");

const GENERATOR_VERSION = "3";

class ThemeValidationError extends Error {
  constructor(errors) {
    super("Invalid theme: " + errors.map(formatError).join("; "));
    this.name = "ThemeValidationError";
    this.errors = clone(errors);
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function formatError(error) {
  return `${error.path}: ${error.message}`;
}

function canvasFor(aspectRatio) {
  return aspectRatio === "16:9"
    ? { aspectRatio, widthUnits: 16, heightUnits: 9 }
    : { aspectRatio, widthUnits: 4, heightUnits: 3 };
}

function resolvedColors(colors) {
  return {
    background: colors.background,
    primary: colors.primary,
    accent: colors.accent,
    text: colors.text,
    blockBody: colors.blockBody,
    alert: colors.alert,
    primaryText: textColorForBg(colors.primary)
  };
}

function resolvedFont(font) {
  return {
    id: font.id,
    label: font.label,
    cssFamily: font.cssFamily,
    latexPreamble: font.latexPreamble,
    latexTitlePackage: font.latexTitlePackage,
    latexTitleFamily: font.latexTitleFamily,
    assets: clone(font.assets)
  };
}

function resolvedTypography(choices) {
  return {
    body: resolvedFont(choices.bodyFont),
    title: resolvedFont(choices.titleFont)
  };
}

function resolvedComponents(theme, choices) {
  const logo = theme.decorations.cornerLogo;
  return {
    bullet: {
      id: choices.bullet.id,
      label: choices.bullet.label,
      marker: choices.bullet.marker,
      latexPackages: choices.bullet.latexPackages,
      latexItem: choices.bullet.latexItem,
      latexSubitem: choices.bullet.latexSubitem
    },
    block: {
      id: choices.block.id,
      label: choices.block.label,
      radiusUnits: choices.block.radiusUnits,
      shadow: choices.block.shadow,
      cssRadius: choices.block.cssRadius,
      cssShadow: choices.block.cssShadow,
      latexTemplate: choices.block.latexTemplate
    },
    navigation: {
      id: choices.navigation.id,
      label: choices.navigation.label,
      header: choices.navigation.header,
      footline: choices.navigation.footline,
      latexOuterTheme: choices.navigation.latexOuterTheme,
      latexFootline: choices.navigation.latexFootline
    },
    titlePage: {
      id: choices.titlePage.id,
      label: choices.titlePage.label,
      alignment: choices.titlePage.alignment,
      layout: choices.titlePage.layout
    },
    cornerLogo: {
      id: choices.logo.id,
      label: choices.logo.label,
      position: logo.position,
      sizeUnits: LOGO_TARGET_WIDTHS_CM[logo.size],
      scope: logo.scope,
      vectorId: choices.logo.vectorId,
      previewUrl: choices.logo.previewUrl,
      vector: clone(choices.logo.vector)
    }
  };
}

function contentDensityWarnings(content) {
  const bulletTextLength = content.sampleBullets.reduce((total, bullet) => total + bullet.length, 0);
  if (content.sampleTitle.length <= 90 && bulletTextLength <= 360) return [];
  return [{
    code: "content-density",
    severity: "warning",
    message: "Sample content may overflow in one or both renderers."
  }];
}

function resolvedCapabilities(choices, content) {
  const selected = [
    choices.palette,
    choices.bodyFont,
    choices.titleFont,
    choices.bullet,
    choices.block,
    choices.navigation,
    choices.titlePage,
    choices.logo
  ];
  const approximations = [];
  const seen = new Set();

  for (const option of selected) {
    for (const renderer of ["html", "latex"]) {
      if (option.renderers[renderer]) continue;
      const limitation = String(option.limitations[renderer]).trim();
      const signature = `${renderer}\0${option.id}\0${limitation}`;
      if (seen.has(signature)) continue;
      seen.add(signature);
      approximations.push({ renderer, optionId: option.id, limitation });
    }
  }

  return {
    html: selected.every((option) => option.renderers.html),
    latex: selected.every((option) => option.renderers.latex),
    approximations,
    warnings: contentDensityWarnings(content)
  };
}

function snapshotValue(value) {
  if (Array.isArray(value)) return value.map(snapshotValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).map((key) => [key, snapshotValue(value[key])])
  );
}

function buildResolvedDesign(value, choices) {
  return deepFreeze({
    source: {
      themeHash: hashCanonical(value),
      generatorVersion: GENERATOR_VERSION
    },
    canvas: canvasFor(value.foundation.aspectRatio),
    identity: clone(value.identity),
    colors: resolvedColors(value.colors),
    typography: resolvedTypography(choices),
    components: resolvedComponents(value, choices),
    content: {
      sampleTitle: value.contentDefaults.sampleTitle,
      bullets: clone(value.contentDefaults.sampleBullets),
      blockTitle: "Design note",
      blockBody: "The instant HTML preview and authoritative PDF use the same resolved design."
    },
    capabilities: resolvedCapabilities(choices, value.contentDefaults)
  });
}

function resolveDesignBundle(theme, registry) {
  const registrySnapshot = snapshotValue(registry);
  const validation = validateTheme(theme, { registry: registrySnapshot });
  if (!validation.ok) {
    throw new ThemeValidationError(validation.errors);
  }

  assertRegistryContract(registrySnapshot);
  const value = validation.value;
  const choices = resolveThemeChoices(value, registrySnapshot);
  return {
    theme: clone(value),
    design: buildResolvedDesign(value, choices)
  };
}

function resolveDesign(theme, registry) {
  return resolveDesignBundle(theme, registry).design;
}

module.exports = { resolveDesign, resolveDesignBundle, deepFreeze, GENERATOR_VERSION, ThemeValidationError };
