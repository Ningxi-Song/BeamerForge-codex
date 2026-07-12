"use strict";

const COLLECTIONS = [
  "palettes",
  "fonts",
  "bullets",
  "blocks",
  "navigation",
  "titlePages",
  "logos"
];

const nonEmptyString = {
  valid: (value) => typeof value === "string" && value.trim() !== "",
  message: "must be a non-empty string"
};
const string = {
  valid: (value) => typeof value === "string",
  message: "must be a string"
};
const boolean = {
  valid: (value) => typeof value === "boolean",
  message: "must be a boolean"
};

const SEMANTIC_RULES = {
  palettes: {},
  fonts: {
    cssFamily: nonEmptyString,
    latexPreamble: nonEmptyString,
    assets: {
      valid: (value) => Array.isArray(value) && value.every((asset) => typeof asset === "string"),
      message: "must be an array of strings"
    }
  },
  bullets: {
    marker: nonEmptyString,
    latexPackages: string,
    latexItem: nonEmptyString,
    latexSubitem: nonEmptyString
  },
  blocks: {
    radiusUnits: {
      valid: (value) => typeof value === "number" && Number.isFinite(value),
      message: "must be a finite number"
    },
    shadow: boolean,
    cssRadius: string,
    cssShadow: string,
    latexTemplate: string
  },
  navigation: {
    header: boolean,
    footline: boolean,
    latexOuterTheme: string,
    latexFootline: string
  },
  titlePages: {
    alignment: nonEmptyString,
    layout: nonEmptyString
  },
  logos: {
    vectorId: {
      valid: (value) => value === null || nonEmptyString.valid(value),
      message: "must be null or a non-empty string"
    },
    previewUrl: string,
    asset: {
      valid: (value) => value === null || typeof value === "string",
      message: "must be null or a string"
    }
  }
};

function semanticErrors(collection, id, option) {
  if (!option || typeof option !== "object" || Array.isArray(option)) return [];
  const errors = [];
  const rules = {
    id: nonEmptyString,
    label: nonEmptyString,
    ...SEMANTIC_RULES[collection]
  };

  for (const [field, rule] of Object.entries(rules)) {
    if (!rule.valid(option[field])) {
      errors.push({ collection, id, field, message: rule.message });
    }
  }
  return errors;
}

function validateRegistryContract(registry) {
  const errors = [];
  const registryObject = registry && typeof registry === "object" && !Array.isArray(registry)
    ? registry
    : {};

  for (const collection of COLLECTIONS) {
    const options = registryObject[collection];
    if (!options || typeof options !== "object" || Array.isArray(options)) {
      errors.push({
        collection,
        id: null,
        renderer: null,
        message: "collection must be an object"
      });
      continue;
    }

    for (const [id, option] of Object.entries(options)) {
      errors.push(...semanticErrors(collection, id, option));
      for (const renderer of ["html", "latex"]) {
        if (typeof option?.renderers?.[renderer] !== "boolean") {
          errors.push({
            collection,
            id,
            renderer,
            message: "renderer support must be boolean"
          });
        } else if (
          option.renderers[renderer] === false
          && !String(option.limitations?.[renderer] || "").trim()
        ) {
          errors.push({
            collection,
            id,
            renderer,
            message: "unsupported renderer requires a limitation"
          });
        }
      }
    }
  }

  return errors;
}

function assertRegistryContract(registry) {
  const errors = validateRegistryContract(registry);
  if (errors.length) {
    const detail = errors
      .map((error) => error.field
        ? `${error.collection}.${error.id}.${error.field}: ${error.message}`
        : `${error.collection}.${error.id}.${error.renderer}`)
      .join(", ");
    throw new Error("Invalid registry renderer contract: " + detail);
  }
  return registry;
}

module.exports = { validateRegistryContract, assertRegistryContract };
