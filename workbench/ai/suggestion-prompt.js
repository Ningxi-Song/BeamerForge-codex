"use strict";

function requestError(message, code, statusCode, errors) {
  const error = Object.assign(new Error(message), { code, statusCode });
  if (Array.isArray(errors)) error.errors = errors;
  return error;
}

function catalogChoices(registry) {
  if (!registry) return null;
  const options = (collection) => Object.values(collection || {})
    .map(({ id, label }) => ({ id, label }));
  return {
    "foundation.aspectRatio": ["16:9", "4:3"],
    "foundation.baseLayout": ["single"],
    "colors.paletteId": options(registry.palettes),
    "fonts.body": options(registry.fonts),
    "fonts.title": options(registry.fonts),
    "bullets.style": options(registry.bullets),
    "blocks.style": options(registry.blocks),
    "navigation.style": options(registry.navigation),
    "titlePage.layout": options(registry.titlePages),
    "decorations.cornerLogo.id": options(registry.logos),
    "decorations.cornerLogo.position": ["top-left", "top-right"],
    "decorations.cornerLogo.size": ["small", "medium"],
    "decorations.cornerLogo.scope": ["content-frames"]
  };
}

function createMessages({ baseline, brief, referenceContext = {}, registry }) {
  const cleanBrief = String(brief || "").trim();
  if (!cleanBrief) {
    throw Object.assign(
      new Error("Describe what you want the AI to change"),
      { statusCode: 400 }
    );
  }

  const system = [
    "You customize BeamerForge themes.",
    "Return one complete JSON object with exactly the same supported theme shape as the baseline.",
    "Do not return Markdown, raw LaTeX, TikZ, packages, commands, executable code, or arbitrary asset paths.",
    "Use only catalog IDs listed in the allowed choices.",
    "Keep fields unchanged unless the user request requires a change."
  ].join(" ");
  const choices = catalogChoices(registry);
  const request = [
    `User request:\n${cleanBrief}`,
    `Protected baseline JSON:\n${JSON.stringify(baseline)}`,
    choices
      ? `Allowed catalog choices (ID and human label):\n${JSON.stringify(choices)}`
      : "",
    referenceContext.text
      ? `Read-only Beamer source references:\n${referenceContext.text}`
      : ""
  ].filter(Boolean).join("\n\n");
  const images = Array.isArray(referenceContext.images)
    ? referenceContext.images
    : [];
  const content = [
    { type: "text", text: request },
    ...images
  ];
  return [
    { role: "system", content: system },
    {
      role: "user",
      content: content.length === 1 ? request : content
    }
  ];
}

function parseCandidate(content, { registry, validateTheme }) {
  const clean = String(content || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let value;
  try {
    value = JSON.parse(clean);
  } catch {
    throw requestError(
      "The suggestion was not valid JSON",
      "provider_invalid_response",
      502
    );
  }
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw requestError(
      "The suggestion was not a complete BeamerForge design",
      "provider_invalid_response",
      502
    );
  }

  const result = validateTheme(value, { registry });
  if (!result.ok) {
    throw requestError(
      "The suggestion was not a valid BeamerForge design",
      "provider_invalid_theme",
      422,
      result.errors
    );
  }
  return result.value;
}

module.exports = {
  catalogChoices,
  createMessages,
  parseCandidate
};
