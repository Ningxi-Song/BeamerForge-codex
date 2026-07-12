"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DEFAULT_THEME } = require("../schema/theme-schema");
const { freezeManualTheme } = require("../workbench/theme-state");
const { createHandoff, importAiDraft, normalizeReferencePath, MAX_FILE_BYTES } = require("../workbench/ai-handoff");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "beamerforge-handoff-"));
  const stateDir = path.join(root, "state");
  const handoffRoot = path.join(root, "ai-handoff");
  freezeManualTheme(stateDir, DEFAULT_THEME);
  return { root, stateDir, handoffRoot };
}

test("createHandoff publishes a portable external-agent package", () => {
  const { stateDir, handoffRoot } = fixture();
  const result = createHandoff({
    stateDir,
    handoffRoot,
    brief: "Make the theme warmer and more editorial.",
    references: [
      { name: "mood.png", relativePath: "mood.png", bytes: Buffer.from("image") },
      { name: "main.tex", relativePath: "source/main.tex", bytes: Buffer.from("\\documentclass{beamer}") }
    ]
  });
  assert.equal(result.referenceCount, 2);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(handoffRoot, "manual-theme.json"))), DEFAULT_THEME);
  assert.match(fs.readFileSync(path.join(handoffRoot, "instructions.md"), "utf8"), /ai-draft-theme\.json/);
  assert.equal(fs.readFileSync(path.join(handoffRoot, "references/source/main.tex"), "utf8"), "\\documentclass{beamer}");
});

test("reference paths reject traversal and absolute paths", () => {
  assert.throws(() => normalizeReferencePath("../escape.tex"), /Unsafe reference path/);
  assert.throws(() => normalizeReferencePath("C:\\escape.tex"), /Unsafe reference path/);
});

test("failed publication preserves the previous completed handoff", () => {
  const { stateDir, handoffRoot } = fixture();
  createHandoff({ stateDir, handoffRoot, brief: "first", references: [] });
  assert.throws(() => createHandoff({
    stateDir,
    handoffRoot,
    brief: "second",
    references: [{ name: "huge.png", relativePath: "huge.png", bytes: Buffer.alloc(MAX_FILE_BYTES + 1) }]
  }), /20 MiB/);
  assert.equal(fs.readFileSync(path.join(handoffRoot, "customization-brief.md"), "utf8"), "first\n");
});

test("reference destinations are unique case-insensitively", () => {
  const { stateDir, handoffRoot } = fixture();
  assert.throws(() => createHandoff({
    stateDir,
    handoffRoot,
    brief: "duplicate",
    references: [
      { name: "A.png", relativePath: "A.png", bytes: Buffer.from("a") },
      { name: "a.png", relativePath: "a.png", bytes: Buffer.from("b") }
    ]
  }), /Duplicate reference path/);
});

test("importAiDraft stores only complete validated themes", () => {
  const { stateDir } = fixture();
  const draft = structuredClone(DEFAULT_THEME);
  draft.colors.primary = "#A14D3A";
  const result = importAiDraft({ stateDir, draftBuffer: Buffer.from(JSON.stringify(draft)) });
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(stateDir, "ai-draft-theme.json"))), draft);
});

test("importAiDraft rejects unknown fields without replacing an existing draft", () => {
  const { stateDir } = fixture();
  const valid = structuredClone(DEFAULT_THEME);
  importAiDraft({ stateDir, draftBuffer: Buffer.from(JSON.stringify(valid)) });
  const broken = structuredClone(DEFAULT_THEME);
  broken.rawLatex = "\\usepackage{shellesc}";
  const result = importAiDraft({ stateDir, draftBuffer: Buffer.from(JSON.stringify(broken)) });
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((error) => error.path === "rawLatex"), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(stateDir, "ai-draft-theme.json"))), valid);
});
