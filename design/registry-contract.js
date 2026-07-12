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
      .map((error) => `${error.collection}.${error.id}.${error.renderer}`)
      .join(", ");
    throw new Error("Invalid registry renderer contract: " + detail);
  }
  return registry;
}

module.exports = { validateRegistryContract, assertRegistryContract };
