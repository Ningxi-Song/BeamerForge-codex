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

function functionSource(script, name) {
  const start = script.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing function ${name}`);
  const next = script.indexOf("\nfunction ", start + 1);
  return script.slice(start, next === -1 ? script.length : next);
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
  assert.match(html, /<script src="\/wizard-state\.js"><\/script>\s*<script src="\/preview-state\.js"><\/script>\s*<script src="\/app\.js"><\/script>/);
});

test("preview toolbar identifies the instant HTML preview", () => {
  const html = readPublicFile("index.html");
  assert.match(html, />Instant HTML preview</);
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
    /function reviewGate\(\) \{[\s\S]*?refreshStatuses\(\);[\s\S]*?renderSummary\(\);[\s\S]*?!wizard\.canGenerate\(state\.statuses\)[\s\S]*?setBuildStatus\("Review required before generation\."\);[\s\S]*?navigateToStep\("manual-review"\);[\s\S]*?return false;[\s\S]*?!wizard\.canFinalize\(state\.workflow\)[\s\S]*?return false;[\s\S]*?return true;[\s\S]*?\}/
  );
  assert.match(script, /async function compileTheme\(\) \{[\s\S]*?if \(!reviewGate\(\)\) return;[\s\S]*?\/api\/compile/);
  assert.match(script, /elements\.compileTheme\.disabled = state\.busy \|\| !wizard\.canFinalize\(state\.workflow\);/);
  assert.doesNotMatch(script, /elements\.compileTheme\.disabled = state\.busy;/);
});

test("browser generation is blocked until wizard statuses are complete", () => {
  const script = readPublicFile("app.js");
  assert.match(
    script,
    /function reviewGate\(\) \{[\s\S]*?refreshStatuses\(\);[\s\S]*?renderSummary\(\);[\s\S]*?!wizard\.canGenerate\(state\.statuses\)[\s\S]*?setBuildStatus\("Review required before generation\."\);[\s\S]*?navigateToStep\("manual-review"\);[\s\S]*?return false;[\s\S]*?!wizard\.canFinalize\(state\.workflow\)[\s\S]*?return false;[\s\S]*?return true;[\s\S]*?\}/
  );
  assert.match(
    script,
    /async function generateTheme\(\) \{[\s\S]*?if \(!reviewGate\(\)\) return;[\s\S]*?\/api\/generate/
  );
  assert.match(
    script,
    /elements\.reviewGenerate\.disabled = [^;\n]*!wizard\.canFinalize\(state\.workflow\)[^;\n]*;/
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

test("browser resolves debounced preview designs and rejects stale responses", () => {
  const script = readPublicFile("app.js");
  assert.match(script, /resolvedDesign:\s*null/);
  assert.match(script, /previewResolution:\s*null/);
  assert.match(script, /BeamerForgePreviewState/);
  assert.match(script, /async function requestResolvedDesign\(theme\)[\s\S]*?api\("\/api\/design\/resolve",[\s\S]*?method:\s*"POST"[\s\S]*?JSON\.stringify\(theme\)/);
  assert.match(script, /createPreviewLifecycle\(/);
  assert.match(script, /state\.resolvedDesign = design/);
  assert.match(script, /previewState\.applyPreviewFailure\(state, error\)/);
  assert.match(script, /render\(\{ schedulePreview: false \}\)/);
  const scheduler = functionSource(script, "schedulePreviewResolution");
  assert.match(scheduler, /JSON\.stringify\(state\.theme\)/);
  assert.match(scheduler, /state\.previewResolution\.schedule/);
  assert.match(functionSource(script, "render"), /schedulePreviewResolution\(\)/);
  assert.match(functionSource(script, "render"), /schedulePreview !== false/);
  assert.match(functionSource(script, "navigateToStep"), /render\(\{ schedulePreview: opts\.schedulePreview \}\)/);
  assert.match(functionSource(script, "boot"), /await resolvePreviewDesign\([\s\S]*?render:\s*false[\s\S]*?schedulePreview:\s*false/);
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
  assert.match(functionSource(script, "refreshColorEditorOutputs"), /palDisp[\s\S]*?schedulePreviewResolution\(\);[\s\S]*?renderPreview\(\)/);
});

test("summary controls distinguish the current step from editable steps", () => {
  const script = readPublicFile("app.js");
  assert.match(script, /const activeStepId = currentStep\(\)\.id;/);
  assert.match(script, /edit\.disabled = status\.id === activeStepId;/);
  assert.match(script, /edit\.textContent = status\.id === activeStepId \? "Current" : "Edit";/);
  assert.match(script, /edit\.setAttribute\("aria-label", `Edit \$\{status\.label\}`\);/);
  assert.match(script, /if \(status\.id !== activeStepId\) \{[\s\S]*?navigateToStep\(status\.id\)[\s\S]*?\}/);

  const css = readPublicFile("styles.css");
  assert.match(css, /\.summary-row\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;/);
  assert.match(css, /\.summary-row \.secondary-button\s*\{[\s\S]*width:\s*auto;/);
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

test("workbench exposes the manual and external AI phases", () => {
  const html = readPublicFile("index.html");
  assert.match(html, /data-region="phase-progress"/);
  const script = readPublicFile("app.js");
  for (const token of [
    "freezeManualBaseline", "exportAiHandoff", "importAiDraft", "loadAiComparison",
    "selectFinalVersion", "renderThemeChanges", "renderPhaseProgress", "FormData",
    "/api/manual-baseline", "/api/ai/handoff", "/api/ai/import", "/api/ai/comparison",
    "/api/ai/accept", "/api/ai/restore", "webkitRelativePath"
  ]) assert.match(script, new RegExp(escapeRegExp(token)));
  const css = readPublicFile("styles.css");
  assert.match(css, /\.comparison-grid/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.comparison-grid/);
});

test("browser preview renders only server-resolved design fields", () => {
  const script = readPublicFile("app.js");
  for (const name of ["appendHeader", "appendTitle", "appendList", "appendBlock", "appendFootline", "appendCornerLogo", "renderThemeInto"]) {
    const source = functionSource(script, name);
    assert.doesNotMatch(source, /state\.registry/);
    assert.doesNotMatch(source, /state\.theme/);
  }
  const renderer = functionSource(script, "renderThemeInto");
  assert.match(renderer, /design\.typography\.body\.cssFamily/);
  assert.match(renderer, /design\.colors\.background/);
  assert.match(renderer, /design\.colors\.accent/);
  assert.match(renderer, /appendHeader\(slide, design\)/);
  assert.match(functionSource(script, "appendTitle"), /design\.typography\.title\.cssFamily/);
  assert.match(functionSource(script, "appendList"), /design\.components\.bullet\.marker/);
  assert.match(functionSource(script, "appendList"), /design\.content\.bullets/);
  assert.match(functionSource(script, "appendBlock"), /design\.components\.block\.cssRadius/);
  assert.match(functionSource(script, "appendBlock"), /design\.content\.blockTitle/);
  assert.match(functionSource(script, "appendFootline"), /design\.components\.navigation\.footline/);
  assert.match(functionSource(script, "appendFootline"), /design\.identity\.name/);
  const logo = functionSource(script, "appendCornerLogo");
  assert.match(logo, /design\.components\.cornerLogo/);
  assert.match(logo, /vectorId == null/);
  assert.match(logo, /previewUrl/);
  assert.match(logo, /position/);
  assert.match(logo, /sizeUnits/);
  assert.match(logo, /scope/);
  assert.doesNotMatch(logo, /\.id\s*===\s*"none"/);
  assert.match(script, /preview-corner-logo/);
  const css = readPublicFile("styles.css");
  assert.match(css, /\.preview-corner-logo\.is-top-right/);
});

test("AI comparisons resolve and render paired designs", () => {
  const script = readPublicFile("app.js");
  assert.match(script, /comparison:\s*null/);
  assert.match(script, /manualDesign:\s*null/);
  assert.match(script, /draftDesign:\s*null/);
  const loader = functionSource(script, "loadAiComparison");
  assert.match(loader, /Promise\.all\(\[/);
  assert.match(loader, /requestResolvedDesign\(comparison\.manual\)/);
  assert.match(loader, /requestResolvedDesign\(comparison\.draft\)/);
  assert.match(loader, /manualDesign/);
  assert.match(loader, /draftDesign/);
  assert.match(loader, /state\.comparison = \{ \.\.\.comparison, manualDesign: null, draftDesign: null \}/);
  assert.match(loader, /state\.workflow\.hasValidAiDraft = false/);
  assert.match(loader, /setBuildStatus\(error\.details \|\| error\.message\)/);
  assert.match(functionSource(script, "renderAiCompare"), /state\.comparison\.manualDesign/);
  assert.match(functionSource(script, "renderAiCompare"), /state\.comparison\.draftDesign/);
  assert.match(functionSource(script, "boot"), /if \(initialDesign && !comparisonError\) setBuildStatus\("No build yet\."\)/);
});

test("handoff page reveals an already imported AI draft", () => {
  const script = readPublicFile("app.js");
  assert.match(script, /function renderAiHandoff\(\)[\s\S]*?state\.workflow\.hasValidAiDraft[\s\S]*?View AI Comparison[\s\S]*?navigateToStep\("ai-compare"\)/);
  const chooser = functionSource(script, "previewDesignForStep");
  assert.match(chooser, /ai-handoff[\s\S]*?state\.comparison\.draftDesign/);
  assert.match(chooser, /return state\.resolvedDesign/);
  assert.doesNotMatch(chooser, /selectedVersion|manualDesign/);
  assert.match(script, /renderThemeInto\(elements\.slidePreview, previewDesignForStep\(\)\)/);
});
