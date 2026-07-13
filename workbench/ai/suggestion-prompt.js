"use strict";

function requestError(message, code, statusCode, errors) {
  const error = Object.assign(new Error(message), { code, statusCode });
  if (Array.isArray(errors)) error.errors = errors;
  return error;
}

function createMessages({ baseline, brief, referenceContext = {} }) {
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
    "Keep fields unchanged unless the user request requires a change."
  ].join(" ");
  const request = [
    `User request:\n${cleanBrief}`,
    `Protected baseline JSON:\n${JSON.stringify(baseline)}`,
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
  createMessages,
  parseCandidate
};
