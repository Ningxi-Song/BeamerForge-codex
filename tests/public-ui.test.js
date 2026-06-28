const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const publicDir = path.resolve(__dirname, "..", "workbench", "public");

function readPublicFile(fileName) {
  return fs.readFileSync(path.join(publicDir, fileName), "utf8");
}

test("workbench index exposes cumulative wizard regions", () => {
  const html = readPublicFile("index.html");
  const requiredIds = [
    "wizardApp",
    "stepList",
    "stepTitle",
    "stepDescription",
    "stepContent",
    "summaryList",
    "slidePreview",
    "saveStatus",
    "backStep",
    "nextStep",
    "reviewGenerate",
    "compileTheme",
    "buildStatus"
  ];

  for (const id of requiredIds) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test("workbench index loads wizard state before app script", () => {
  const html = readPublicFile("index.html");
  assert.match(html, /<script src="\/wizard-state\.js"><\/script>\s*<script src="\/app\.js"><\/script>/);
});

test("browser script renders wizard steps and preserves cumulative choices", () => {
  const script = readPublicFile("app.js");
  for (const name of [
    "currentStep",
    "navigateToStep",
    "renderStepList",
    "renderStepContent",
    "renderSummary",
    "applyChoice",
    "saveDraft",
    "renderPreview",
    "generateTheme"
  ]) {
    assert.match(script, new RegExp(`function ${name}\\(`));
  }
  assert.match(script, /BeamerForgeWizard/);
  assert.match(script, /history\.pushState/);
  assert.match(script, /deriveStepStatuses/);
  assert.match(script, /canGenerate/);
  assert.doesNotMatch(script, /syncThemeFromControls/);
});
