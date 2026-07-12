"use strict";

const { HEX_COLOR_RE, SLUG_RE, clone, isPlainObject, slugify } = require("../lib/utils");

const DEFAULT_THEME = Object.freeze({
  identity: {
    name: "blue-academic",
    title: "Presentation Title",
    subtitle: "Short subtitle or event name",
    author: "Presenter Name",
    institute: "Institution Name",
    date: "\\today"
  },
  foundation: {
    aspectRatio: "16:9",
    baseLayout: "single"
  },
  colors: {
    paletteId: "academic-blue",
    background: "#FFFFFF",
    primary: "#456990",
    accent: "#57C3C2",
    text: "#000000",
    blockBody: "#D9EBEF",
    alert: "#CC2D18"
  },
  fonts: {
    body: "palatino",
    title: "palatino",
    mode: "serif-academic"
  },
  bullets: {
    style: "pifont-outline"
  },
  blocks: {
    style: "rounded"
  },
  navigation: {
    style: "page-number"
  },
  titlePage: {
    layout: "left-curtain"
  },
  decorations: {
    cornerLogo: { id: "none", position: "top-right", size: "small", scope: "content-frames" }
  },
  contentDefaults: {
    sampleTitle: "The design keeps one idea visible per slide",
    sampleBullets: [
      "A structured theme controls colors, fonts, and navigation",
      "HTML preview updates immediately after each choice",
      "Beamer compilation remains the final visual check"
    ]
  },
  build: {
    status: "idle",
    warnings: []
  }
});

const VALID_ASPECT_RATIOS = ["16:9", "4:3"];
const VALID_BASE_LAYOUTS = ["single"];
const REQUIRED_HEX_FIELDS = ["background", "primary", "accent", "text", "blockBody", "alert"];
const IDENTITY_FIELDS = ["title", "subtitle", "author", "institute", "date"];
const BULLET_MIN_COUNT = 3;
const ALLOWED_KEYS = Object.freeze({
  root: new Set(["identity", "foundation", "colors", "fonts", "bullets", "blocks", "navigation", "titlePage", "decorations", "contentDefaults", "build"]),
  identity: new Set(["name", "title", "subtitle", "author", "institute", "date"]),
  foundation: new Set(["aspectRatio", "baseLayout"]),
  colors: new Set(["paletteId", "background", "primary", "accent", "text", "blockBody", "alert"]),
  fonts: new Set(["body", "title", "mode"]),
  bullets: new Set(["style"]),
  blocks: new Set(["style"]),
  navigation: new Set(["style"]),
  titlePage: new Set(["layout"]),
  decorations: new Set(["cornerLogo"]),
  cornerLogo: new Set(["id", "position", "size", "scope"]),
  contentDefaults: new Set(["sampleTitle", "sampleBullets"]),
  build: new Set(["status", "warnings"])
});

const ERROR_STEP_MAP = Object.freeze([
  ["identity", "start"],
  ["foundation", "start"],
  ["colors", "color"],
  ["fonts", "font"],
  ["bullets", "bullets"],
  ["blocks", "blocks"],
  ["navigation", "navigation"],
  ["titlePage", "title-page"],
  ["decorations", "manual-review"],
  ["contentDefaults", "review"]
]);

class ValidationError {
  constructor(path, message) {
    this.path = path;
    this.message = message;
  }
}

function requireSection(theme, key, errors) {
  if (!isPlainObject(theme[key])) {
    errors.push(new ValidationError(key, `${key} must be an object`));
    return {};
  }
  return theme[key];
}

function rejectUnknownKeys(value, allowed, basePath, errors) {
  if (!isPlainObject(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(new ValidationError(basePath ? `${basePath}.${key}` : key, "is not allowed"));
  }
}

function assertNonEmptyString(obj, path, errors) {
  const key = path.split(".").pop();
  if (typeof obj[key] !== "string" || obj[key].trim() === "") {
    errors.push(new ValidationError(path, `${path} must be a non-empty string`));
  }
}

function assertString(obj, path, errors) {
  const key = path.split(".").pop();
  if (typeof obj[key] !== "string") {
    errors.push(new ValidationError(path, `${path} must be a string`));
  }
}

function assertHexColor(obj, path, errors) {
  const key = path.split(".").pop();
  if (typeof obj[key] !== "string" || !HEX_COLOR_RE.test(obj[key])) {
    errors.push(new ValidationError(path, `${path} must be a #RRGGBB color`));
  }
}

function assertKnownOption(registry, collection, id, path, errors) {
  if (!registry) return;
  if (!registry[collection] || !registry[collection][id]) {
    errors.push(new ValidationError(path, `${path} references unknown ${collection} option '${id}'`));
  }
}

function validateIdentity(identity, errors) {
  assertNonEmptyString(identity, "identity.name", errors);
  if (typeof identity.name === "string" && !SLUG_RE.test(identity.name)) {
    errors.push(new ValidationError("identity.name", "identity.name must be a lowercase slug"));
  }
  for (const field of IDENTITY_FIELDS) {
    assertString(identity, `identity.${field}`, errors);
  }
}

function validateFoundation(foundation, errors) {
  if (!VALID_ASPECT_RATIOS.includes(foundation.aspectRatio)) {
    errors.push(new ValidationError("foundation.aspectRatio", "foundation.aspectRatio must be 16:9 or 4:3"));
  }
  if (foundation.baseLayout !== undefined && !VALID_BASE_LAYOUTS.includes(foundation.baseLayout)) {
    errors.push(new ValidationError("foundation.baseLayout", "foundation.baseLayout must be single"));
  }
}

function validateColors(colors, registry, errors) {
  assertNonEmptyString(colors, "colors.paletteId", errors);
  assertKnownOption(registry, "palettes", colors.paletteId, "colors.paletteId", errors);
  for (const field of REQUIRED_HEX_FIELDS) assertHexColor(colors, `colors.${field}`, errors);
}

function validateFonts(fonts, registry, errors) {
  assertNonEmptyString(fonts, "fonts.body", errors);
  assertNonEmptyString(fonts, "fonts.title", errors);
  assertKnownOption(registry, "fonts", fonts.body, "fonts.body", errors);
  assertKnownOption(registry, "fonts", fonts.title, "fonts.title", errors);
}

function validateContentDefaults(content, errors) {
  assertNonEmptyString(content, "contentDefaults.sampleTitle", errors);
  if (!Array.isArray(content.sampleBullets) || content.sampleBullets.length < BULLET_MIN_COUNT) {
    errors.push(new ValidationError(
      "contentDefaults.sampleBullets",
      `contentDefaults.sampleBullets must contain at least ${BULLET_MIN_COUNT} bullets`
    ));
  }
  if (Array.isArray(content.sampleBullets)) {
    content.sampleBullets.forEach((bullet, i) => {
      if (typeof bullet !== "string" || bullet.trim() === "") {
        errors.push(new ValidationError(
          `contentDefaults.sampleBullets.${i}`,
          `contentDefaults.sampleBullets.${i} must be a non-empty string`
        ));
      }
    });
  }
}

function normalizeLegacyTheme(input) {
  const theme = isPlainObject(input) ? clone(input) : {};

  if (isPlainObject(theme.identity)) {
    for (const field of IDENTITY_FIELDS) {
      if (theme.identity[field] === undefined) theme.identity[field] = "";
    }
  }
  if (isPlainObject(theme.colors)) {
    if (theme.colors.blockBody === undefined) theme.colors.blockBody = theme.colors.background;
    if (theme.colors.alert === undefined) theme.colors.alert = theme.colors.accent;
  }
  if (
    isPlainObject(theme.contentDefaults)
    && theme.contentDefaults.sampleBullets === undefined
  ) {
    theme.contentDefaults.sampleBullets = clone(DEFAULT_THEME.contentDefaults.sampleBullets);
  }

  return theme;
}

function validateTheme(input, options = {}) {
  const errors = [];
  const theme = normalizeLegacyTheme(input);
  const registry = options.registry;

  rejectUnknownKeys(theme, ALLOWED_KEYS.root, "", errors);

  const identity = requireSection(theme, "identity", errors);
  rejectUnknownKeys(identity, ALLOWED_KEYS.identity, "identity", errors);
  validateIdentity(identity, errors);

  const foundation = requireSection(theme, "foundation", errors);
  rejectUnknownKeys(foundation, ALLOWED_KEYS.foundation, "foundation", errors);
  validateFoundation(foundation, errors);

  const colors = requireSection(theme, "colors", errors);
  rejectUnknownKeys(colors, ALLOWED_KEYS.colors, "colors", errors);
  validateColors(colors, registry, errors);

  const fonts = requireSection(theme, "fonts", errors);
  rejectUnknownKeys(fonts, ALLOWED_KEYS.fonts, "fonts", errors);
  validateFonts(fonts, registry, errors);

  const bullets = requireSection(theme, "bullets", errors);
  rejectUnknownKeys(bullets, ALLOWED_KEYS.bullets, "bullets", errors);
  assertNonEmptyString(bullets, "bullets.style", errors);
  assertKnownOption(registry, "bullets", bullets.style, "bullets.style", errors);

  const blocks = requireSection(theme, "blocks", errors);
  rejectUnknownKeys(blocks, ALLOWED_KEYS.blocks, "blocks", errors);
  assertNonEmptyString(blocks, "blocks.style", errors);
  assertKnownOption(registry, "blocks", blocks.style, "blocks.style", errors);

  const navigation = requireSection(theme, "navigation", errors);
  rejectUnknownKeys(navigation, ALLOWED_KEYS.navigation, "navigation", errors);
  assertNonEmptyString(navigation, "navigation.style", errors);
  assertKnownOption(registry, "navigation", navigation.style, "navigation.style", errors);

  const titlePage = requireSection(theme, "titlePage", errors);
  rejectUnknownKeys(titlePage, ALLOWED_KEYS.titlePage, "titlePage", errors);
  assertNonEmptyString(titlePage, "titlePage.layout", errors);
  assertKnownOption(registry, "titlePages", titlePage.layout, "titlePage.layout", errors);

  const decorations = requireSection(theme, "decorations", errors);
  rejectUnknownKeys(decorations, ALLOWED_KEYS.decorations, "decorations", errors);
  const cornerLogo = requireSection(decorations, "cornerLogo", errors);
  rejectUnknownKeys(cornerLogo, ALLOWED_KEYS.cornerLogo, "decorations.cornerLogo", errors);
  assertNonEmptyString(cornerLogo, "decorations.cornerLogo.id", errors);
  assertKnownOption(registry, "logos", cornerLogo.id, "decorations.cornerLogo.id", errors);
  if (!["top-left", "top-right"].includes(cornerLogo.position)) errors.push(new ValidationError("decorations.cornerLogo.position", "must be top-left or top-right"));
  if (!["small", "medium"].includes(cornerLogo.size)) errors.push(new ValidationError("decorations.cornerLogo.size", "must be small or medium"));
  if (!["content-frames", "all-frames"].includes(cornerLogo.scope)) errors.push(new ValidationError("decorations.cornerLogo.scope", "must be content-frames or all-frames"));

  const contentDefaults = requireSection(theme, "contentDefaults", errors);
  rejectUnknownKeys(contentDefaults, ALLOWED_KEYS.contentDefaults, "contentDefaults", errors);
  validateContentDefaults(contentDefaults, errors);

  if (theme.build !== undefined) rejectUnknownKeys(theme.build, ALLOWED_KEYS.build, "build", errors);

  return {
    ok: errors.length === 0,
    errors,
    value: theme
  };
}

function errorToStepId(errorPath) {
  const path = String(errorPath || "");
  const match = ERROR_STEP_MAP.find(([prefix]) => path === prefix || path.startsWith(`${prefix}.`));
  return match ? match[1] : "review";
}

module.exports = {
  DEFAULT_THEME,
  ValidationError,
  normalizeLegacyTheme,
  validateTheme,
  slugifyName: slugify,
  errorToStepId
};
