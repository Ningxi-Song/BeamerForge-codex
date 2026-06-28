const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function slugifyName(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function addError(errors, path, message) {
  errors.push({ path, message });
}

function hasObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireObject(theme, key, errors) {
  if (!hasObject(theme[key])) {
    addError(errors, key, `${key} must be an object`);
    return {};
  }
  return theme[key];
}

function requireNonEmptyString(object, path, errors) {
  const parts = path.split(".");
  const key = parts[parts.length - 1];
  if (typeof object[key] !== "string" || object[key].trim() === "") {
    addError(errors, path, `${path} must be a non-empty string`);
  }
}

function requireHex(object, path, errors) {
  const parts = path.split(".");
  const key = parts[parts.length - 1];
  if (typeof object[key] !== "string" || !HEX_COLOR.test(object[key])) {
    addError(errors, path, `${path} must be a #RRGGBB color`);
  }
}

function requireKnownId(registry, collection, id, path, errors) {
  if (!registry) return;
  if (!registry[collection] || !registry[collection][id]) {
    addError(errors, path, `${path} references unknown ${collection} option '${id}'`);
  }
}

function validateTheme(input, options = {}) {
  const errors = [];
  const theme = hasObject(input) ? clone(input) : {};
  const registry = options.registry;

  const identity = requireObject(theme, "identity", errors);
  requireNonEmptyString(identity, "identity.name", errors);
  if (typeof identity.name === "string" && !SLUG.test(identity.name)) {
    addError(errors, "identity.name", "identity.name must be a lowercase slug");
  }
  for (const key of ["title", "subtitle", "author", "institute", "date"]) {
    if (identity[key] !== undefined) requireNonEmptyString(identity, `identity.${key}`, errors);
  }

  const foundation = requireObject(theme, "foundation", errors);
  if (!["16:9", "4:3"].includes(foundation.aspectRatio)) {
    addError(errors, "foundation.aspectRatio", "foundation.aspectRatio must be 16:9 or 4:3");
  }
  if (foundation.baseLayout !== undefined && !["single"].includes(foundation.baseLayout)) {
    addError(errors, "foundation.baseLayout", "foundation.baseLayout must be single");
  }

  const colors = requireObject(theme, "colors", errors);
  requireNonEmptyString(colors, "colors.paletteId", errors);
  requireKnownId(registry, "palettes", colors.paletteId, "colors.paletteId", errors);
  for (const key of ["background", "primary", "accent", "text"]) {
    requireHex(colors, `colors.${key}`, errors);
  }
  for (const key of ["blockBody", "alert"]) {
    if (colors[key] !== undefined) requireHex(colors, `colors.${key}`, errors);
  }

  const fonts = requireObject(theme, "fonts", errors);
  requireNonEmptyString(fonts, "fonts.body", errors);
  requireNonEmptyString(fonts, "fonts.title", errors);
  requireKnownId(registry, "fonts", fonts.body, "fonts.body", errors);
  requireKnownId(registry, "fonts", fonts.title, "fonts.title", errors);

  const bullets = requireObject(theme, "bullets", errors);
  requireNonEmptyString(bullets, "bullets.style", errors);
  requireKnownId(registry, "bullets", bullets.style, "bullets.style", errors);

  const blocks = requireObject(theme, "blocks", errors);
  requireNonEmptyString(blocks, "blocks.style", errors);
  requireKnownId(registry, "blocks", blocks.style, "blocks.style", errors);

  const navigation = requireObject(theme, "navigation", errors);
  requireNonEmptyString(navigation, "navigation.style", errors);
  requireKnownId(registry, "navigation", navigation.style, "navigation.style", errors);

  const titlePage = requireObject(theme, "titlePage", errors);
  requireNonEmptyString(titlePage, "titlePage.layout", errors);
  requireKnownId(registry, "titlePages", titlePage.layout, "titlePage.layout", errors);

  const contentDefaults = requireObject(theme, "contentDefaults", errors);
  requireNonEmptyString(contentDefaults, "contentDefaults.sampleTitle", errors);
  if (
    contentDefaults.sampleBullets !== undefined &&
    (!Array.isArray(contentDefaults.sampleBullets) || contentDefaults.sampleBullets.length < 3)
  ) {
    addError(errors, "contentDefaults.sampleBullets", "contentDefaults.sampleBullets must contain at least three bullets");
  }
  if (Array.isArray(contentDefaults.sampleBullets)) {
    contentDefaults.sampleBullets.forEach((bullet, index) => {
      if (typeof bullet !== "string" || bullet.trim() === "") {
        addError(
          errors,
          `contentDefaults.sampleBullets.${index}`,
          `contentDefaults.sampleBullets.${index} must be a non-empty string`
        );
      }
    });
  }

  return {
    ok: errors.length === 0,
    errors,
    value: theme
  };
}

module.exports = {
  DEFAULT_THEME,
  validateTheme,
  slugifyName
};
