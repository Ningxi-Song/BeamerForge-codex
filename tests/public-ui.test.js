const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const publicDir = path.resolve(__dirname, "..", "workbench", "public");

function readPublicFile(fileName) {
  return fs.readFileSync(path.join(publicDir, fileName), "utf8");
}

test("workbench index links the public CSS and browser script", () => {
  const html = readPublicFile("index.html");

  assert.match(html, /<link rel="stylesheet" href="\/styles\.css">/);
  assert.match(html, /<script src="\/app\.js"><\/script>/);
  assert.equal(fs.existsSync(path.join(publicDir, "styles.css")), true);
  assert.equal(fs.existsSync(path.join(publicDir, "app.js")), true);
});

test("workbench index exposes the required controls and output targets", () => {
  const html = readPublicFile("index.html");
  const requiredIds = [
    "palette",
    "bodyFont",
    "bulletStyle",
    "blockStyle",
    "navigationStyle",
    "templateName",
    "slidePreview",
    "saveStatus",
    "buildStatus",
    "saveTheme",
    "generateTheme",
    "compileTheme"
  ];

  for (const id of requiredIds) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test("workbench index exposes embedded color picker controls", () => {
  const html = readPublicFile("index.html");
  const requiredIds = [
    "baseColorPicker",
    "baseHexInput",
    "baseRgbR",
    "baseRgbG",
    "baseRgbB",
    "colorScheme",
    "schemeSwatches",
    "applySchemeColors"
  ];

  for (const id of requiredIds) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test("workbench index exposes fuller color picker workflow controls", () => {
  const html = readPublicFile("index.html");
  const requiredIds = [
    "colorModeTabs",
    "sliderPanel",
    "paletteDisplay",
    "copyHexColor",
    "copyRgbColor",
    "copyAllColors",
    "savePalette",
    "savedPalettes",
    "previewModeTabs"
  ];

  for (const id of requiredIds) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test("workbench index exposes local 3D color cube controls", () => {
  const html = readPublicFile("index.html");
  const requiredIds = [
    "cubePanel",
    "colorCubeCanvas",
    "cubeSelectedSwatch",
    "cubeSelectedValues",
    "cubeHint"
  ];

  for (const id of requiredIds) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  assert.match(html, /data-color-mode="cube"/);
  assert.doesNotMatch(html, /three(?:\.min)?\.js/i);
  assert.doesNotMatch(html, /cdnjs/i);
});

test("workbench exposes visual font and bullet galleries", () => {
  const html = readPublicFile("index.html");
  const script = readPublicFile("app.js");
  const css = readPublicFile("styles.css");

  for (const id of ["fontGallery", "bulletGallery"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  for (const name of ["renderFontGallery", "selectFontOption", "renderBulletGallery", "selectBulletOption"]) {
    assert.match(script, new RegExp(`function ${name}\\(`));
  }

  assert.match(script, /data-font-id/);
  assert.match(script, /data-bullet-id/);
  assert.match(script, /aria-pressed/);
  assert.match(css, /\.option-gallery\s*\{/);
  assert.match(css, /\.sample-card\.is-active\s*\{/);
});

test("visual font and bullet galleries stay compact", () => {
  const script = readPublicFile("app.js");

  assert.doesNotMatch(script, /font-sample-detail/);
  assert.doesNotMatch(script, /Key result:/);
  assert.doesNotMatch(script, /\["Main claim",\s*"Evidence",\s*"Implication"\]/);
  assert.match(script, /bulletSampleText/);
});

test("browser script calls required APIs and preserves failed response details", () => {
  const script = readPublicFile("app.js");

  for (const endpoint of ["/api/options", "/api/theme", "/api/generate", "/api/compile"]) {
    assert.match(script, new RegExp(endpoint.replace("/", "\\/")));
  }

  assert.doesNotMatch(script, /\.innerHTML\s*=/);
  assert.match(script, /details\s*=/);
});

test("browser script renders Beamer-like preview regions", () => {
  const html = readPublicFile("index.html");
  const script = readPublicFile("app.js");

  assert.match(html, /Live Beamer preview/);
  assert.match(script, /frame-title/);
  assert.match(script, /preview-block/);
  assert.match(script, /hasFootline/);
});

test("title preview mirrors the compiled plain Beamer title page", () => {
  const script = readPublicFile("app.js");
  const css = readPublicFile("styles.css");
  const titleRule = css.match(/\.title-preview h3\s*\{[^}]*\}/is)?.[0] || "";
  const subtitleRule = css.match(/\.title-preview p\s*\{[^}]*\}/is)?.[0] || "";
  const metaRule = css.match(/\.title-preview-meta\s*\{[^}]*\}/is)?.[0] || "";

  assert.doesNotMatch(script, /title-preview-rule/);
  assert.doesNotMatch(script, /style\.borderTop/);
  assert.match(script, /main\.append\(title,\s*subtitle,\s*meta\)/);
  assert.doesNotMatch(script, /wrapper\.append\(main,\s*meta\)/);
  assert.match(script, /function previewLatexDate\(/);
  assert.match(script, /previewLatexDate\(theme\.identity\.date\)/);
  assert.match(script, /font-weight:\s*700/);
  assert.match(css, /\.slide-preview\s*\{[^}]*container-type:\s*inline-size/is);
  assert.doesNotMatch(css, /\.title-preview-rule/);
  assert.match(css, /\.title-preview-main\s*\{[^}]*padding:\s*0\s+7\.5cqw/is);
  assert.match(titleRule, /font-size:\s*4\.4cqw/i);
  assert.match(subtitleRule, /font-size:\s*2\.2cqw/i);
  assert.match(css, /\.title-preview-meta\s*\{[^}]*display:\s*grid/is);
  assert.match(metaRule, /font-size:\s*2\.2cqw/i);
  assert.doesNotMatch(css, /\.title-preview-meta\s*\{[^}]*justify-content:\s*space-between/is);
  assert.doesNotMatch(`${titleRule}\n${subtitleRule}\n${metaRule}`, /font-size:\s*\d+px/i);
});

test("browser script embeds color picker conversion and scheme logic", () => {
  const script = readPublicFile("app.js");

  for (const name of [
    "rgbToHex",
    "hexToRgb",
    "rgbToHsl",
    "hslToRgb",
    "generateScheme",
    "applyGeneratedScheme"
  ]) {
    assert.match(script, new RegExp(`function ${name}\\(`));
  }
});

test("browser script embeds saved palette, copy, font preview, and preview-mode logic", () => {
  const script = readPublicFile("app.js");

  for (const name of [
    "savePalette",
    "loadSavedPalette",
    "deleteSavedPalette",
    "copyAllColors",
    "registerFontFaces",
    "renderPreviewMode"
  ]) {
    assert.match(script, new RegExp(`function ${name}\\(`));
  }

  assert.match(script, /sliderPanel/);
  assert.match(script, /previewModeTabs/);
});

test("browser script embeds local 3D cube logic without external Three.js", () => {
  const script = readPublicFile("app.js");

  for (const name of [
    "initColorCube",
    "renderColorCube",
    "projectCubePoint",
    "selectCubeColor",
    "bindCubeControls",
    "setColorMode"
  ]) {
    assert.match(script, new RegExp(`function ${name}\\(`));
  }

  assert.match(script, /cubeCells/);
  assert.doesNotMatch(script, /\bTHREE\b/);
  assert.doesNotMatch(script, /cdnjs/);
});

test("public CSS preserves hidden picker panels despite display utilities", () => {
  const css = readPublicFile("styles.css");

  assert.match(css, /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/i);
});
