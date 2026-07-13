# Beginner Manual Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the developer-shaped wizard entrance with a calm beginner onboarding and a grouped, visual manual-design journey that ends in downloadable Beamer deliverables.

**Architecture:** Preserve the existing theme schema, resolved-preview pipeline, reviewed-snapshot gates, and internal decision routes. Add a thin onboarding controller, server-owned curated direction presets, and user-facing stage metadata around those stable internals. Keep the large preview/build code in place while moving new state decisions into focused pure modules.

**Tech Stack:** Node.js 20 CommonJS server, browser JavaScript with UMD state modules, HTML/CSS, `node:test`, existing Beamer generator and compiler.

---

## File Structure

- Create `workbench/design-directions.js`: curated direction definitions and validated application to a theme.
- Create `workbench/public/onboarding-state.js`: pure first-entry and help/re-entry state transitions.
- Create `tests/design-directions.test.js`: preset contract and theme-validity tests.
- Create `tests/onboarding-state.test.js`: onboarding transition tests.
- Create `workbench/project-archive.js`: safe in-memory `.tar.gz` packaging of a generated project.
- Create `tests/project-archive.test.js`: archive traversal and content tests.
- Modify `workbench/public/wizard-state.js`: add welcome route and visible stage grouping without weakening internal route gates.
- Modify `workbench/public/index.html`: add the welcome surface, creator-focused shell, Help entry, and download actions.
- Modify `workbench/public/app.js`: render onboarding, vibe/direction choices, grouped progress, reviewed manual actions, and build downloads.
- Modify `workbench/public/styles.css`: implement calm academic layout, responsive behavior, focus states, and mobile comparison foundations.
- Modify `workbench/server.js`: expose curated directions, welcome route, final PDF, and project archive.
- Modify `package.json`: syntax-check the new modules and run their tests through the existing suite.
- Modify `tests/wizard-state.test.js`, `tests/public-ui.test.js`, and `tests/server.test.js`: assert the new normal path and preserve current snapshot/build behavior.
- Modify `README.md`: keep repository/developer instructions here and update the app-user entry URL.

### Task 1: Add creator-facing stage metadata without changing snapshot rules

**Files:**
- Modify: `workbench/public/wizard-state.js`
- Modify: `tests/wizard-state.test.js`

- [ ] **Step 1: Write the failing stage and route tests**

Add this test beside the existing route-order test:

```js
test("groups internal decisions into the beginner-facing journey", () => {
  assert.deepEqual(wizard.VISIBLE_STAGES.map(({ id, label }) => ({ id, label })), [
    { id: "welcome", label: "Welcome" },
    { id: "direction", label: "Direction" },
    { id: "style", label: "Style" },
    { id: "details", label: "Details" },
    { id: "review", label: "Review" },
    { id: "ai", label: "AI refinement" },
    { id: "build", label: "Build" }
  ]);
  assert.equal(wizard.stepForPath("/welcome").id, "welcome");
  assert.equal(wizard.visibleStageForStep("font").id, "style");
  assert.equal(wizard.visibleStageForStep("blocks").id, "details");
  assert.equal(wizard.visibleStageForStep("manual-review").id, "review");
  assert.equal(wizard.visibleStageForStep("ai-customize").id, "ai");
  assert.equal(wizard.visibleStageForStep("final-review").id, "build");
});
```

- [ ] **Step 2: Run the test and verify the new API is absent**

Run: `node --test tests/wizard-state.test.js`

Expected: FAIL because `VISIBLE_STAGES` and `visibleStageForStep` do not exist.

- [ ] **Step 3: Add visible stages while preserving internal steps**

Add a welcome step to `STEPS`, give every step a `visibleStage`, and export the pure lookup:

```js
const VISIBLE_STAGES = Object.freeze([
  { id: "welcome", label: "Welcome" },
  { id: "direction", label: "Direction" },
  { id: "style", label: "Style" },
  { id: "details", label: "Details" },
  { id: "review", label: "Review" },
  { id: "ai", label: "AI refinement" },
  { id: "build", label: "Build" }
]);

const STEPS = Object.freeze([
  { id: "welcome", path: "/welcome", label: "Welcome", section: null, phase: "manual", visibleStage: "welcome" },
  { id: "start", path: "/start", label: "Direction", section: null, phase: "manual", visibleStage: "direction" },
  { id: "color", path: "/color", label: "Color", section: "colors", phase: "manual", visibleStage: "style" },
  { id: "font", path: "/font", label: "Type", section: "fonts", phase: "manual", visibleStage: "style" },
  { id: "bullets", path: "/bullets", label: "Bullets", section: "bullets", phase: "manual", visibleStage: "details" },
  { id: "blocks", path: "/blocks", label: "Blocks", section: "blocks", phase: "manual", visibleStage: "details" },
  { id: "navigation", path: "/navigation", label: "Navigation", section: "navigation", phase: "manual", visibleStage: "details" },
  { id: "title-page", path: "/title-page", label: "Title page", section: "titlePage", phase: "manual", visibleStage: "details" },
  { id: "manual-review", path: "/manual-review", label: "Review", section: null, phase: "manual", visibleStage: "review" },
  { id: "ai-customize", path: "/ai-customize", label: "AI refinement", section: null, phase: "ai", visibleStage: "ai" },
  { id: "ai-handoff", path: "/ai-handoff", label: "Advanced handoff", section: null, phase: "ai", visibleStage: "ai" },
  { id: "ai-import", path: "/ai-import", label: "Advanced import", section: null, phase: "ai", visibleStage: "ai" },
  { id: "ai-compare", path: "/ai-compare", label: "Compare", section: null, phase: "ai", visibleStage: "ai" },
  { id: "final-review", path: "/final-review", label: "Build", section: null, phase: "final", visibleStage: "build" }
]);

function visibleStageForStep(stepId) {
  const stageId = BY_ID[stepId]?.visibleStage || "welcome";
  return VISIBLE_STAGES.find((stage) => stage.id === stageId) || VISIBLE_STAGES[0];
}
```

Include `VISIBLE_STAGES` and `visibleStageForStep` in the returned API. Change the required-step filter in `canGenerate` to:

```js
return STEPS
  .filter((step) => step.phase === "manual" && step.id !== "welcome")
  .every((step) => map.get(step.id)?.state === "complete");
```

- [ ] **Step 4: Run wizard-state tests**

Run: `node --test tests/wizard-state.test.js`

Expected: PASS, including existing AI/final route gates.

- [ ] **Step 5: Commit the stage model**

```bash
git add workbench/public/wizard-state.js tests/wizard-state.test.js
git commit -m "feat: group wizard steps into creator stages"
```

### Task 2: Add validated curated visual directions

**Files:**
- Create: `workbench/design-directions.js`
- Create: `tests/design-directions.test.js`
- Modify: `workbench/server.js`
- Modify: `tests/server.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write failing preset contract tests**

Create `tests/design-directions.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_THEME, validateTheme } = require("../schema/theme-schema");
const { getRegistry } = require("../registry/options");
const { listDirections, applyDirection } = require("../workbench/design-directions");

test("curated directions are small, visual, and produce valid themes", () => {
  const registry = getRegistry();
  const directions = listDirections(registry);
  assert.deepEqual(directions.map((item) => item.id), ["quiet-academic", "clean-modern", "bold-editorial"]);
  for (const direction of directions) {
    assert.equal(typeof direction.label, "string");
    assert.equal(typeof direction.description, "string");
    assert.equal(direction.swatches.length, 5);
    assert.equal(validateTheme(applyDirection(DEFAULT_THEME, direction.id, registry), { registry }).ok, true);
  }
});

test("unknown directions are rejected instead of partially applying", () => {
  assert.throws(() => applyDirection(DEFAULT_THEME, "missing", getRegistry()), /Unknown design direction/);
});
```

- [ ] **Step 2: Run the preset test and verify it fails**

Run: `node --test tests/design-directions.test.js`

Expected: FAIL with `Cannot find module '../workbench/design-directions'`.

- [ ] **Step 3: Implement the complete direction module**

Create `workbench/design-directions.js`:

```js
"use strict";

const { clone } = require("../lib/utils");

const DIRECTIONS = Object.freeze([
  Object.freeze({ id: "quiet-academic", label: "Quiet academic", description: "Serif type, academic blue, and restrained structure.", paletteId: "academic-blue", fontId: "palatino" }),
  Object.freeze({ id: "clean-modern", label: "Clean modern", description: "Clear sans serif type, slate teal accents, and generous white space.", paletteId: "slate-teal", fontId: "inter" }),
  Object.freeze({ id: "bold-editorial", label: "Bold editorial", description: "High-contrast display type with a confident rose-red palette.", paletteId: "rose-red", fontId: "playfair-display" })
]);

function requireOption(registry, collection, id) {
  const option = registry?.[collection]?.[id];
  if (!option) throw new Error(`Direction references unknown ${collection} option: ${id}`);
  return option;
}

function listDirections(registry) {
  return DIRECTIONS.map((direction) => {
    const palette = requireOption(registry, "palettes", direction.paletteId);
    requireOption(registry, "fonts", direction.fontId);
    return { ...direction, swatches: [palette.colors.background, palette.colors.primary, palette.colors.accent, palette.colors.text, palette.colors.alert] };
  });
}

function applyDirection(theme, directionId, registry) {
  const direction = DIRECTIONS.find(({ id }) => id === directionId);
  if (!direction) throw new Error(`Unknown design direction: ${directionId}`);
  const palette = requireOption(registry, "palettes", direction.paletteId);
  const font = requireOption(registry, "fonts", direction.fontId);
  const next = clone(theme);
  next.colors.paletteId = palette.id;
  Object.assign(next.colors, clone(palette.colors));
  next.fonts.body = font.id;
  next.fonts.title = font.id;
  next.fonts.mode = font.mode;
  return next;
}

module.exports = { DIRECTIONS, listDirections, applyDirection };
```

- [ ] **Step 4: Expose directions through the server**

Import `listDirections` in `workbench/server.js`, then add this route immediately after `/api/options`:

```js
if (req.method === "GET" && url.pathname === "/api/directions") {
  sendJson(res, 200, { ok: true, directions: listDirections(registry) });
  return;
}
```

Add a server test asserting three directions, no internal registry object, and status 200. Add `node --check workbench/design-directions.js` to `npm run check`.

- [ ] **Step 5: Run focused and full tests**

Run: `node --test tests/design-directions.test.js tests/server.test.js`

Expected: PASS.

Run: `npm run check`

Expected: PASS.

- [ ] **Step 6: Commit curated directions**

```bash
git add workbench/design-directions.js workbench/server.js tests/design-directions.test.js tests/server.test.js package.json
git commit -m "feat: add curated beginner design directions"
```

### Task 3: Add first-entry onboarding state and welcome surface

**Files:**
- Create: `workbench/public/onboarding-state.js`
- Create: `tests/onboarding-state.test.js`
- Modify: `workbench/public/index.html`
- Modify: `workbench/public/app.js`
- Modify: `workbench/server.js`
- Modify: `tests/public-ui.test.js`
- Modify: `tests/server.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write failing onboarding state tests**

Create `tests/onboarding-state.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const onboarding = require("../workbench/public/onboarding-state");

test("welcome is shown only when explicitly routed or the session has not started", () => {
  assert.equal(onboarding.shouldShow({ pathname: "/welcome", started: true }), true);
  assert.equal(onboarding.shouldShow({ pathname: "/", started: false }), true);
  assert.equal(onboarding.shouldShow({ pathname: "/color", started: false }), false);
  assert.equal(onboarding.shouldShow({ pathname: "/", started: true }), false);
});

test("starting creates a direction navigation decision", () => {
  assert.deepEqual(onboarding.begin(), { started: true, nextPath: "/start" });
});
```

- [ ] **Step 2: Run the test and verify the module is missing**

Run: `node --test tests/onboarding-state.test.js`

Expected: FAIL with a missing-module error.

- [ ] **Step 3: Implement the pure UMD onboarding module**

Create `workbench/public/onboarding-state.js`:

```js
(function init(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BeamerForgeOnboarding = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function factory() {
  "use strict";
  function shouldShow({ pathname, started }) {
    return pathname === "/welcome" || (pathname === "/" && !started);
  }
  function begin() { return { started: true, nextPath: "/start" }; }
  return { shouldShow, begin };
});
```

- [ ] **Step 4: Add the welcome markup and script order**

Add a sibling before `#wizardApp` in `workbench/public/index.html`:

```html
<section id="welcomeScreen" class="welcome-screen" aria-labelledby="welcomeTitle" hidden>
  <header class="app-header"><span class="brand-mark" aria-hidden="true">B</span><strong>BeamerForge</strong><button id="welcomeHelp" class="text-button" type="button">How it works</button></header>
  <div class="welcome-content">
    <p class="eyebrow">Welcome to BeamerForge</p>
    <h1 id="welcomeTitle">Design a polished Beamer theme without wrestling with LaTeX.</h1>
    <p class="welcome-lede">Start with simple visual choices, then optionally ask AI to refine the result. You remain in control.</p>
    <div class="welcome-stages">
      <article><span class="stage-number">1</span><h2>Choose your foundation</h2><p>Describe the feeling, compare directions, and fine-tune one detail at a time.</p></article>
      <article><span class="stage-number">2</span><h2>Refine it with AI</h2><p>Write the change, compare before and after, then accept, keep, or revise.</p></article>
    </div>
    <aside class="workflow-principle"><strong>Fast while designing. Reliable when finished.</strong><span>Choose → Preview → Refine → Build</span></aside>
    <button id="startDesigning" type="button">Start designing</button>
  </div>
</section>
```

Load `/onboarding-state.js` before `/app.js`. Add `/welcome` to `WIZARD_ROUTES` in `workbench/server.js`.

- [ ] **Step 5: Wire onboarding without mutating theme state**

In `workbench/public/app.js`, bind `const onboarding = window.BeamerForgeOnboarding;`, add `welcomeScreen`, `startDesigning`, and `wizardApp` elements, then add:

```js
function onboardingStarted() { return window.sessionStorage.getItem("beamerforge:onboarding-started") === "1"; }
function renderAppSurface() {
  const showWelcome = onboarding.shouldShow({ pathname: window.location.pathname, started: onboardingStarted() });
  elements.welcomeScreen.hidden = !showWelcome;
  elements.app.hidden = showWelcome;
  return showWelcome;
}
function beginDesigning() {
  const decision = onboarding.begin();
  window.sessionStorage.setItem("beamerforge:onboarding-started", decision.started ? "1" : "0");
  window.history.pushState({ stepId: "start" }, "", decision.nextPath);
  render();
}
```

Call `renderAppSurface()` at the start of `render()` and return before preview work when it shows welcome. Bind `startDesigning` to `beginDesigning`. Root navigation should replace to `/welcome` only when onboarding has not started; otherwise replace to `/start`.

- [ ] **Step 6: Run onboarding and shell tests**

Run: `node --test tests/onboarding-state.test.js tests/public-ui.test.js tests/server.test.js`

Expected: PASS.

- [ ] **Step 7: Commit onboarding**

```bash
git add workbench/public/onboarding-state.js workbench/public/index.html workbench/public/app.js workbench/server.js tests/onboarding-state.test.js tests/public-ui.test.js tests/server.test.js package.json
git commit -m "feat: add creator-focused welcome experience"
```

### Task 4: Turn the start step into a vibe-to-direction decision

**Files:**
- Modify: `workbench/public/app.js`
- Modify: `workbench/public/styles.css`
- Modify: `tests/public-ui.test.js`

- [ ] **Step 1: Write the failing public-UI contract**

Add a test that asserts `renderStart` contains `vibeInput`, `direction-grid`, `/api/directions`, `applyDirectionChoice`, and session storage keys for the vibe and selected direction. Assert that no registry ID is rendered as instructional copy.

```js
test("start step asks for a vibe and offers curated visual directions", () => {
  const script = readPublicFile("app.js");
  const start = functionSource(script, "renderStart");
  for (const token of ["vibeInput", "direction-grid", "state.directions", "applyDirectionChoice"]) assert.match(start, new RegExp(escapeRegExp(token)));
  assert.match(script, /api\("\/api\/directions"\)/);
  assert.match(script, /beamerforge:vibe/);
  assert.match(script, /beamerforge:direction/);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test tests/public-ui.test.js`

Expected: FAIL because the start step still describes the default template.

- [ ] **Step 3: Load directions and add state**

Extend browser state with `vibe`, `directions`, and `directionId`. During `boot()`, fetch `/api/directions` with options and theme, then initialize session-backed values:

```js
state.vibe = window.sessionStorage.getItem("beamerforge:vibe") || "";
state.directionId = window.sessionStorage.getItem("beamerforge:direction") || null;
const directionsResult = await api("/api/directions");
state.directions = directionsResult.directions;
```

- [ ] **Step 4: Replace `renderStart` and add atomic direction application**

Implement `applyDirectionChoice(direction)` by applying its palette and font options from `state.registry`, calling `markManualMutation()`, clearing relevant validation errors, persisting only `vibe` and direction ID to session storage, and rendering once. The function must not call `/api/theme`; existing save/review code remains the persistence gate.

Render one labeled text input and three option cards. Each card contains the direction label, description, five swatches, a font sample, `aria-pressed`, and selected styling. Disable Next until `state.directionId` is set.

- [ ] **Step 5: Add visual-direction CSS**

Add `.vibe-form`, `.direction-grid`, `.direction-card`, `.direction-card.is-selected`, `.direction-swatches`, and `.direction-font-sample`. Reuse current focus-visible and selected-state tokens.

- [ ] **Step 6: Run UI and full state tests**

Run: `node --test tests/public-ui.test.js tests/wizard-state.test.js tests/preview-state.test.js`

Expected: PASS.

- [ ] **Step 7: Commit the direction step**

```bash
git add workbench/public/app.js workbench/public/styles.css tests/public-ui.test.js
git commit -m "feat: guide users from vibe to visual direction"
```

### Task 5: Replace the four-column workbench with a calm guided workspace

**Files:**
- Modify: `workbench/public/index.html`
- Modify: `workbench/public/app.js`
- Modify: `workbench/public/styles.css`
- Modify: `tests/public-ui.test.js`

- [ ] **Step 1: Write failing layout and wording assertions**

Assert the shell contains `appHeader`, `visibleProgress`, `workspaceMain`, `workspacePreview`, and `advancedPanel`. Assert user copy contains `Your design`, `Refine with AI`, and `Build this design`, and does not contain `Cumulative setup`, `AI Handoff`, or `Import Draft` outside Advanced markup.

- [ ] **Step 2: Run the UI test and verify the old shell fails it**

Run: `node --test tests/public-ui.test.js`

Expected: FAIL on the new region IDs and old wording.

- [ ] **Step 3: Restructure the shell without moving renderer elements**

Keep the existing element IDs used by `app.js`, but arrange them as:

```html
<main id="wizardApp" class="creator-app" hidden>
  <header id="appHeader" class="app-header">...</header>
  <nav id="visibleProgress" class="visible-progress" aria-label="Design progress"></nav>
  <div class="creator-workspace">
    <section id="workspaceMain" class="decision-panel">...</section>
    <section id="workspacePreview" class="preview-panel">...</section>
  </div>
  <aside id="advancedPanel" class="advanced-panel" hidden>...</aside>
</main>
```

Move `summaryList` into a collapsible **Design summary** section beneath the decision content. Keep `slidePreview`, `authoritativePreview`, their status controls, and IDs intact so renderer-parity tests continue to exercise the same DOM nodes.

- [ ] **Step 4: Render visible stages separately from internal edit steps**

Replace `renderPhaseProgress()` with stage buttons derived from `wizard.VISIBLE_STAGES` and `wizard.visibleStageForStep(currentStep().id)`. Render internal choices only in the summary/edit list. Stage buttons navigate only to reachable first steps: welcome, start, color, bullets, manual-review, ai-customize, final-review.

- [ ] **Step 5: Apply the calm academic CSS system**

Set warm canvas `#f5f3ee`, ink `#17233f`, restrained teal `#176a73`, white surfaces, 14–20px radii, modest shadows, and a two-column desktop workspace. Remove the four-column grid. Keep option cards dense enough for scanning and give the preview the larger column.

- [ ] **Step 6: Preserve narrow-screen behavior**

At `max-width: 900px`, stack decision then preview, make visible progress horizontally scrollable, and keep Back/Continue in normal document flow. At `max-width: 620px`, use a single column and full-width primary actions.

- [ ] **Step 7: Run UI, renderer, and authoritative-preview tests**

Run: `node --test tests/public-ui.test.js tests/preview-state.test.js tests/authoritative-preview-state.test.js tests/vector-renderers.test.js`

Expected: PASS.

- [ ] **Step 8: Commit the guided workspace**

```bash
git add workbench/public/index.html workbench/public/app.js workbench/public/styles.css tests/public-ui.test.js
git commit -m "feat: redesign wizard as a calm guided workspace"
```

### Task 6: Simplify manual review and make AI optional

**Files:**
- Modify: `workbench/public/app.js`
- Modify: `tests/public-ui.test.js`
- Modify: `tests/selection-server.test.js`

- [ ] **Step 1: Write failing review-action tests**

Assert `renderReview` exposes exactly two normal continuations—`Refine with AI` and `Build this design`—and that handoff/import controls occur only in `renderAdvancedAiTools`. Assert the manual build path freezes, restores, and selects the reviewed manual snapshot before navigating to build.

- [ ] **Step 2: Run tests and verify old wording/placement fails**

Run: `node --test tests/public-ui.test.js tests/selection-server.test.js`

Expected: FAIL because review currently says “Save Manual Design & Continue to AI” and “Use Manual Version.”

- [ ] **Step 3: Implement explicit normal actions**

In `renderReview`, use:

```js
const refine = actionButton("Refine with AI", () => freezeManualBaseline());
const build = actionButton("Build this design", async () => {
  await freezeManualBaseline({ navigate: false });
  await selectFinalVersion("manual");
});
```

Update `freezeManualBaseline` so its return value resolves only after state is current. Do not weaken `selectionState.reviewRequest`, `/api/ai/restore`, or the server's cycle/revision/hash checks.

- [ ] **Step 4: Move external handoff UI under Advanced**

Create `renderAdvancedAiTools()` that contains **Export handoff folder**, **Import theme JSON**, and current handoff status. The normal `renderAiCustomize()` must not include JSON or external-agent instructions.

- [ ] **Step 5: Run selection and UI tests**

Run: `node --test tests/public-ui.test.js tests/selection-state.test.js tests/selection-server.test.js`

Expected: PASS.

- [ ] **Step 6: Commit the simplified review**

```bash
git add workbench/public/app.js tests/public-ui.test.js tests/selection-server.test.js
git commit -m "feat: make AI an optional reviewed continuation"
```

### Task 7: Add safe final PDF and complete-project downloads

**Files:**
- Create: `workbench/project-archive.js`
- Create: `tests/project-archive.test.js`
- Modify: `workbench/server.js`
- Modify: `workbench/public/index.html`
- Modify: `workbench/public/app.js`
- Modify: `tests/server.test.js`
- Modify: `tests/public-ui.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write failing archive safety tests**

Test that `createProjectArchive(projectDir)` returns a gzip buffer containing `main.tex`, excludes symbolic links and `.tmp` files, sorts entries, and throws when the resolved project directory is outside the configured output root.

- [ ] **Step 2: Run the archive test and verify the module is missing**

Run: `node --test tests/project-archive.test.js`

Expected: FAIL with a missing-module error.

- [ ] **Step 3: Implement deterministic `.tar.gz` creation using Node built-ins**

Create `workbench/project-archive.js`:

```js
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

function assertInside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw Object.assign(new Error("Project download is outside the output directory"), { statusCode: 400 });
}

function writeOctal(buffer, offset, length, value) {
  const octal = Number(value).toString(8).padStart(length - 1, "0");
  if (octal.length > length - 1) throw new Error("Archive value is too large");
  buffer.write(octal, offset, length - 1, "ascii");
  buffer[offset + length - 1] = 0;
}

function createHeader(name, size) {
  if (Buffer.byteLength(name) > 100) throw Object.assign(new Error(`Archive path is too long: ${name}`), { statusCode: 400 });
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "utf8");
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header[156] = "0".charCodeAt(0);
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(checksum.toString(8).padStart(6, "0"), 148, 6, "ascii");
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

function collect(directory, prefix = "") {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(directory, entry.name);
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isSymbolicLink()) throw Object.assign(new Error(`Project contains a symbolic link: ${relative}`), { statusCode: 400 });
    if (entry.isDirectory()) files.push(...collect(absolute, relative));
    else if (entry.isFile() && !entry.name.endsWith(".tmp")) files.push({ absolute, relative });
    else if (!entry.isFile()) throw Object.assign(new Error(`Project contains an unsupported file: ${relative}`), { statusCode: 400 });
  }
  return files;
}

function createProjectArchive({ outputRoot, projectDir }) {
  assertInside(outputRoot, projectDir);
  if (!fs.statSync(projectDir).isDirectory()) throw Object.assign(new Error("Generated project was not found"), { statusCode: 404 });
  const blocks = [];
  for (const file of collect(projectDir)) {
    const bytes = fs.readFileSync(file.absolute);
    blocks.push(createHeader(file.relative, bytes.length), bytes);
    const padding = (512 - (bytes.length % 512)) % 512;
    if (padding) blocks.push(Buffer.alloc(padding));
  }
  blocks.push(Buffer.alloc(1024));
  return zlib.gzipSync(Buffer.concat(blocks), { level: 9 });
}

module.exports = { createProjectArchive };
```

- [ ] **Step 4: Add reviewed-build download routes**

Add:

```text
GET /api/build/main.pdf
GET /api/build/project.tar.gz
```

Both routes must call `readCurrentSelection(stateDir, registry)`, resolve the selected theme's guarded template directory, and return 409 unless a current reviewed selection exists. The PDF route serves only a regular `main.pdf` beneath that directory with `application/pdf`, `attachment`, and `no-store`. The archive route uses `createProjectArchive` and serves `application/gzip` with a sanitized filename.

- [ ] **Step 5: Render delivery actions only after successful build**

Add `downloadPdf` and `downloadProject` anchors to `index.html`. In `setBuildStatus`, reveal them only when the returned status indicates successful generation/compilation; PDF remains hidden until compilation reports success.

- [ ] **Step 6: Run focused build/download tests**

Run: `node --test tests/project-archive.test.js tests/server.test.js tests/public-ui.test.js tests/build.test.js`

Expected: PASS, including traversal and missing-build cases.

- [ ] **Step 7: Commit deliverable downloads**

```bash
git add workbench/project-archive.js workbench/server.js workbench/public/index.html workbench/public/app.js tests/project-archive.test.js tests/server.test.js tests/public-ui.test.js package.json
git commit -m "feat: download reviewed Beamer deliverables"
```

### Task 8: Finish accessibility, wording, and repository guidance

**Files:**
- Modify: `workbench/public/index.html`
- Modify: `workbench/public/app.js`
- Modify: `workbench/public/styles.css`
- Modify: `tests/public-ui.test.js`
- Modify: `README.md`

- [ ] **Step 1: Add failing accessibility assertions**

Assert the shell has a skip link, `aria-live="polite"` status region, visible focus rules, `aria-pressed` on selection cards, text labels in addition to color, and no fixed overlay covering primary actions at mobile widths.

- [ ] **Step 2: Run the public UI test and verify gaps**

Run: `node --test tests/public-ui.test.js`

Expected: FAIL on the missing accessibility contract.

- [ ] **Step 3: Implement the accessibility contract**

Add a skip link to `#stepContent`, ensure selection cards are buttons with `aria-pressed`, add a polite `#workflowStatus`, move focus to `#stepTitle` after route changes using `tabindex="-1"`, and honor `prefers-reduced-motion: reduce` by removing transitions.

- [ ] **Step 4: Keep developer guidance in README only**

Update README's user entry to `http://localhost:5177/welcome`. Retain clone/run/catalog extension guidance in README, and remove copy implying that app users must point an external agent at the repository.

- [ ] **Step 5: Run the complete verification suite**

Run: `npm run check`

Expected: PASS.

Run: `npm test`

Expected: PASS with no failures.

Run: `npm run smoke:compile`

Expected: generated sample compiles when a supported LaTeX toolchain is installed; otherwise the command reports the existing explicit compiler-unavailable result without corrupting state.

- [ ] **Step 6: Manually verify the creator journey**

Start with `npm start`, open `/welcome`, and verify at desktop and narrow widths:

1. Welcome → Start designing.
2. Vibe → one of three directions.
3. Color/type → details → manual review.
4. Back navigation preserves later compatible choices.
5. Build this design → compile → PDF and project downloads.
6. No duck appears in a fresh default design.
7. Help reopens “How BeamerForge works” without resetting the theme.

- [ ] **Step 7: Commit accessibility and documentation**

```bash
git add workbench/public/index.html workbench/public/app.js workbench/public/styles.css tests/public-ui.test.js README.md
git commit -m "feat: finish accessible beginner manual journey"
```
