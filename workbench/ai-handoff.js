"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { validateTheme } = require("../schema/theme-schema");
const { getRegistry } = require("../registry/options");
const { readManualTheme, saveAiDraft } = require("./theme-state");

const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".pdf", ".tex", ".sty", ".cls", ".bib", ".svg"]);
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;

function badRequest(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function normalizeReferencePath(value) {
  const original = String(value || "");
  if (path.isAbsolute(original) || /^[A-Za-z]:[\\/]/.test(original)) throw badRequest("Unsafe reference path");
  const normalized = original.replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized.split("/").some((part) => part === ".." || part === "." || part === "")) {
    throw badRequest("Unsafe reference path");
  }
  return normalized;
}

function validateReferences(references) {
  const seen = new Set();
  let total = 0;
  return references.map((reference) => {
    const relativePath = normalizeReferencePath(reference.relativePath || reference.name);
    const extension = path.extname(relativePath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) throw badRequest(`Unsupported reference extension '${extension}'`);
    if (!Buffer.isBuffer(reference.bytes)) throw badRequest(`Reference '${relativePath}' has no file data`);
    if (reference.bytes.length > MAX_FILE_BYTES) throw badRequest(`Reference '${relativePath}' exceeds 20 MiB`);
    total += reference.bytes.length;
    if (total > MAX_TOTAL_BYTES) throw badRequest("References exceed 100 MiB in total");
    const key = relativePath.toLowerCase();
    if (seen.has(key)) throw badRequest(`Duplicate reference path '${relativePath}'`);
    seen.add(key);
    return { relativePath, bytes: reference.bytes };
  });
}

function instructions() {
  return `# External AI customization instructions

Read \`manual-theme.json\` as the protected baseline and \`customization-brief.md\` as the user's request.
Treat files under \`references/\` as read-only inspiration.
Change only fields supported by the existing BeamerForge theme schema.
Do not add raw LaTeX, TikZ, packages, commands, or unknown fields.
Do not edit \`manual-theme.json\`.
Write the complete result to \`ai-draft-theme.json\`.
`;
}

function removeSibling(directory) {
  const parent = path.dirname(directory);
  const resolved = path.resolve(directory);
  if (path.dirname(resolved) !== path.resolve(parent)) throw new Error("Refusing to remove non-sibling path");
  fs.rmSync(resolved, { recursive: true, force: true });
}

function createHandoff({ stateDir, handoffRoot, brief, references = [] }) {
  const validated = validateReferences(references);
  const manualTheme = readManualTheme(stateDir);
  const target = path.resolve(handoffRoot);
  const temporary = `${target}.tmp-${process.pid}`;
  const backup = `${target}.backup-${process.pid}`;
  removeSibling(temporary);
  removeSibling(backup);
  fs.mkdirSync(path.join(temporary, "references"), { recursive: true });
  fs.writeFileSync(path.join(temporary, "manual-theme.json"), `${JSON.stringify(manualTheme, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(temporary, "customization-brief.md"), `${String(brief || "").trim()}\n`, "utf8");
  fs.writeFileSync(path.join(temporary, "instructions.md"), instructions(), "utf8");
  for (const reference of validated) {
    const destination = path.join(temporary, "references", ...reference.relativePath.split("/"));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, reference.bytes);
  }
  let backedUp = false;
  try {
    if (fs.existsSync(target)) {
      fs.renameSync(target, backup);
      backedUp = true;
    }
    fs.renameSync(temporary, target);
    if (backedUp) removeSibling(backup);
  } catch (error) {
    if (fs.existsSync(temporary)) removeSibling(temporary);
    if (backedUp && !fs.existsSync(target)) fs.renameSync(backup, target);
    throw error;
  }
  return { handoffRoot: target, referenceCount: validated.length };
}

function importAiDraft({ stateDir, draftBuffer, registry = getRegistry() }) {
  if (!Buffer.isBuffer(draftBuffer)) throw badRequest("AI draft has no file data");
  if (draftBuffer.length > 1024 * 1024) throw Object.assign(new Error("AI draft exceeds 1 MiB"), { statusCode: 413 });
  let draft;
  try {
    draft = JSON.parse(draftBuffer.toString("utf8"));
  } catch {
    throw badRequest("AI draft is not valid JSON");
  }
  const validation = validateTheme(draft, { registry });
  if (!validation.ok) return { ok: false, errors: validation.errors };
  saveAiDraft(stateDir, validation.value);
  return { ok: true, theme: validation.value };
}

module.exports = {
  ALLOWED_EXTENSIONS,
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  normalizeReferencePath,
  validateReferences,
  createHandoff,
  importAiDraft
};
