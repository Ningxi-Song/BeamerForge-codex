"use strict";

const path = require("node:path");
const { validateReferences } = require("../ai-handoff");

const TEXT_EXTENSIONS = new Set([".tex", ".sty", ".cls", ".bib"]);
const IMAGE_TYPES = Object.freeze({
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
});
const MAX_TEXT_CHARS = 200000;

function requestError(message, statusCode = 400, code) {
  const error = Object.assign(new Error(message), { statusCode });
  if (code) error.code = code;
  return error;
}

function buildReferenceContext(references = [], capabilities = {}) {
  const validated = validateReferences(references);
  let textChars = 0;
  const text = [];
  const images = [];

  for (const reference of validated) {
    const extension = path.extname(reference.relativePath).toLowerCase();
    if (TEXT_EXTENSIONS.has(extension)) {
      const value = reference.bytes.toString("utf8").replaceAll("\u0000", "");
      if (textChars + value.length > MAX_TEXT_CHARS) {
        throw requestError(
          "Beamer source references are too large for one AI request",
          413
        );
      }
      textChars += value.length;
      text.push(`--- ${reference.relativePath} ---\n${value}`);
      continue;
    }

    if (IMAGE_TYPES[extension]) {
      if (!capabilities.imageInput) {
        throw requestError(
          "The selected provider or model does not accept image references",
          400,
          "image_not_supported"
        );
      }
      images.push({
        type: "image_url",
        image_url: {
          url: `data:${IMAGE_TYPES[extension]};base64,${reference.bytes.toString("base64")}`
        }
      });
      continue;
    }

    throw requestError(
      `Reference type '${extension}' is available only in Advanced handoff`
    );
  }

  return { text: text.join("\n\n"), images };
}

module.exports = {
  TEXT_EXTENSIONS,
  IMAGE_TYPES,
  MAX_TEXT_CHARS,
  buildReferenceContext
};
