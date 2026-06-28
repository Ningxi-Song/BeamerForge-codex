const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const publicDir = path.resolve(__dirname, "..", "workbench", "public");

function readPublicFile(fileName) {
  return fs.readFileSync(path.join(publicDir, fileName), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

test("browser script gates compile behind wizard review", () => {
  const script = readPublicFile("app.js");
  assert.match(
    script,
    /function reviewGate\(\) \{[\s\S]*?refreshStatuses\(\);[\s\S]*?renderSummary\(\);[\s\S]*?!wizard\.canGenerate\(state\.statuses\)[\s\S]*?setBuildStatus\("Review required before generation\."\);[\s\S]*?navigateToStep\("review"\);[\s\S]*?return false;[\s\S]*?return true;[\s\S]*?\}/
  );
  assert.match(script, /async function compileTheme\(\) \{[\s\S]*?if \(!reviewGate\(\)\) return;[\s\S]*?\/api\/compile/);
  assert.match(script, /elements\.compileTheme\.disabled = state\.busy \|\| !wizard\.canGenerate\(state\.statuses\);/);
  assert.doesNotMatch(script, /elements\.compileTheme\.disabled = state\.busy;/);
});

test("browser generation is blocked until wizard statuses are complete", () => {
  const script = readPublicFile("app.js");
  assert.match(
    script,
    /function reviewGate\(\) \{[\s\S]*?refreshStatuses\(\);[\s\S]*?renderSummary\(\);[\s\S]*?!wizard\.canGenerate\(state\.statuses\)[\s\S]*?setBuildStatus\("Review required before generation\."\);[\s\S]*?navigateToStep\("review"\);[\s\S]*?return false;[\s\S]*?return true;[\s\S]*?\}/
  );
  assert.match(
    script,
    /async function generateTheme\(\) \{[\s\S]*?if \(!reviewGate\(\)\) return;[\s\S]*?\/api\/generate/
  );
  assert.match(
    script,
    /elements\.reviewGenerate\.disabled = [^;\n]*!wizard\.canGenerate\(state\.statuses\)[^;\n]*;/
  );
  assert.doesNotMatch(script, /elements\.reviewGenerate\.disabled = state\.busy;/);
});

test("browser boot loads validation metadata for persisted themes", () => {
  const script = readPublicFile("app.js");
  assert.match(script, /api\("\/api\/theme\?validated=1"\)/);
  assert.match(script, /state\.theme = clone\(themeResult\.theme\);/);
  assert.match(
    script,
    /state\.validationErrors = Array\.isArray\(themeResult\.errors\) \? themeResult\.errors : \[\];/
  );
});

test("color step keeps the richer custom color workbench", () => {
  const script = readPublicFile("app.js");
  for (const token of [
    "COLOR_SCHEMES",
    "renderColorStepContent",
    "applyGeneratedScheme",
    "baseColorPicker",
    "baseHexInput",
    "baseRgbSliderR",
    "schemeTabs",
    "schemeSwatches",
    "paletteDisplay",
    "savePalette",
    "savedPalettes"
  ]) {
    assert.match(script, new RegExp(token));
  }

  const css = readPublicFile("styles.css");
  for (const selector of [
    ".color-editor",
    ".color-preview-box",
    ".slider-row",
    ".scheme-tabs",
    ".scheme-swatches",
    ".palette-display",
    ".saved-palettes"
  ]) {
    assert.match(css, new RegExp(escapeRegExp(selector)));
  }
});

test("custom color inputs update the preview without replacing the color step", () => {
  const script = readPublicFile("app.js");
  assert.match(script, /function refreshColorEditorOutputs\(/);
  assert.match(script, /setBaseColor\(rgb, \{ render: false \}\);[\s\S]*?refreshColorEditorOutputs\(\);/);
  assert.match(script, /setBaseColor\(\{ \.\.\.state\.baseColor, \[channel\]: nextValue \}, \{ render: false \}\);/);
});

test("public CSS defines wizard layout, option cards, summary, and preview states", () => {
  const css = readPublicFile("styles.css");
  for (const selector of [
    ".wizard-app",
    ".wizard-rail",
    ".decision-panel",
    ".preview-panel",
    ".summary-panel",
    ".step-button.is-active",
    ".option-card.is-selected",
    ".summary-row[data-state=\"needs-review\"]",
    ".slide-preview",
    ".preview-footline"
  ]) {
    assert.match(css, new RegExp(escapeRegExp(selector)));
  }
});
