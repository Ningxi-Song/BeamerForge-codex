"use strict";

const fs = require("node:fs");
const path = require("node:path");

const FILES = Object.freeze({ manual: "manual-theme.json", draft: "ai-draft-theme.json", current: "theme.json" });

function readJson(stateDir, name) {
  return JSON.parse(fs.readFileSync(path.join(stateDir, name), "utf8"));
}

function atomicWriteJson(stateDir, name, value) {
  fs.mkdirSync(stateDir, { recursive: true });
  const target = path.join(stateDir, name);
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, target);
}

function freezeManualTheme(stateDir, theme) { atomicWriteJson(stateDir, FILES.manual, theme); }
function readManualTheme(stateDir) { return readJson(stateDir, FILES.manual); }
function saveAiDraft(stateDir, theme) { atomicWriteJson(stateDir, FILES.draft, theme); }
function readAiDraft(stateDir) { return readJson(stateDir, FILES.draft); }
function acceptAiDraft(stateDir) { atomicWriteJson(stateDir, FILES.current, readAiDraft(stateDir)); }
function restoreManualTheme(stateDir) { atomicWriteJson(stateDir, FILES.current, readManualTheme(stateDir)); }

module.exports = {
  FILES,
  atomicWriteJson,
  freezeManualTheme,
  readManualTheme,
  saveAiDraft,
  readAiDraft,
  acceptAiDraft,
  restoreManualTheme
};
