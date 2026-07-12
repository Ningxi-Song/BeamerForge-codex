"use strict";

const { validateVector, validateLogoVectorRenderability } = require("./vector-renderers");
const { canonicalJson } = require("../lib/canonical-json");

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
    latexTitlePackage: string,
    latexTitleFamily: string,
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
    previewUrl: string,
    asset: {
      valid: (value) => value === null,
      message: "must be null"
    }
  }
};

function logoVectorErrors(collection, id, option) {
  if (collection !== "logos" || !option || typeof option !== "object" || Array.isArray(option)) return [];
  const errors = [];
  if (option.vector === null) {
    if (option.vectorId !== null) {
      errors.push({ collection, id, field: "vectorId", message: "must be null when vector is null" });
    }
    if (option.previewUrl !== "") {
      errors.push({ collection, id, field: "previewUrl", message: "must be empty when vector is null" });
    }
    return errors;
  }

  const vectorErrors = validateVector(option.vector);
  for (const vectorError of vectorErrors) {
    errors.push({
      collection,
      id,
      field: vectorError.path ? `vector.${vectorError.path}` : "vector",
      message: vectorError.message
    });
  }
  if (vectorErrors.length === 0 && option.renderers?.latex === true) {
    for (const renderError of validateLogoVectorRenderability(option.vector)) {
      errors.push({
        collection,
        id,
        field: renderError.path ? `vector.${renderError.path}` : "vector",
        message: renderError.message
      });
    }
  }
  if (option.vector && typeof option.vector.id === "string" && option.vectorId !== option.vector.id) {
    errors.push({ collection, id, field: "vectorId", message: "must equal vector.id" });
  }
  if (option.vector && typeof option.vector.id === "string" && typeof option.previewUrl === "string"
    && option.previewUrl !== `/assets/generated/logos/${option.vector.id}.svg`) {
    errors.push({ collection, id, field: "previewUrl", message: "must equal the generated vector asset path" });
  }
  return errors;
}

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

function logoUniquenessErrors(logos) {
  if (!logos || typeof logos !== "object" || Array.isArray(logos)) return [];
  const errors = [];
  const seenVectorIds = new Map();
  const seenPreviewUrls = new Map();
  for (const [id, option] of Object.entries(logos)) {
    if (!option || typeof option !== "object" || Array.isArray(option) || option.vector === null) continue;
    if (validateVector(option.vector).length !== 0) continue;
    const signature = canonicalJson(option.vector);
    for (const [field, value, seen] of [
      ["vectorId", option.vectorId, seenVectorIds],
      ["previewUrl", option.previewUrl, seenPreviewUrls]
    ]) {
      if (typeof value !== "string") continue;
      const previous = seen.get(value);
      if (!previous) {
        seen.set(value, { id, signature });
      } else if (previous.signature !== signature) {
        errors.push({
          collection: "logos",
          id,
          field,
          message: `conflicts with logos.${previous.id} for ${field} ${value}`
        });
      }
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
      errors.push(...logoVectorErrors(collection, id, option));
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

  errors.push(...logoUniquenessErrors(registryObject.logos));

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
