# HTML Beamer Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first vertical slice of the HTML workbench that edits `theme.json`, previews a Beamer-like slide in HTML, generates a complete Beamer project, and runs a local compile command when available.

**Architecture:** Use `theme.json` as the source of truth. A small Node.js stack validates tokens, resolves registry options, generates LaTeX files, serves a vanilla HTML workbench, and delegates PDF compilation to `latexmk` or `xelatex`.

**Tech Stack:** Node.js 20 CommonJS, built-in `node:test`, vanilla HTML/CSS/JS, local HTTP server, XeLaTeX or `latexmk` for compile smoke tests.

> Superseded UI note: Task 8's single-screen browser workbench UI has been
> replaced by `docs/superpowers/plans/2026-06-28-cumulative-workbench-wizard.md`.
> Foundation tasks for schema, registry, generator, server, and build remain
> useful unless contradicted by the newer plan.

---

## Scope

This plan implements the rollout slice from the approved spec:

- One palette family.
- Two font choices.
- Two bullet styles.
- Two navigation or footline choices.
- One title page layout.
- One generated template folder.
- One compile smoke command.

The implementation must not require installing npm packages. Use only Node built-ins.

## File Structure

Create these files:

- `package.json`: Node scripts for tests, syntax checks, server startup, generation, and compile smoke.
- `schema/theme-schema.js`: default theme, validation helpers, and field-level validation errors.
- `registry/options.js`: curated options for palettes, fonts, bullets, blocks, navigation, and title pages.
- `generators/latex.js`: pure functions that convert a validated theme into LaTeX/Markdown file contents.
- `generators/project-writer.js`: file writer that creates `templates/<name>/` projects and copies font assets.
- `generators/cli.js`: command-line generator for a theme JSON file.
- `workbench/build.js`: compiler detection, compile execution, and LaTeX log excerpt extraction.
- `workbench/server.js`: local HTTP server and JSON API.
- `workbench/smoke-compile.js`: vertical-slice generator plus compile smoke runner.
- `workbench/public/index.html`: browser workbench shell.
- `workbench/public/styles.css`: workbench layout and slide preview styles.
- `workbench/public/app.js`: browser-side state, controls, preview, and API calls.
- `tests/schema.test.js`: schema validation tests.
- `tests/registry.test.js`: registry coverage tests.
- `tests/generator.test.js`: generated content tests.
- `tests/project-writer.test.js`: project writer tests.
- `tests/build.test.js`: compiler detection and build-result tests.
- `tests/server.test.js`: API route tests.

Modify these files:

- `.gitignore`: ignore local workbench state and temporary build output.
- `README.md`: add a short workbench usage section.

Generated user projects live under `templates/<name>/`. LaTeX intermediate files and workbench state stay untracked.

---

### Task 1: Add Node Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tests/scaffold.test.js`
- Modify: `.gitignore`

- [ ] **Step 1: Write the failing scaffold test**

Create `tests/scaffold.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("package scripts define the workbench commands", () => {
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.equal(pkg.private, true);
  assert.equal(pkg.type, "commonjs");
  assert.equal(pkg.scripts.test, "node --test tests");
  assert.equal(pkg.scripts.check.includes("node --check"), true);
  assert.equal(pkg.scripts.start, "node workbench/server.js");
  assert.equal(pkg.scripts["smoke:compile"], "node workbench/smoke-compile.js");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test tests/scaffold.test.js
```

Expected: FAIL because `package.json` does not exist.

- [ ] **Step 3: Add `package.json`**

Create `package.json`:

```json
{
  "name": "beamerforge-workbench",
  "version": "0.1.0",
  "private": true,
  "type": "commonjs",
  "scripts": {
    "test": "node --test tests",
    "check": "node --check schema/theme-schema.js && node --check registry/options.js && node --check generators/latex.js && node --check generators/project-writer.js && node --check generators/cli.js && node --check workbench/build.js && node --check workbench/server.js && node --check workbench/smoke-compile.js && node --check workbench/public/app.js",
    "start": "node workbench/server.js",
    "generate": "node generators/cli.js --theme theme.json --out templates/generated",
    "smoke:compile": "node workbench/smoke-compile.js"
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 4: Update `.gitignore` for local workbench output**

Add these lines near the existing generated-output ignores:

```gitignore
workbench/state/
workbench/build/
```

Keep `.superpowers/` ignored.

- [ ] **Step 5: Run the scaffold test**

Run:

```powershell
node --test tests/scaffold.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add package.json tests/scaffold.test.js .gitignore
git commit -m "Add Node workbench scaffolding"
```

---

### Task 2: Add Theme Schema Validation

**Files:**
- Create: `schema/theme-schema.js`
- Create: `tests/schema.test.js`

- [ ] **Step 1: Write failing schema tests**

Create `tests/schema.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_THEME, validateTheme, slugifyName } = require("../schema/theme-schema");

test("validates the default theme", () => {
  const result = validateTheme(DEFAULT_THEME);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.value.identity.name, "blue-academic");
  assert.equal(result.value.foundation.aspectRatio, "16:9");
});

test("reports field-level validation errors", () => {
  const broken = {
    identity: { name: "Bad Name With Spaces" },
    foundation: { aspectRatio: "3:2" },
    colors: { paletteId: "academic-blue", background: "white", primary: "#456990", accent: "#57C3C2", text: "#000000" },
    fonts: { body: "palatino", title: "palatino", mode: "serif-academic" },
    bullets: { style: "pifont-outline" },
    blocks: { style: "rounded" },
    navigation: { style: "page-number" },
    titlePage: { layout: "left-curtain" },
    contentDefaults: { sampleTitle: "" }
  };
  const result = validateTheme(broken);
  assert.equal(result.ok, false);
  assert.deepEqual(
    result.errors.map((error) => error.path),
    ["identity.name", "foundation.aspectRatio", "colors.background", "contentDefaults.sampleTitle"]
  );
});

test("slugifies names for output paths", () => {
  assert.equal(slugifyName("Blue Academic 2026"), "blue-academic-2026");
  assert.equal(slugifyName("___Bamboo!!!"), "bamboo");
});
```

- [ ] **Step 2: Run schema tests to verify failure**

Run:

```powershell
node --test tests/schema.test.js
```

Expected: FAIL with `Cannot find module '../schema/theme-schema'`.

- [ ] **Step 3: Implement schema validation**

Create `schema/theme-schema.js`:

```js
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const DEFAULT_THEME = Object.freeze({
  identity: {
    name: "blue-academic",
    title: "Presentation Title",
    subtitle: "Short subtitle or event name",
    author: "Presenter Name",
    institute: "Institution Name",
    date: "\\today"
  },
  foundation: {
    aspectRatio: "16:9",
    baseLayout: "single"
  },
  colors: {
    paletteId: "academic-blue",
    background: "#FFFFFF",
    primary: "#456990",
    accent: "#57C3C2",
    text: "#000000",
    blockBody: "#D9EBEF",
    alert: "#CC2D18"
  },
  fonts: {
    body: "palatino",
    title: "palatino",
    mode: "serif-academic"
  },
  bullets: {
    style: "pifont-outline"
  },
  blocks: {
    style: "rounded"
  },
  navigation: {
    style: "page-number"
  },
  titlePage: {
    layout: "left-curtain"
  },
  contentDefaults: {
    sampleTitle: "The design keeps one idea visible per slide",
    sampleBullets: [
      "A structured theme controls colors, fonts, and navigation",
      "HTML preview updates immediately after each choice",
      "Beamer compilation remains the final visual check"
    ]
  },
  build: {
    status: "idle",
    warnings: []
  }
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function slugifyName(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function addError(errors, path, message) {
  errors.push({ path, message });
}

function hasObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireObject(theme, key, errors) {
  if (!hasObject(theme[key])) {
    addError(errors, key, `${key} must be an object`);
    return {};
  }
  return theme[key];
}

function requireNonEmptyString(object, path, errors) {
  const parts = path.split(".");
  const key = parts[parts.length - 1];
  if (typeof object[key] !== "string" || object[key].trim() === "") {
    addError(errors, path, `${path} must be a non-empty string`);
  }
}

function requireHex(object, path, errors) {
  const parts = path.split(".");
  const key = parts[parts.length - 1];
  if (typeof object[key] !== "string" || !HEX_COLOR.test(object[key])) {
    addError(errors, path, `${path} must be a #RRGGBB color`);
  }
}

function requireKnownId(registry, collection, id, path, errors) {
  if (!registry) return;
  if (!registry[collection] || !registry[collection][id]) {
    addError(errors, path, `${path} references unknown ${collection} option '${id}'`);
  }
}

function validateTheme(input, options = {}) {
  const errors = [];
  const theme = hasObject(input) ? clone(input) : {};
  const registry = options.registry;

  const identity = requireObject(theme, "identity", errors);
  requireNonEmptyString(identity, "identity.name", errors);
  if (typeof identity.name === "string" && !SLUG.test(identity.name)) {
    addError(errors, "identity.name", "identity.name must be a lowercase slug");
  }
  for (const key of ["title", "subtitle", "author", "institute", "date"]) {
    if (identity[key] !== undefined) requireNonEmptyString(identity, `identity.${key}`, errors);
  }

  const foundation = requireObject(theme, "foundation", errors);
  if (!["16:9", "4:3"].includes(foundation.aspectRatio)) {
    addError(errors, "foundation.aspectRatio", "foundation.aspectRatio must be 16:9 or 4:3");
  }
  if (foundation.baseLayout !== undefined && !["single"].includes(foundation.baseLayout)) {
    addError(errors, "foundation.baseLayout", "foundation.baseLayout must be single");
  }

  const colors = requireObject(theme, "colors", errors);
  requireNonEmptyString(colors, "colors.paletteId", errors);
  requireKnownId(registry, "palettes", colors.paletteId, "colors.paletteId", errors);
  for (const key of ["background", "primary", "accent", "text"]) {
    requireHex(colors, `colors.${key}`, errors);
  }
  for (const key of ["blockBody", "alert"]) {
    if (colors[key] !== undefined) requireHex(colors, `colors.${key}`, errors);
  }

  const fonts = requireObject(theme, "fonts", errors);
  requireNonEmptyString(fonts, "fonts.body", errors);
  requireNonEmptyString(fonts, "fonts.title", errors);
  requireKnownId(registry, "fonts", fonts.body, "fonts.body", errors);
  requireKnownId(registry, "fonts", fonts.title, "fonts.title", errors);

  const bullets = requireObject(theme, "bullets", errors);
  requireNonEmptyString(bullets, "bullets.style", errors);
  requireKnownId(registry, "bullets", bullets.style, "bullets.style", errors);

  const blocks = requireObject(theme, "blocks", errors);
  requireNonEmptyString(blocks, "blocks.style", errors);
  requireKnownId(registry, "blocks", blocks.style, "blocks.style", errors);

  const navigation = requireObject(theme, "navigation", errors);
  requireNonEmptyString(navigation, "navigation.style", errors);
  requireKnownId(registry, "navigation", navigation.style, "navigation.style", errors);

  const titlePage = requireObject(theme, "titlePage", errors);
  requireNonEmptyString(titlePage, "titlePage.layout", errors);
  requireKnownId(registry, "titlePages", titlePage.layout, "titlePage.layout", errors);

  const contentDefaults = requireObject(theme, "contentDefaults", errors);
  requireNonEmptyString(contentDefaults, "contentDefaults.sampleTitle", errors);
  if (!Array.isArray(contentDefaults.sampleBullets) || contentDefaults.sampleBullets.length < 3) {
    addError(errors, "contentDefaults.sampleBullets", "contentDefaults.sampleBullets must contain at least three bullets");
  }

  return {
    ok: errors.length === 0,
    errors,
    value: theme
  };
}

module.exports = {
  DEFAULT_THEME,
  validateTheme,
  slugifyName
};
```

- [ ] **Step 4: Run schema tests**

Run:

```powershell
node --test tests/schema.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add schema/theme-schema.js tests/schema.test.js
git commit -m "Add theme schema validation"
```

---

### Task 3: Add Registry Options

**Files:**
- Create: `registry/options.js`
- Create: `tests/registry.test.js`

- [ ] **Step 1: Write failing registry tests**

Create `tests/registry.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_THEME, validateTheme } = require("../schema/theme-schema");
const { getRegistry, resolveThemeChoices } = require("../registry/options");

test("registry covers the rollout minimum", () => {
  const registry = getRegistry();
  assert.deepEqual(Object.keys(registry.palettes), ["academic-blue"]);
  assert.equal(Object.keys(registry.fonts).length, 2);
  assert.equal(Object.keys(registry.bullets).length, 2);
  assert.equal(Object.keys(registry.navigation).length, 2);
  assert.deepEqual(Object.keys(registry.titlePages), ["left-curtain"]);
});

test("default theme IDs resolve against registry", () => {
  const registry = getRegistry();
  const validation = validateTheme(DEFAULT_THEME, { registry });
  assert.equal(validation.ok, true);
  const choices = resolveThemeChoices(DEFAULT_THEME, registry);
  assert.equal(choices.palette.label, "Academic Blue");
  assert.equal(choices.bodyFont.label, "Palatino");
  assert.equal(choices.navigation.label, "Page Number");
});

test("unknown IDs produce schema errors", () => {
  const registry = getRegistry();
  const broken = JSON.parse(JSON.stringify(DEFAULT_THEME));
  broken.navigation.style = "not-a-navigation-style";
  const validation = validateTheme(broken, { registry });
  assert.equal(validation.ok, false);
  assert.deepEqual(validation.errors.map((error) => error.path), ["navigation.style"]);
});
```

- [ ] **Step 2: Run registry tests to verify failure**

Run:

```powershell
node --test tests/registry.test.js
```

Expected: FAIL with `Cannot find module '../registry/options'`.

- [ ] **Step 3: Implement registry metadata**

Create `registry/options.js`:

```js
const path = require("node:path");

const PALETTES = Object.freeze({
  "academic-blue": {
    id: "academic-blue",
    label: "Academic Blue",
    description: "Blue-white academic palette based on the Bamboo recipe.",
    colors: {
      background: "#FFFFFF",
      primary: "#456990",
      accent: "#57C3C2",
      text: "#000000",
      blockBody: "#D9EBEF",
      alert: "#CC2D18"
    }
  }
});

const FONTS = Object.freeze({
  palatino: {
    id: "palatino",
    label: "Palatino",
    mode: "serif-academic",
    cssFamily: "Palatino, 'Palatino Linotype', 'Book Antiqua', serif",
    latexPreamble: "\\usepackage{palatino}\\n\\usefonttheme{serif}",
    assets: []
  },
  neuton: {
    id: "neuton",
    label: "Neuton",
    mode: "serif-editorial",
    cssFamily: "Neuton, Georgia, serif",
    latexPreamble: "\\usepackage{fontspec}\\n\\setmainfont{Neuton-Regular.ttf}[Path=font/,BoldFont=Neuton-Bold.ttf,ItalicFont=Neuton-Italic.ttf]\\n\\usefonttheme{serif}",
    assets: [
      "elements/fonts/serif-neuton/fonts/Neuton-Regular.ttf",
      "elements/fonts/serif-neuton/fonts/Neuton-Bold.ttf",
      "elements/fonts/serif-neuton/fonts/Neuton-Italic.ttf"
    ]
  }
});

const BULLETS = Object.freeze({
  "pifont-outline": {
    id: "pifont-outline",
    label: "Pifont Outline",
    packageLine: "\\usepackage{pifont}",
    itemTemplate: "\\ding{109}",
    subitemTemplate: "\\ding{119}",
    cssMarker: "o"
  },
  triangle: {
    id: "triangle",
    label: "Triangle",
    packageLine: "",
    itemTemplate: "$\\blacktriangleright$",
    subitemTemplate: "$\\triangleright$",
    cssMarker: ">"
  }
});

const BLOCKS = Object.freeze({
  rounded: {
    id: "rounded",
    label: "Rounded",
    latexTemplate: "\\setbeamertemplate{blocks}[rounded][shadow=false]",
    cssRadius: "6px"
  }
});

const NAVIGATION = Object.freeze({
  "page-number": {
    id: "page-number",
    label: "Page Number",
    latexOuterTheme: "",
    hasHeader: false
  },
  "soft-miniframes": {
    id: "soft-miniframes",
    label: "Soft Miniframes",
    latexOuterTheme: "\\useoutertheme[subsection=false]{miniframes}",
    hasHeader: true
  }
});

const TITLE_PAGES = Object.freeze({
  "left-curtain": {
    id: "left-curtain",
    label: "Left Curtain",
    description: "Left-aligned title block with generous whitespace."
  }
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getRegistry() {
  return clone({
    palettes: PALETTES,
    fonts: FONTS,
    bullets: BULLETS,
    blocks: BLOCKS,
    navigation: NAVIGATION,
    titlePages: TITLE_PAGES
  });
}

function resolveThemeChoices(theme, registry = getRegistry()) {
  return {
    palette: registry.palettes[theme.colors.paletteId],
    bodyFont: registry.fonts[theme.fonts.body],
    titleFont: registry.fonts[theme.fonts.title],
    bullet: registry.bullets[theme.bullets.style],
    block: registry.blocks[theme.blocks.style],
    navigation: registry.navigation[theme.navigation.style],
    titlePage: registry.titlePages[theme.titlePage.layout]
  };
}

function resolveAssetPath(rootDir, assetPath) {
  return path.join(rootDir, assetPath);
}

module.exports = {
  getRegistry,
  resolveThemeChoices,
  resolveAssetPath
};
```

- [ ] **Step 4: Run registry tests**

Run:

```powershell
node --test tests/registry.test.js
```

Expected: PASS.

- [ ] **Step 5: Run schema tests again**

Run:

```powershell
node --test tests/schema.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add registry/options.js tests/registry.test.js
git commit -m "Add workbench option registry"
```

---

### Task 4: Add Pure LaTeX Generator

**Files:**
- Create: `generators/latex.js`
- Create: `tests/generator.test.js`

- [ ] **Step 1: Write failing generator tests**

Create `tests/generator.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_THEME } = require("../schema/theme-schema");
const { getRegistry } = require("../registry/options");
const { generateFiles, escapeLatex, aspectRatioOption } = require("../generators/latex");

test("escapes LaTeX-sensitive user text", () => {
  assert.equal(escapeLatex("A&B_50%"), "A\\&B\\_50\\%");
});

test("maps aspect ratios to Beamer class options", () => {
  assert.equal(aspectRatioOption("16:9"), "aspectratio=169");
  assert.equal(aspectRatioOption("4:3"), "aspectratio=43");
});

test("generates a complete Beamer file set", () => {
  const files = generateFiles(DEFAULT_THEME, getRegistry());
  assert.deepEqual(Object.keys(files).sort(), [
    "README.md",
    "content/figures.tex",
    "content/overview.tex",
    "content/tables.tex",
    "main.tex",
    "theme.cls",
    "theme.json"
  ]);
  assert.match(files["main.tex"], /\\documentclass\[10pt\]\{theme\}/);
  assert.match(files["theme.cls"], /\\definecolor\{bfPrimary\}\{HTML\}\{456990\}/);
  assert.match(files["theme.cls"], /\\setbeamertemplate\{itemize item\}\{\\ding\{109\}\}/);
  assert.match(files["README.md"], /Generated by BeamerForge/);
});
```

- [ ] **Step 2: Run generator tests to verify failure**

Run:

```powershell
node --test tests/generator.test.js
```

Expected: FAIL with `Cannot find module '../generators/latex'`.

- [ ] **Step 3: Implement the pure generator**

Create `generators/latex.js`:

```js
const { validateTheme } = require("../schema/theme-schema");
const { resolveThemeChoices } = require("../registry/options");

function escapeLatex(value) {
  return String(value)
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/&/g, "\\&")
    .replace(/%/g, "\\%")
    .replace(/\$/g, "\\$")
    .replace(/#/g, "\\#")
    .replace(/_/g, "\\_")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

function hexWithoutHash(value) {
  return String(value).replace(/^#/, "").toUpperCase();
}

function aspectRatioOption(value) {
  return value === "4:3" ? "aspectratio=43" : "aspectratio=169";
}

function generateMainTex(theme) {
  return [
    "\\documentclass[10pt]{theme}",
    "",
    `\\title[]{${escapeLatex(theme.identity.title)}}`,
    `\\subtitle[]{${escapeLatex(theme.identity.subtitle)}}`,
    `\\author[]{${escapeLatex(theme.identity.author)}}`,
    `\\institute[]{${escapeLatex(theme.identity.institute)}}`,
    `\\date[]{${theme.identity.date === "\\today" ? "\\today" : escapeLatex(theme.identity.date)}}`,
    "",
    "\\begin{document}",
    "",
    "\\begin{frame}[plain]",
    "  \\titlepage",
    "\\end{frame}",
    "",
    "\\input{content/overview}",
    "\\input{content/figures}",
    "\\input{content/tables}",
    "",
    "\\end{document}",
    ""
  ].join("\n");
}

function generateFootlineTex(navigationStyle) {
  if (navigationStyle === "soft-miniframes") {
    return [
      "\\setbeamercolor{section in head/foot}{bg=white, fg=bfPrimary!45}",
      "\\setbeamercolor{subsection in head/foot}{bg=white, fg=bfPrimary!45}",
      "\\setbeamerfont{section in head/foot}{size=\\fontsize{5.5pt}{6.4pt}\\selectfont,series=\\bfseries}",
      "\\setbeamerfont{subsection in head/foot}{size=\\fontsize{5.5pt}{6.4pt}\\selectfont,series=\\bfseries}",
      "\\useoutertheme[subsection=false]{miniframes}",
      "\\makeatletter",
      "\\beamer@compressfalse",
      "\\setbeamertemplate{mini frame}{\\tikz[baseline=-0.55ex]{\\draw[bfPrimary!38,line width=0.32pt] (0,0) circle[radius=0.045cm];}}",
      "\\setbeamertemplate{mini frame in current subsection}{\\tikz[baseline=-0.55ex]{\\filldraw[bfPrimary!58,draw=bfPrimary!58,line width=0.32pt] (0,0) circle[radius=0.045cm];}}",
      "\\setbeamertemplate{mini frame in other subsection}{\\tikz[baseline=-0.55ex]{\\draw[bfPrimary!28,line width=0.32pt] (0,0) circle[radius=0.045cm];}}",
      "\\makeatother",
      "\\setbeamertemplate{footline}{%",
      "  \\leavevmode\\hbox{%",
      "    \\begin{beamercolorbox}[wd=\\paperwidth,ht=2ex,dp=1ex,rightskip=1em]{author in head/foot}%",
      "      \\hfill{\\itshape\\scriptsize \\insertframenumber\\,/\\,\\inserttotalframenumber}",
      "    \\end{beamercolorbox}%",
      "  }%",
      "}"
    ].join("\n");
  }

  return [
    "\\setbeamertemplate{footline}{%",
    "  \\leavevmode\\hbox{%",
    "    \\begin{beamercolorbox}[wd=\\paperwidth,ht=2ex,dp=1ex,rightskip=1em]{author in head/foot}%",
    "      \\hfill{\\itshape\\scriptsize \\insertframenumber\\,/\\,\\inserttotalframenumber}",
    "    \\end{beamercolorbox}%",
    "  }%",
    "}"
  ].join("\n");
}

function generateClassTex(theme, registry) {
  const choices = resolveThemeChoices(theme, registry);
  const colors = theme.colors;
  const bulletPackage = choices.bullet.packageLine ? `${choices.bullet.packageLine}\n` : "";

  return [
    "\\NeedsTeXFormat{LaTeX2e}",
    "\\ProvidesClass{theme}[2026/06/26 generated BeamerForge theme]",
    `\\LoadClass[compress,10pt,${aspectRatioOption(theme.foundation.aspectRatio)}]{beamer}`,
    "",
    "\\usepackage[english]{babel}",
    "\\usepackage[T1]{fontenc}",
    "\\usepackage{graphicx}",
    "\\usepackage{booktabs}",
    "\\usepackage{tikz}",
    "\\usepackage{hyperref}",
    "\\usepackage{microtype}",
    "\\usepackage{amsmath,amssymb}",
    bulletPackage.trimEnd(),
    choices.bodyFont.latexPreamble,
    "",
    `\\definecolor{bfBackground}{HTML}{${hexWithoutHash(colors.background)}}`,
    `\\definecolor{bfPrimary}{HTML}{${hexWithoutHash(colors.primary)}}`,
    `\\definecolor{bfAccent}{HTML}{${hexWithoutHash(colors.accent)}}`,
    `\\definecolor{bfText}{HTML}{${hexWithoutHash(colors.text)}}`,
    `\\definecolor{bfBlockBody}{HTML}{${hexWithoutHash(colors.blockBody || "#D9EBEF")}}`,
    `\\definecolor{bfAlert}{HTML}{${hexWithoutHash(colors.alert || "#CC2D18")}}`,
    "",
    "\\setbeamertemplate{navigation symbols}{}",
    "\\setbeamertemplate{frametitle continuation}{}",
    "\\setbeamercolor*{normal text}{fg=bfText,bg=bfBackground}",
    "\\setbeamercolor*{structure}{fg=bfPrimary}",
    "\\setbeamercolor{titlelike}{fg=bfPrimary,bg=bfBackground}",
    "\\setbeamercolor{frametitle}{fg=bfPrimary,bg=bfBackground}",
    "\\setbeamercolor{itemize item}{fg=bfPrimary}",
    "\\setbeamercolor{itemize subitem}{fg=bfAccent}",
    "\\setbeamercolor*{block title}{fg=white,bg=bfPrimary}",
    "\\setbeamercolor*{block body}{fg=bfText,bg=bfBlockBody}",
    "\\setbeamercolor*{block title alerted}{fg=white,bg=bfAlert}",
    "\\setbeamercolor*{block body alerted}{fg=bfText,bg=bfBlockBody}",
    choices.block.latexTemplate,
    "",
    `\\setbeamertemplate{itemize item}{${choices.bullet.itemTemplate}}`,
    `\\setbeamertemplate{itemize subitem}{${choices.bullet.subitemTemplate}}`,
    "\\setlength{\\parskip}{0pt}",
    "\\setbeamerfont{title}{size=\\fontsize{18pt}{30pt}\\selectfont,series=\\bfseries}",
    "\\setbeamerfont{subtitle}{size=\\fontsize{10pt}{16pt}\\selectfont}",
    "\\setbeamerfont{author}{size=\\fontsize{10pt}{18pt}\\selectfont}",
    "\\setbeamerfont{institute}{size=\\fontsize{10pt}{18pt}\\selectfont}",
    "\\setbeamerfont{date}{size=\\fontsize{9pt}{16pt}\\selectfont}",
    "\\setbeamerfont{frametitle}{size=\\fontsize{14pt}{18pt}\\selectfont,series=\\bfseries}",
    "",
    "\\setbeamertemplate{title page}{%",
    "  \\vspace*{0.18\\paperheight}",
    "  \\begin{minipage}{0.68\\paperwidth}",
    "    {\\usebeamerfont{title}\\usebeamercolor[fg]{title}\\inserttitle\\par}",
    "    \\vspace{0.35cm}",
    "    {\\usebeamerfont{subtitle}\\insertsubtitle\\par}",
    "    \\vspace{0.55cm}",
    "    {\\usebeamerfont{author}\\insertauthor\\par}",
    "    {\\usebeamerfont{institute}\\insertinstitute\\par}",
    "    \\vspace{0.18cm}",
    "    {\\usebeamerfont{date}\\insertdate\\par}",
    "  \\end{minipage}",
    "}",
    "",
    generateFootlineTex(theme.navigation.style),
    ""
  ].filter((line) => line !== "").join("\n");
}

function generateOverviewTex(theme) {
  const bullets = theme.contentDefaults.sampleBullets
    .map((bullet) => `  \\item ${escapeLatex(bullet)}`)
    .join("\n");

  return [
    "\\section{Overview}",
    `\\begin{frame}{${escapeLatex(theme.contentDefaults.sampleTitle)}}`,
    "\\begin{itemize}",
    bullets,
    "\\end{itemize}",
    "\\end{frame}",
    ""
  ].join("\n");
}

function generateFiguresTex() {
  return [
    "\\section{Figures}",
    "\\begin{frame}{Figures remain centered and readable}",
    "\\begin{figure}",
    "  \\centering",
    "  \\fbox{\\parbox{0.72\\textwidth}{\\centering\\vspace{1.6cm}Figure Placeholder\\vspace{1.6cm}}}",
    "\\end{figure}",
    "\\end{frame}",
    ""
  ].join("\n");
}

function generateTablesTex() {
  return [
    "\\section{Tables}",
    "\\begin{frame}{Tables show only the essential comparison}",
    "\\begin{table}",
    "  \\centering",
    "  \\begin{tabular}{lcc}",
    "    \\toprule",
    "    Outcome & Estimate & Baseline \\\\",
    "    \\midrule",
    "    Main outcome & 5.4 & 68.3 \\\\",
    "    \\bottomrule",
    "  \\end{tabular}",
    "\\end{table}",
    "\\end{frame}",
    ""
  ].join("\n");
}

function generateReadme(theme) {
  return [
    `# ${theme.identity.name}`,
    "",
    "Generated by BeamerForge.",
    "",
    "## Compile",
    "",
    "```bash",
    "latexmk -xelatex -interaction=nonstopmode main.tex",
    "```",
    "",
    "If `latexmk` is unavailable, run `xelatex main.tex` twice.",
    ""
  ].join("\n");
}

function generateFiles(theme, registry) {
  const validation = validateTheme(theme, { registry });
  if (!validation.ok) {
    const message = validation.errors.map((error) => `${error.path}: ${error.message}`).join("; ");
    throw new Error(`Invalid theme: ${message}`);
  }

  return {
    "main.tex": generateMainTex(theme),
    "theme.cls": generateClassTex(theme, registry),
    "theme.json": `${JSON.stringify(theme, null, 2)}\n`,
    "README.md": generateReadme(theme),
    "content/overview.tex": generateOverviewTex(theme),
    "content/figures.tex": generateFiguresTex(),
    "content/tables.tex": generateTablesTex()
  };
}

module.exports = {
  escapeLatex,
  aspectRatioOption,
  generateMainTex,
  generateClassTex,
  generateFiles
};
```

- [ ] **Step 4: Run generator tests**

Run:

```powershell
node --test tests/generator.test.js
```

Expected: PASS.

- [ ] **Step 5: Run syntax check**

Run:

```powershell
npm run check
```

Expected: PASS for files that exist. If `npm run check` fails because later files in the script do not exist yet, run this narrower command and expect PASS:

```powershell
node --check schema/theme-schema.js; node --check registry/options.js; node --check generators/latex.js
```

- [ ] **Step 6: Commit**

Run:

```powershell
git add generators/latex.js tests/generator.test.js
git commit -m "Add Beamer file generator"
```

---

### Task 5: Add Project Writer And CLI

**Files:**
- Create: `generators/project-writer.js`
- Create: `generators/cli.js`
- Create: `tests/project-writer.test.js`

- [ ] **Step 1: Write failing project writer tests**

Create `tests/project-writer.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DEFAULT_THEME } = require("../schema/theme-schema");
const { getRegistry } = require("../registry/options");
const { writeTemplateProject } = require("../generators/project-writer");

test("writes a complete template project", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "beamerforge-project-"));
  const outDir = path.join(root, "blue-academic");
  const manifest = writeTemplateProject(DEFAULT_THEME, outDir, {
    registry: getRegistry(),
    rootDir: process.cwd()
  });

  assert.equal(manifest.templateDir, outDir);
  assert.equal(fs.existsSync(path.join(outDir, "main.tex")), true);
  assert.equal(fs.existsSync(path.join(outDir, "theme.cls")), true);
  assert.equal(fs.existsSync(path.join(outDir, "theme.json")), true);
  assert.equal(fs.existsSync(path.join(outDir, "content", "overview.tex")), true);
});

test("copies font assets when a font declares assets", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "beamerforge-font-"));
  const outDir = path.join(root, "neuton-template");
  const theme = JSON.parse(JSON.stringify(DEFAULT_THEME));
  theme.identity.name = "neuton-template";
  theme.fonts.body = "neuton";
  theme.fonts.title = "neuton";

  writeTemplateProject(theme, outDir, {
    registry: getRegistry(),
    rootDir: process.cwd()
  });

  assert.equal(fs.existsSync(path.join(outDir, "font", "Neuton-Regular.ttf")), true);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
node --test tests/project-writer.test.js
```

Expected: FAIL with `Cannot find module '../generators/project-writer'`.

- [ ] **Step 3: Implement the project writer**

Create `generators/project-writer.js`:

```js
const fs = require("node:fs");
const path = require("node:path");
const { validateTheme } = require("../schema/theme-schema");
const { generateFiles } = require("./latex");
const { resolveThemeChoices, resolveAssetPath } = require("../registry/options");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeTextFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
}

function copyFontAssets(theme, templateDir, registry, rootDir) {
  const choices = resolveThemeChoices(theme, registry);
  const assets = new Set([
    ...choices.bodyFont.assets,
    ...choices.titleFont.assets
  ]);

  if (assets.size === 0) return [];

  const copied = [];
  const fontDir = path.join(templateDir, "font");
  ensureDir(fontDir);

  for (const asset of assets) {
    const source = resolveAssetPath(rootDir, asset);
    const target = path.join(fontDir, path.basename(asset));
    fs.copyFileSync(source, target);
    copied.push(target);
  }

  return copied;
}

function writeTemplateProject(theme, templateDir, options = {}) {
  const registry = options.registry;
  const rootDir = options.rootDir || process.cwd();
  const validation = validateTheme(theme, { registry });
  if (!validation.ok) {
    const message = validation.errors.map((error) => `${error.path}: ${error.message}`).join("; ");
    throw new Error(`Invalid theme: ${message}`);
  }

  ensureDir(templateDir);
  const files = generateFiles(theme, registry);
  const written = [];

  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(templateDir, relativePath);
    writeTextFile(absolutePath, content);
    written.push(absolutePath);
  }

  const copiedAssets = copyFontAssets(theme, templateDir, registry, rootDir);

  return {
    templateDir,
    written,
    copiedAssets
  };
}

module.exports = {
  writeTemplateProject
};
```

- [ ] **Step 4: Implement the CLI**

Create `generators/cli.js`:

```js
const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_THEME } = require("../schema/theme-schema");
const { getRegistry } = require("../registry/options");
const { writeTemplateProject } = require("./project-writer");

function parseArgs(argv) {
  const args = { theme: null, out: null };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--theme") {
      args.theme = argv[i + 1];
      i += 1;
    } else if (arg === "--out") {
      args.out = argv[i + 1];
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function readTheme(themePath) {
  if (!themePath) return DEFAULT_THEME;
  return JSON.parse(fs.readFileSync(themePath, "utf8"));
}

function main(argv = process.argv) {
  const args = parseArgs(argv);
  const theme = readTheme(args.theme);
  const outDir = path.resolve(args.out || path.join("templates", theme.identity.name));
  const manifest = writeTemplateProject(theme, outDir, {
    registry: getRegistry(),
    rootDir: process.cwd()
  });
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (require.main === module) {
  try {
    main(process.argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}

module.exports = {
  parseArgs,
  main
};
```

- [ ] **Step 5: Run project writer tests**

Run:

```powershell
node --test tests/project-writer.test.js
```

Expected: PASS.

- [ ] **Step 6: Generate a local template**

Run:

```powershell
npm run generate -- --out templates/generated
```

Expected: PASS and printed JSON with `"templateDir"` ending in `templates/generated`.

- [ ] **Step 7: Commit**

Run:

```powershell
git add generators/project-writer.js generators/cli.js tests/project-writer.test.js templates/generated/main.tex templates/generated/theme.cls templates/generated/theme.json templates/generated/README.md templates/generated/content/overview.tex templates/generated/content/figures.tex templates/generated/content/tables.tex
git commit -m "Add template project writer"
```

---

### Task 6: Add Compile Service

**Files:**
- Create: `workbench/build.js`
- Create: `workbench/smoke-compile.js`
- Create: `tests/build.test.js`

- [ ] **Step 1: Write failing build tests**

Create `tests/build.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { findCompiler, extractLatexExcerpt, compileTemplate } = require("../workbench/build");

test("findCompiler returns missing when no compiler command succeeds", () => {
  const fakeSpawn = () => ({ status: 1, error: new Error("missing") });
  const result = findCompiler(fakeSpawn);
  assert.equal(result.kind, "missing");
});

test("findCompiler prefers latexmk when available", () => {
  const fakeSpawn = (command) => ({ status: command === "latexmk" ? 0 : 1 });
  const result = findCompiler(fakeSpawn);
  assert.equal(result.kind, "latexmk");
  assert.equal(result.command, "latexmk");
});

test("extractLatexExcerpt returns useful error lines", () => {
  const excerpt = extractLatexExcerpt("line one\n! Undefined control sequence.\nl.12 bad macro\nmore text");
  assert.match(excerpt, /Undefined control sequence/);
  assert.match(excerpt, /l\.12/);
});

test("compileTemplate reports missing compiler", () => {
  const result = compileTemplate("C:/no-project", {
    spawnSync: () => ({ status: 1, error: new Error("missing") })
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "missing-compiler");
  assert.match(result.message, /Install TeX Live, MiKTeX, or another XeLaTeX distribution/);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
node --test tests/build.test.js
```

Expected: FAIL with `Cannot find module '../workbench/build'`.

- [ ] **Step 3: Implement build helpers**

Create `workbench/build.js`:

```js
const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

function findCompiler(spawnSync = childProcess.spawnSync) {
  const latexmk = spawnSync("latexmk", ["--version"], { encoding: "utf8", stdio: "pipe" });
  if (latexmk.status === 0) return { kind: "latexmk", command: "latexmk" };

  const xelatex = spawnSync("xelatex", ["--version"], { encoding: "utf8", stdio: "pipe" });
  if (xelatex.status === 0) return { kind: "xelatex", command: "xelatex" };

  return { kind: "missing", command: null };
}

function extractLatexExcerpt(logText) {
  const lines = String(logText || "").split(/\r?\n/);
  const index = lines.findIndex((line) => line.startsWith("!") || /Emergency stop|Fatal error|Undefined control sequence/i.test(line));
  if (index === -1) return lines.slice(-20).join("\n").trim();
  return lines.slice(Math.max(0, index - 2), Math.min(lines.length, index + 8)).join("\n").trim();
}

function compilerArgs(kind) {
  if (kind === "latexmk") {
    return ["-xelatex", "-interaction=nonstopmode", "main.tex"];
  }
  return ["-interaction=nonstopmode", "main.tex"];
}

function compileTemplate(templateDir, options = {}) {
  const spawnSync = options.spawnSync || childProcess.spawnSync;
  const compiler = options.compiler || findCompiler(spawnSync);

  if (compiler.kind === "missing") {
    return {
      ok: false,
      status: "missing-compiler",
      message: "Install TeX Live, MiKTeX, or another XeLaTeX distribution with latexmk or xelatex available on PATH.",
      logPath: null,
      excerpt: ""
    };
  }

  const args = compilerArgs(compiler.kind);
  const run = spawnSync(compiler.command, args, {
    cwd: templateDir,
    encoding: "utf8",
    stdio: "pipe"
  });
  const stdout = run.stdout || "";
  const stderr = run.stderr || "";
  const combined = `${stdout}\n${stderr}`;
  const logPath = path.join(templateDir, "workbench-build.log");
  fs.writeFileSync(logPath, combined, "utf8");

  const pdfPath = path.join(templateDir, "main.pdf");
  const ok = run.status === 0 && fs.existsSync(pdfPath);
  return {
    ok,
    status: ok ? "compiled" : "compile-failed",
    command: `${compiler.command} ${args.join(" ")}`,
    exitCode: run.status,
    pdfPath: ok ? pdfPath : null,
    logPath,
    excerpt: ok ? "" : extractLatexExcerpt(combined)
  };
}

module.exports = {
  findCompiler,
  extractLatexExcerpt,
  compileTemplate
};
```

- [ ] **Step 4: Implement compile smoke script**

Create `workbench/smoke-compile.js`:

```js
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DEFAULT_THEME } = require("../schema/theme-schema");
const { getRegistry } = require("../registry/options");
const { writeTemplateProject } = require("../generators/project-writer");
const { compileTemplate } = require("./build");

function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "beamerforge-smoke-"));
  writeTemplateProject(DEFAULT_THEME, dir, {
    registry: getRegistry(),
    rootDir: process.cwd()
  });
  const result = compileTemplate(dir);
  process.stdout.write(`${JSON.stringify({ templateDir: dir, ...result }, null, 2)}\n`);
  if (!result.ok) {
    process.exit(result.status === "missing-compiler" ? 2 : 1);
  }
}

if (require.main === module) {
  main();
}
```

- [ ] **Step 5: Run build tests**

Run:

```powershell
node --test tests/build.test.js
```

Expected: PASS.

- [ ] **Step 6: Run compile smoke**

Run:

```powershell
npm run smoke:compile
```

Expected when XeLaTeX or `latexmk` is installed: exit code 0 and JSON containing `"status": "compiled"`.

Expected when no compiler is installed: exit code 2 and JSON containing `"status": "missing-compiler"`. In that case, install or expose a XeLaTeX distribution before accepting the implementation as complete.

- [ ] **Step 7: Commit**

Run:

```powershell
git add workbench/build.js workbench/smoke-compile.js tests/build.test.js
git commit -m "Add Beamer compile service"
```

---

### Task 7: Add Local Workbench Server API

**Files:**
- Create: `workbench/server.js`
- Create: `tests/server.test.js`

- [ ] **Step 1: Write failing server tests**

Create `tests/server.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createWorkbenchServer } = require("../workbench/server");
const { DEFAULT_THEME } = require("../schema/theme-schema");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

test("server exposes registry options and current theme", async (t) => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "beamerforge-server-"));
  const server = createWorkbenchServer({ rootDir: process.cwd(), stateDir });
  t.after(() => server.close());
  const port = await listen(server);

  const options = await fetch(`http://127.0.0.1:${port}/api/options`).then((response) => response.json());
  assert.equal(options.palettes["academic-blue"].label, "Academic Blue");

  const theme = await fetch(`http://127.0.0.1:${port}/api/theme`).then((response) => response.json());
  assert.equal(theme.identity.name, DEFAULT_THEME.identity.name);
});

test("server validates and persists theme updates", async (t) => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "beamerforge-server-"));
  const server = createWorkbenchServer({ rootDir: process.cwd(), stateDir });
  t.after(() => server.close());
  const port = await listen(server);

  const next = JSON.parse(JSON.stringify(DEFAULT_THEME));
  next.identity.name = "server-theme";
  const response = await fetch(`http://127.0.0.1:${port}/api/theme`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(next)
  });
  assert.equal(response.status, 200);

  const saved = await fetch(`http://127.0.0.1:${port}/api/theme`).then((item) => item.json());
  assert.equal(saved.identity.name, "server-theme");
});

test("server generates a template from current theme", async (t) => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "beamerforge-server-"));
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "beamerforge-output-"));
  const server = createWorkbenchServer({ rootDir: process.cwd(), stateDir, outputRoot: outputDir });
  t.after(() => server.close());
  const port = await listen(server);

  const response = await fetch(`http://127.0.0.1:${port}/api/generate`, { method: "POST" });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(fs.existsSync(path.join(body.templateDir, "main.tex")), true);
});
```

- [ ] **Step 2: Run server tests to verify failure**

Run:

```powershell
node --test tests/server.test.js
```

Expected: FAIL with `Cannot find module '../workbench/server'`.

- [ ] **Step 3: Implement server API**

Create `workbench/server.js` with these required behaviors:

```js
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_THEME, validateTheme } = require("../schema/theme-schema");
const { getRegistry } = require("../registry/options");
const { writeTemplateProject } = require("../generators/project-writer");
const { compileTemplate } = require("./build");

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) reject(new Error("Request body too large"));
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error("Invalid JSON request body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

function sendText(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, { "content-type": contentType });
  res.end(body);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function themePath(stateDir) {
  return path.join(stateDir, "theme.json");
}

function buildStatusPath(stateDir) {
  return path.join(stateDir, "build-status.json");
}

function readTheme(stateDir) {
  const file = themePath(stateDir);
  if (!fs.existsSync(file)) return DEFAULT_THEME;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeTheme(stateDir, theme) {
  ensureDir(stateDir);
  fs.writeFileSync(themePath(stateDir), `${JSON.stringify(theme, null, 2)}\n`, "utf8");
}

function writeBuildStatus(stateDir, status) {
  ensureDir(stateDir);
  fs.writeFileSync(buildStatusPath(stateDir), `${JSON.stringify(status, null, 2)}\n`, "utf8");
}

function readBuildStatus(stateDir) {
  const file = buildStatusPath(stateDir);
  if (!fs.existsSync(file)) return { status: "idle" };
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function contentTypeFor(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "text/plain; charset=utf-8";
}

function serveStatic(req, res, publicDir) {
  const url = new URL(req.url, "http://localhost");
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.join(publicDir, pathname.replace(/^\/+/, ""));
  if (!filePath.startsWith(publicDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    sendText(res, 404, "Not found");
    return;
  }
  sendText(res, 200, fs.readFileSync(filePath), contentTypeFor(filePath));
}

function createWorkbenchServer(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const stateDir = options.stateDir || path.join(rootDir, "workbench", "state");
  const outputRoot = options.outputRoot || path.join(rootDir, "templates");
  const publicDir = options.publicDir || path.join(rootDir, "workbench", "public");
  const registry = getRegistry();

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    try {
      if (req.method === "GET" && url.pathname === "/api/options") {
        sendJson(res, 200, registry);
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/theme") {
        sendJson(res, 200, readTheme(stateDir));
        return;
      }

      if (req.method === "PUT" && url.pathname === "/api/theme") {
        const theme = await readJsonBody(req);
        const validation = validateTheme(theme, { registry });
        if (!validation.ok) {
          sendJson(res, 400, { ok: false, errors: validation.errors });
          return;
        }
        writeTheme(stateDir, theme);
        sendJson(res, 200, { ok: true, theme });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/generate") {
        const theme = readTheme(stateDir);
        const templateDir = path.join(outputRoot, theme.identity.name);
        const manifest = writeTemplateProject(theme, templateDir, { registry, rootDir });
        const status = { status: "generated", templateDir, written: manifest.written };
        writeBuildStatus(stateDir, status);
        sendJson(res, 200, status);
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/compile") {
        const theme = readTheme(stateDir);
        const templateDir = path.join(outputRoot, theme.identity.name);
        if (!fs.existsSync(path.join(templateDir, "main.tex"))) {
          writeTemplateProject(theme, templateDir, { registry, rootDir });
        }
        const result = compileTemplate(templateDir);
        writeBuildStatus(stateDir, result);
        sendJson(res, result.ok ? 200 : 500, result);
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/build-status") {
        sendJson(res, 200, readBuildStatus(stateDir));
        return;
      }

      if (req.method === "GET") {
        serveStatic(req, res, publicDir);
        return;
      }

      sendText(res, 405, "Method not allowed");
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message });
    }
  });
}

function main() {
  const port = Number(process.env.PORT || 5177);
  const server = createWorkbenchServer();
  server.listen(port, "127.0.0.1", () => {
    process.stdout.write(`BeamerForge workbench running at http://localhost:${port}\n`);
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  createWorkbenchServer
};
```

- [ ] **Step 4: Run server tests**

Run:

```powershell
node --test tests/server.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add workbench/server.js tests/server.test.js
git commit -m "Add local workbench API server"
```

---

### Task 8: Add Browser Workbench UI

**Files:**
- Create: `workbench/public/index.html`
- Create: `workbench/public/styles.css`
- Create: `workbench/public/app.js`

- [ ] **Step 1: Create the HTML shell**

Create `workbench/public/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>BeamerForge Workbench</title>
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body>
    <main class="app">
      <aside class="panel controls">
        <header>
          <p class="eyebrow">BeamerForge</p>
          <h1>Template Workbench</h1>
        </header>

        <label>
          Palette
          <select id="palette"></select>
        </label>
        <label>
          Body Font
          <select id="bodyFont"></select>
        </label>
        <label>
          Bullet Style
          <select id="bulletStyle"></select>
        </label>
        <label>
          Navigation
          <select id="navigationStyle"></select>
        </label>
        <label>
          Template Name
          <input id="templateName" type="text" spellcheck="false">
        </label>
      </aside>

      <section class="preview-zone">
        <div class="preview-toolbar">
          <div>
            <p class="eyebrow">HTML Preview</p>
            <h2 id="previewHeading">Live slide approximation</h2>
          </div>
          <span id="saveStatus" class="status">Idle</span>
        </div>
        <article id="slidePreview" class="slide-preview"></article>
      </section>

      <aside class="panel output">
        <button id="saveTheme">Save theme.json</button>
        <button id="generateTheme">Generate .tex/.cls</button>
        <button id="compileTheme">Compile PDF</button>
        <pre id="buildStatus">No build yet.</pre>
      </aside>
    </main>
    <script src="/app.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Create the CSS**

Create `workbench/public/styles.css`:

```css
:root {
  color-scheme: light;
  font-family: Inter, Arial, sans-serif;
  background: #eef2f5;
  color: #172033;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

.app {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 280px minmax(520px, 1fr) 240px;
  gap: 16px;
  padding: 16px;
}

.panel,
.preview-zone {
  background: #ffffff;
  border: 1px solid #d8dee8;
  border-radius: 8px;
}

.panel {
  padding: 16px;
}

.controls {
  display: grid;
  align-content: start;
  gap: 14px;
}

.output {
  display: grid;
  align-content: start;
  gap: 10px;
}

.eyebrow {
  margin: 0 0 4px;
  color: #64748b;
  font-size: 12px;
  text-transform: uppercase;
}

h1,
h2 {
  margin: 0;
}

h1 {
  font-size: 22px;
}

h2 {
  font-size: 20px;
}

label {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: #334155;
}

select,
input,
button {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 9px 10px;
  font: inherit;
}

button {
  background: #1f4b7a;
  color: white;
  border-color: #1f4b7a;
  cursor: pointer;
}

button:nth-of-type(2) {
  background: #0f766e;
  border-color: #0f766e;
}

button:nth-of-type(3) {
  background: #b45309;
  border-color: #b45309;
}

.preview-zone {
  padding: 18px;
}

.preview-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
}

.status {
  padding: 4px 8px;
  border-radius: 999px;
  background: #e2e8f0;
  color: #334155;
  font-size: 12px;
}

.slide-preview {
  aspect-ratio: 16 / 9;
  border-radius: 6px;
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.18);
  padding: 6.5%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.slide-title {
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 7%;
}

.slide-preview ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 14px;
  font-size: 18px;
}

.slide-preview li::before {
  content: var(--bullet-marker, "o");
  color: var(--accent-color, #57c3c2);
  display: inline-block;
  width: 1.5em;
}

.slide-footline {
  margin-top: auto;
  border-top: 3px solid currentColor;
  padding-top: 8px;
  font-size: 12px;
  display: flex;
  justify-content: flex-end;
}

.mini-header {
  height: 10px;
  display: flex;
  gap: 7px;
  margin-bottom: 16px;
}

.mini-header span {
  width: 8px;
  height: 8px;
  border: 1px solid currentColor;
  border-radius: 999px;
}

pre {
  white-space: pre-wrap;
  min-height: 120px;
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 6px;
  padding: 10px;
  font-size: 12px;
}
```

- [ ] **Step 3: Create the browser logic**

Create `workbench/public/app.js`:

```js
const state = {
  registry: null,
  theme: null
};

const elements = {
  palette: document.getElementById("palette"),
  bodyFont: document.getElementById("bodyFont"),
  bulletStyle: document.getElementById("bulletStyle"),
  navigationStyle: document.getElementById("navigationStyle"),
  templateName: document.getElementById("templateName"),
  preview: document.getElementById("slidePreview"),
  saveStatus: document.getElementById("saveStatus"),
  buildStatus: document.getElementById("buildStatus"),
  saveTheme: document.getElementById("saveTheme"),
  generateTheme: document.getElementById("generateTheme"),
  compileTheme: document.getElementById("compileTheme")
};

function optionList(select, collection, selectedId) {
  select.innerHTML = "";
  for (const item of Object.values(collection)) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.label;
    option.selected = item.id === selectedId;
    select.appendChild(option);
  }
}

async function api(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) {
    const message = body.errors ? body.errors.map((error) => `${error.path}: ${error.message}`).join("\n") : body.error;
    throw new Error(message || `Request failed: ${response.status}`);
  }
  return body;
}

function applyPalette(theme, palette) {
  theme.colors.paletteId = palette.id;
  Object.assign(theme.colors, palette.colors);
}

function syncThemeFromControls() {
  const theme = state.theme;
  const palette = state.registry.palettes[elements.palette.value];
  applyPalette(theme, palette);
  theme.fonts.body = elements.bodyFont.value;
  theme.fonts.title = elements.bodyFont.value;
  theme.fonts.mode = state.registry.fonts[elements.bodyFont.value].mode;
  theme.bullets.style = elements.bulletStyle.value;
  theme.navigation.style = elements.navigationStyle.value;
  theme.identity.name = elements.templateName.value.trim() || "blue-academic";
}

function renderControls() {
  const registry = state.registry;
  const theme = state.theme;
  optionList(elements.palette, registry.palettes, theme.colors.paletteId);
  optionList(elements.bodyFont, registry.fonts, theme.fonts.body);
  optionList(elements.bulletStyle, registry.bullets, theme.bullets.style);
  optionList(elements.navigationStyle, registry.navigation, theme.navigation.style);
  elements.templateName.value = theme.identity.name;
}

function renderPreview() {
  const theme = state.theme;
  const registry = state.registry;
  const bullet = registry.bullets[theme.bullets.style];
  const font = registry.fonts[theme.fonts.body];
  const hasHeader = registry.navigation[theme.navigation.style].hasHeader;
  const bullets = theme.contentDefaults.sampleBullets.map((item) => `<li>${item}</li>`).join("");
  const header = hasHeader ? "<div class=\"mini-header\"><span></span><span></span><span></span><span></span></div>" : "";

  elements.preview.style.background = theme.colors.background;
  elements.preview.style.color = theme.colors.text;
  elements.preview.style.fontFamily = font.cssFamily;
  elements.preview.style.setProperty("--bullet-marker", `"${bullet.cssMarker}"`);
  elements.preview.style.setProperty("--accent-color", theme.colors.accent);
  elements.preview.innerHTML = `
    ${header}
    <div class="slide-title" style="color:${theme.colors.primary}">${theme.contentDefaults.sampleTitle}</div>
    <ul>${bullets}</ul>
    <div class="slide-footline" style="color:${theme.colors.primary}">1 / 3</div>
  `;
}

function render() {
  renderControls();
  renderPreview();
}

async function saveTheme() {
  syncThemeFromControls();
  await api("/api/theme", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(state.theme)
  });
  elements.saveStatus.textContent = "Saved";
}

async function generateTheme() {
  await saveTheme();
  const result = await api("/api/generate", { method: "POST" });
  elements.buildStatus.textContent = JSON.stringify(result, null, 2);
}

async function compileTheme() {
  await saveTheme();
  const result = await api("/api/compile", { method: "POST" });
  elements.buildStatus.textContent = JSON.stringify(result, null, 2);
}

function bindControls() {
  for (const control of [elements.palette, elements.bodyFont, elements.bulletStyle, elements.navigationStyle, elements.templateName]) {
    control.addEventListener("input", () => {
      syncThemeFromControls();
      renderPreview();
      elements.saveStatus.textContent = "Unsaved";
    });
  }
  elements.saveTheme.addEventListener("click", () => saveTheme().catch((error) => elements.buildStatus.textContent = error.message));
  elements.generateTheme.addEventListener("click", () => generateTheme().catch((error) => elements.buildStatus.textContent = error.message));
  elements.compileTheme.addEventListener("click", () => compileTheme().catch((error) => elements.buildStatus.textContent = error.message));
}

async function boot() {
  state.registry = await api("/api/options");
  state.theme = await api("/api/theme");
  render();
  bindControls();
}

boot().catch((error) => {
  elements.buildStatus.textContent = error.message;
});
```

- [ ] **Step 4: Run browser script syntax check**

Run:

```powershell
node --check workbench/public/app.js
```

Expected: PASS.

- [ ] **Step 5: Start the workbench server**

Run:

```powershell
npm start
```

Expected: terminal prints `BeamerForge workbench running at http://localhost:5177`.

Open `http://localhost:5177` and verify:

- Changing palette/font/bullet/navigation updates the slide preview.
- Save writes `workbench/state/theme.json`.
- Generate creates `templates/<theme-name>/main.tex`.
- Compile reports either `compiled` or `missing-compiler`.

- [ ] **Step 6: Commit**

Run:

```powershell
git add workbench/public/index.html workbench/public/styles.css workbench/public/app.js
git commit -m "Add browser workbench UI"
```

---

### Task 9: Add README Instructions And Final Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add README workbench section**

Add this section after the existing workflow overview in `README.md`:

````markdown
## HTML Workbench

The local HTML workbench lets you design a Beamer template through browser controls while keeping `theme.json` as the source of truth.

```bash
npm test
npm start
```

Open `http://localhost:5177`.

The workbench can:

- Edit palette, font, bullet style, navigation, and template name.
- Show an immediate HTML slide preview.
- Save `workbench/state/theme.json`.
- Generate a complete Beamer project under `templates/<name>/`.
- Run a local XeLaTeX/latexmk compile when a LaTeX distribution is installed.

To generate without the browser:

```bash
npm run generate -- --out templates/generated
```

To run the compile smoke test:

```bash
npm run smoke:compile
```
````

- [ ] **Step 2: Run the full unit test suite**

Run:

```powershell
npm test
```

Expected: PASS for scaffold, schema, registry, generator, project writer, build, and server tests.

- [ ] **Step 3: Run syntax checks**

Run:

```powershell
npm run check
```

Expected: PASS.

- [ ] **Step 4: Run CLI generation**

Run:

```powershell
npm run generate -- --out templates/generated
```

Expected: PASS and files exist at:

- `templates/generated/main.tex`
- `templates/generated/theme.cls`
- `templates/generated/theme.json`
- `templates/generated/content/overview.tex`

- [ ] **Step 5: Run compile smoke**

Run:

```powershell
npm run smoke:compile
```

Expected if compiler exists: PASS with `"status": "compiled"`.

Expected if compiler is missing: exit code 2 with `"status": "missing-compiler"`. Do not claim compile verification is complete until this command succeeds with a compiler available.

- [ ] **Step 6: Start server and manually verify one browser flow**

Run:

```powershell
npm start
```

Open `http://localhost:5177` and verify this sequence:

1. Change body font from Palatino to Neuton.
2. Change bullet style from Pifont Outline to Triangle.
3. Save theme.
4. Generate template.
5. Confirm `templates/<theme-name>/theme.cls` contains the selected bullet template.

- [ ] **Step 7: Commit**

Run:

```powershell
git add README.md
git commit -m "Document HTML workbench usage"
```

---

## Final Acceptance

Before marking the implementation complete, run:

```powershell
npm test
npm run check
npm run generate -- --out templates/generated
npm run smoke:compile
```

Required results:

- `npm test`: PASS.
- `npm run check`: PASS.
- `npm run generate -- --out templates/generated`: PASS and creates a complete Beamer project.
- `npm run smoke:compile`: PASS with `"status": "compiled"` when a XeLaTeX compiler is available.

If `npm run smoke:compile` reports `"missing-compiler"`, the implementation can be reviewed as code-complete but not compile-verified.
