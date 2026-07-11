"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DEFAULT_THEME } = require("../schema/theme-schema");
const {
  freezeManualTheme,
  readManualTheme,
  saveAiDraft,
  readAiDraft,
  acceptAiDraft,
  restoreManualTheme
} = require("../workbench/theme-state");

function tempState() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "beamerforge-state-"));
}

test("AI operations never mutate the frozen manual baseline", () => {
  const stateDir = tempState();
  const manual = structuredClone(DEFAULT_THEME);
  const draft = structuredClone(DEFAULT_THEME);
  draft.colors.primary = "#A14D3A";
  freezeManualTheme(stateDir, manual);
  saveAiDraft(stateDir, draft);
  acceptAiDraft(stateDir);
  assert.deepEqual(readManualTheme(stateDir), manual);
  assert.deepEqual(readAiDraft(stateDir), draft);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(stateDir, "theme.json"))), draft);
});

test("restoreManualTheme makes the baseline current again", () => {
  const stateDir = tempState();
  freezeManualTheme(stateDir, DEFAULT_THEME);
  fs.writeFileSync(path.join(stateDir, "theme.json"), JSON.stringify({ changed: true }));
  restoreManualTheme(stateDir);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(stateDir, "theme.json"))), DEFAULT_THEME);
});
