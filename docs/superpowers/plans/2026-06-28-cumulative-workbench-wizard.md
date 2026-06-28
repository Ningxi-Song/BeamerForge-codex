# Cumulative Workbench Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first cumulative multi-page BeamerForge workbench wizard that starts from a default template, edits one `theme.json` section per step, previews accumulated choices, supports non-destructive backtracking, and generates a complete Beamer project.

**Architecture:** Keep the existing Node/CommonJS workbench foundation: schema validation, registry metadata, generator, local HTTP server, and browser UI. Replace the single-screen browser workbench with a route-driven wizard over one shared theme state. Use `theme.json` as the only source of truth for preview and generation.

**Tech Stack:** Node.js 20 CommonJS, built-in `node:test`, vanilla HTML/CSS/JS, local HTTP server, XeLaTeX or `latexmk` for compile smoke tests.

---

## Scope

This plan supersedes the browser UI portions of `docs/superpowers/plans/2026-06-26-html-beamer-workbench.md`.

Reuse or migrate the stable foundation from the external worktree:

```text
C:\ai_practice_local\beamer_template_worktrees\html-beamer-workbench
```

Do not move a Git worktree back inside the project root. The main repository root must remain clean:

```text
C:\ai_practice_local\beamer_template
```

The first vertical slice includes:

- Default template page.
- Color step with curated palettes.
- Font step with at least two choices.
- Bullet step with at least two choices.
- Block step with at least one choice.
- Navigation step with at least two choices.
- Title page step with at least one choice.
- Review page that blocks generation while any step needs review.
- Generated Beamer project.
- Compile smoke command when a local LaTeX compiler is available.

## File Structure

Create these files in the main repo if they do not already exist:

- `package.json`: Node scripts for test, syntax check, server, generation, and compile smoke.
- `schema/theme-schema.js`: default theme and field-level validation.
- `registry/options.js`: curated design options and compatibility metadata.
- `generators/latex.js`: pure `theme.json` to LaTeX/Markdown generation.
- `generators/project-writer.js`: writes generated projects under `templates/<name>/`.
- `generators/cli.js`: command-line generation entrypoint.
- `workbench/build.js`: compiler detection and compile execution.
- `workbench/server.js`: local HTTP API and static route fallback.
- `workbench/smoke-compile.js`: generated-project compile smoke.
- `workbench/public/index.html`: wizard shell.
- `workbench/public/styles.css`: wizard layout and preview styling.
- `workbench/public/wizard-state.js`: route, step, and step-status logic shared by browser and tests.
- `workbench/public/app.js`: browser state, rendering, preview, API actions.
- `tests/scaffold.test.js`: package and script tests.
- `tests/schema.test.js`: theme schema tests.
- `tests/registry.test.js`: option and compatibility metadata tests.
- `tests/generator.test.js`: generated file tests.
- `tests/project-writer.test.js`: file writer tests.
- `tests/build.test.js`: compiler-detection tests.
- `tests/server.test.js`: API and route fallback tests.
- `tests/wizard-state.test.js`: wizard route and step-status tests.
- `tests/public-ui.test.js`: browser shell and script behavior tests.

Modify these files:

- `.gitignore`: ignore `workbench/state/`, `workbench/build/`, generated `templates/`, and local agent state.
- `README.md`: document the cumulative wizard flow.
- `docs/superpowers/plans/2026-06-26-html-beamer-workbench.md`: add a short note that its single-screen UI task is superseded by this plan.

Generated user projects live under `templates/<name>/` and must remain untracked by default.

---

### Task 1: Migrate Stable Workbench Foundation

**Files:**
- Create: `package.json`
- Create: `schema/theme-schema.js`
- Create: `registry/options.js`
- Create: `generators/latex.js`
- Create: `generators/project-writer.js`
- Create: `generators/cli.js`
- Create: `workbench/build.js`
- Create: `workbench/server.js`
- Create: `workbench/smoke-compile.js`
- Create: `tests/scaffold.test.js`
- Create: `tests/schema.test.js`
- Create: `tests/registry.test.js`
- Create: `tests/generator.test.js`
- Create: `tests/project-writer.test.js`
- Create: `tests/build.test.js`
- Create: `tests/server.test.js`
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
  assert.match(pkg.scripts.check, /node --check schema\/theme-schema\.js/);
  assert.equal(pkg.scripts.start, "node workbench/server.js");
  assert.equal(pkg.scripts.generate, "node generators/cli.js --theme theme.json --out templates/generated");
  assert.equal(pkg.scripts["smoke:compile"], "node workbench/smoke-compile.js");
});
```

- [ ] **Step 2: Run the scaffold test to verify failure**

Run:

```powershell
node --test tests/scaffold.test.js
```

Expected: FAIL because `package.json` does not exist in the main repo.

- [ ] **Step 3: Copy stable foundation files from the external worktree**

Run:

```powershell
$src = "C:\ai_practice_local\beamer_template_worktrees\html-beamer-workbench"
$dst = "C:\ai_practice_local\beamer_template"
Copy-Item -LiteralPath "$src\package.json" -Destination "$dst\package.json"
Copy-Item -LiteralPath "$src\schema" -Destination "$dst\schema" -Recurse
Copy-Item -LiteralPath "$src\registry" -Destination "$dst\registry" -Recurse
Copy-Item -LiteralPath "$src\generators" -Destination "$dst\generators" -Recurse
New-Item -ItemType Directory -Force -Path "$dst\workbench" | Out-Null
Copy-Item -LiteralPath "$src\workbench\build.js" -Destination "$dst\workbench\build.js"
Copy-Item -LiteralPath "$src\workbench\server.js" -Destination "$dst\workbench\server.js"
Copy-Item -LiteralPath "$src\workbench\smoke-compile.js" -Destination "$dst\workbench\smoke-compile.js"
Copy-Item -LiteralPath "$src\tests" -Destination "$dst\tests" -Recurse
```

Do not copy these generated/runtime directories:

```text
workbench/state/
workbench/build/
templates/
tmp/
```

- [ ] **Step 4: Replace `.gitignore` workbench ignores**

Ensure `.gitignore` contains:

```gitignore
# Local agent/worktree state
.agents/
.superpowers/
.worktrees/

# Workbench runtime state and generated projects
workbench/state/
workbench/build/
templates/

# Exclude from repo
recipes/blackred/
```

Keep the existing LaTeX auxiliary and `preview/fonts/*/` ignores.

- [ ] **Step 5: Run migrated foundation tests**

Run:

```powershell
node --test tests/scaffold.test.js tests/schema.test.js tests/registry.test.js tests/generator.test.js tests/project-writer.test.js tests/build.test.js tests/server.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add package.json schema registry generators workbench/build.js workbench/server.js workbench/smoke-compile.js tests .gitignore
git commit -m "Add stable workbench foundation"
```

---

### Task 2: Add Shared Wizard State Module

**Files:**
- Create: `workbench/public/wizard-state.js`
- Create: `tests/wizard-state.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write failing wizard state tests**

Create `tests/wizard-state.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const wizard = require("../workbench/public/wizard-state");
const { DEFAULT_THEME } = require("../schema/theme-schema");
const { getRegistry } = require("../registry/options");

test("defines the cumulative wizard route order", () => {
  assert.deepEqual(
    wizard.STEPS.map((step) => step.path),
    ["/start", "/color", "/font", "/bullets", "/blocks", "/navigation", "/title-page", "/review"]
  );
  assert.equal(wizard.stepForPath("/font").id, "font");
  assert.equal(wizard.nextStepId("font"), "bullets");
  assert.equal(wizard.previousStepId("font"), "color");
});

test("maps each decision step to one theme section", () => {
  assert.equal(wizard.sectionForStep("color"), "colors");
  assert.equal(wizard.sectionForStep("font"), "fonts");
  assert.equal(wizard.sectionForStep("bullets"), "bullets");
  assert.equal(wizard.sectionForStep("blocks"), "blocks");
  assert.equal(wizard.sectionForStep("navigation"), "navigation");
  assert.equal(wizard.sectionForStep("title-page"), "titlePage");
  assert.equal(wizard.sectionForStep("review"), null);
});

test("marks default theme steps complete", () => {
  const statuses = wizard.deriveStepStatuses(DEFAULT_THEME, getRegistry());
  assert.equal(statuses.every((status) => status.state === "complete"), true);
});

test("flags invalid later choices without clearing them", () => {
  const theme = JSON.parse(JSON.stringify(DEFAULT_THEME));
  theme.bullets.style = "missing-bullet";
  const statuses = wizard.deriveStepStatuses(theme, getRegistry());
  assert.equal(theme.bullets.style, "missing-bullet");
  assert.equal(statuses.find((status) => status.id === "bullets").state, "needs-review");
  assert.equal(wizard.canGenerate(statuses), false);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
node --test tests/wizard-state.test.js
```

Expected: FAIL with `Cannot find module '../workbench/public/wizard-state'`.

- [ ] **Step 3: Implement the shared wizard state module**

Create `workbench/public/wizard-state.js`:

```js
(function initWizardState(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  root.BeamerForgeWizard = factory();
})(typeof globalThis !== "undefined" ? globalThis : window, function wizardFactory() {
  const STEPS = Object.freeze([
    { id: "start", path: "/start", label: "Default Template", section: null },
    { id: "color", path: "/color", label: "Color", section: "colors" },
    { id: "font", path: "/font", label: "Font", section: "fonts" },
    { id: "bullets", path: "/bullets", label: "Bullets", section: "bullets" },
    { id: "blocks", path: "/blocks", label: "Blocks", section: "blocks" },
    { id: "navigation", path: "/navigation", label: "Navigation", section: "navigation" },
    { id: "title-page", path: "/title-page", label: "Title Page", section: "titlePage" },
    { id: "review", path: "/review", label: "Review & Generate", section: null }
  ]);

  const STEP_BY_ID = Object.freeze(Object.fromEntries(STEPS.map((step) => [step.id, step])));
  const STEP_BY_PATH = Object.freeze(Object.fromEntries(STEPS.map((step) => [step.path, step])));

  const REQUIRED_OPTION_PATHS = Object.freeze({
    color: ["palettes", "colors.paletteId"],
    font: ["fonts", "fonts.body"],
    bullets: ["bullets", "bullets.style"],
    blocks: ["blocks", "blocks.style"],
    navigation: ["navigation", "navigation.style"],
    "title-page": ["titlePages", "titlePage.layout"]
  });

  const ERROR_STEP_PREFIXES = Object.freeze([
    ["identity.", "start"],
    ["foundation.", "start"],
    ["colors.", "color"],
    ["fonts.", "font"],
    ["bullets.", "bullets"],
    ["blocks.", "blocks"],
    ["navigation.", "navigation"],
    ["titlePage.", "title-page"],
    ["contentDefaults.", "review"]
  ]);

  function stepForPath(pathname) {
    return STEP_BY_PATH[pathname] || STEP_BY_PATH["/start"];
  }

  function indexForStep(stepId) {
    return Math.max(0, STEPS.findIndex((step) => step.id === stepId));
  }

  function nextStepId(stepId) {
    const index = indexForStep(stepId);
    return STEPS[Math.min(index + 1, STEPS.length - 1)].id;
  }

  function previousStepId(stepId) {
    const index = indexForStep(stepId);
    return STEPS[Math.max(index - 1, 0)].id;
  }

  function sectionForStep(stepId) {
    return STEP_BY_ID[stepId] ? STEP_BY_ID[stepId].section : null;
  }

  function getPathValue(object, path) {
    return path.split(".").reduce((value, part) => (value ? value[part] : undefined), object);
  }

  function stepForErrorPath(path) {
    const match = ERROR_STEP_PREFIXES.find(([prefix]) => path.startsWith(prefix));
    return match ? match[1] : "review";
  }

  function optionLabel(collection, id) {
    if (!collection || !id || !collection[id]) return "";
    return collection[id].label || id;
  }

  function labelForStep(stepId, theme, registry) {
    if (stepId === "start") return theme.identity?.name || "Default template";
    if (stepId === "review") return "Ready check";
    const requirement = REQUIRED_OPTION_PATHS[stepId];
    if (!requirement) return "";
    const [collectionName, fieldPath] = requirement;
    return optionLabel(registry[collectionName], getPathValue(theme, fieldPath));
  }

  function deriveStepStatuses(theme, registry, validationErrors = []) {
    const errorMap = new Map();
    for (const error of validationErrors) {
      const stepId = stepForErrorPath(error.path || "");
      if (!errorMap.has(stepId)) errorMap.set(stepId, []);
      errorMap.get(stepId).push(error.message || "Needs review");
    }

    return STEPS.map((step) => {
      const messages = errorMap.get(step.id) || [];
      const requirement = REQUIRED_OPTION_PATHS[step.id];
      if (requirement) {
        const [collectionName, fieldPath] = requirement;
        const id = getPathValue(theme, fieldPath);
        if (!registry[collectionName] || !registry[collectionName][id]) {
          messages.push(`${step.label} selection needs review`);
        }
      }

      return {
        id: step.id,
        path: step.path,
        label: step.label,
        selectedLabel: labelForStep(step.id, theme, registry),
        state: messages.length > 0 ? "needs-review" : "complete",
        messages
      };
    });
  }

  function canGenerate(statuses) {
    return statuses.every((status) => status.state === "complete");
  }

  return {
    STEPS,
    stepForPath,
    nextStepId,
    previousStepId,
    sectionForStep,
    deriveStepStatuses,
    canGenerate
  };
});
```

- [ ] **Step 4: Include the new script in syntax checks**

Modify `package.json` so `scripts.check` includes:

```json
"node --check workbench/public/wizard-state.js"
```

Place it before `node --check workbench/public/app.js`.

- [ ] **Step 5: Run wizard state tests**

Run:

```powershell
node --test tests/wizard-state.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add workbench/public/wizard-state.js tests/wizard-state.test.js package.json
git commit -m "Add cumulative wizard state model"
```

---

### Task 3: Add Wizard Route Fallback To Server

**Files:**
- Modify: `workbench/server.js`
- Modify: `tests/server.test.js`

- [ ] **Step 1: Add failing server tests for wizard routes**

Append to `tests/server.test.js`:

```js
test("serves the wizard shell for client-side wizard routes", async (t) => {
  const stateDir = tempDir("beamerforge-server-");
  const baseUrl = await withServer(t, { stateDir });

  for (const route of ["/start", "/color", "/font", "/bullets", "/blocks", "/navigation", "/title-page", "/review"]) {
    const response = await fetch(`${baseUrl}${route}`);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /id="wizardApp"/);
  }
});
```

- [ ] **Step 2: Run server tests to verify failure**

Run:

```powershell
node --test tests/server.test.js
```

Expected: FAIL for wizard routes returning 404.

- [ ] **Step 3: Implement route fallback**

In `workbench/server.js`, add:

```js
const WIZARD_ROUTES = new Set([
  "/start",
  "/color",
  "/font",
  "/bullets",
  "/blocks",
  "/navigation",
  "/title-page",
  "/review"
]);
```

Modify `serveStatic` so wizard routes serve `index.html`:

```js
function serveStatic(req, res, publicDir) {
  const url = new URL(req.url, "http://localhost");
  const pathname = WIZARD_ROUTES.has(url.pathname) ? "/" : url.pathname;
  const filePath = resolveStaticPath(publicDir, pathname);

  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    sendText(res, 404, "Not found");
    return;
  }

  sendText(res, 200, fs.readFileSync(filePath), contentTypeFor(filePath));
}
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
git commit -m "Serve wizard routes from workbench shell"
```

---

### Task 4: Replace Browser Shell With Wizard Layout

**Files:**
- Modify: `workbench/public/index.html`
- Modify: `tests/public-ui.test.js`

- [ ] **Step 1: Write failing UI shell tests**

Replace the single-screen control expectations in `tests/public-ui.test.js` with:

```js
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
```

- [ ] **Step 2: Run public UI tests to verify failure**

Run:

```powershell
node --test tests/public-ui.test.js
```

Expected: FAIL because the old shell still exposes single-screen controls.

- [ ] **Step 3: Replace `index.html` with the wizard shell**

Use this structure:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>BeamerForge Wizard</title>
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body>
    <main id="wizardApp" class="wizard-app">
      <aside class="wizard-rail" aria-label="Template steps">
        <header class="brand-block">
          <p class="eyebrow">BeamerForge</p>
          <h1>Template Wizard</h1>
        </header>
        <nav id="stepList" class="step-list"></nav>
      </aside>

      <section class="decision-panel" aria-labelledby="stepTitle">
        <div class="step-heading">
          <p class="eyebrow">Cumulative setup</p>
          <h2 id="stepTitle"></h2>
          <p id="stepDescription" class="step-description"></p>
        </div>
        <div id="stepContent" class="step-content"></div>
        <div class="wizard-actions">
          <button id="backStep" class="secondary-button" type="button">Back</button>
          <button id="nextStep" type="button">Next</button>
        </div>
      </section>

      <section class="preview-panel" aria-label="Live preview">
        <div class="preview-toolbar">
          <div>
            <p class="eyebrow">Live Beamer preview</p>
            <h2>Accumulated theme</h2>
          </div>
          <span id="saveStatus" class="status">Loading</span>
        </div>
        <article id="slidePreview" class="slide-preview"></article>
      </section>

      <aside class="summary-panel" aria-label="Selected choices">
        <h2>Choices</h2>
        <div id="summaryList" class="summary-list"></div>
        <button id="reviewGenerate" type="button">Generate Template</button>
        <button id="compileTheme" class="secondary-button" type="button">Compile PDF</button>
        <pre id="buildStatus">No build yet.</pre>
      </aside>
    </main>
    <script src="/wizard-state.js"></script>
    <script src="/app.js"></script>
  </body>
</html>
```

- [ ] **Step 4: Run public UI tests**

Run:

```powershell
node --test tests/public-ui.test.js
```

Expected: PASS for shell tests. Existing script-specific tests may still fail until the next task.

- [ ] **Step 5: Commit**

Run:

```powershell
git add workbench/public/index.html tests/public-ui.test.js
git commit -m "Add cumulative wizard browser shell"
```

---

### Task 5: Rewrite Browser App As A Cumulative Step Router

**Files:**
- Modify: `workbench/public/app.js`
- Modify: `tests/public-ui.test.js`

- [ ] **Step 1: Add failing behavior tests for router functions**

Append to `tests/public-ui.test.js`:

```js
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
```

- [ ] **Step 2: Run public UI tests to verify failure**

Run:

```powershell
node --test tests/public-ui.test.js
```

Expected: FAIL because old `app.js` is still a single-screen controller.

- [ ] **Step 3: Replace top-level browser state and routing helpers**

In `workbench/public/app.js`, use this state shape:

```js
const wizard = window.BeamerForgeWizard;

const state = {
  registry: null,
  theme: null,
  validationErrors: [],
  statuses: [],
  busy: false
};

const elements = {
  stepList: document.getElementById("stepList"),
  stepTitle: document.getElementById("stepTitle"),
  stepDescription: document.getElementById("stepDescription"),
  stepContent: document.getElementById("stepContent"),
  summaryList: document.getElementById("summaryList"),
  preview: document.getElementById("slidePreview"),
  saveStatus: document.getElementById("saveStatus"),
  backStep: document.getElementById("backStep"),
  nextStep: document.getElementById("nextStep"),
  reviewGenerate: document.getElementById("reviewGenerate"),
  compileTheme: document.getElementById("compileTheme"),
  buildStatus: document.getElementById("buildStatus")
};

const STEP_DESCRIPTIONS = Object.freeze({
  start: "Start from the default Beamer template before changing any design element.",
  color: "Choose the palette first. Later choices will preview on top of this palette.",
  font: "Choose the typeface while preserving the selected colors.",
  bullets: "Choose the bullet marker while preserving color and font choices.",
  blocks: "Choose how callout blocks should look in the accumulated theme.",
  navigation: "Choose the header and footline structure.",
  "title-page": "Choose the opening slide layout.",
  review: "Review every choice before generating Beamer files."
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function replaceChildren(parent, children) {
  parent.replaceChildren(...children);
}

function currentStep() {
  return wizard.stepForPath(window.location.pathname);
}

function navigateToStep(stepId, options = {}) {
  const step = wizard.STEPS.find((item) => item.id === stepId) || wizard.STEPS[0];
  if (!options.replace) {
    window.history.pushState({ stepId: step.id }, "", step.path);
  } else {
    window.history.replaceState({ stepId: step.id }, "", step.path);
  }
  render();
}
```

- [ ] **Step 4: Add cumulative choice updates**

Add:

```js
function selectedOption(stepId, optionId) {
  if (stepId === "color") return state.registry.palettes[optionId];
  if (stepId === "font") return state.registry.fonts[optionId];
  if (stepId === "bullets") return state.registry.bullets[optionId];
  if (stepId === "blocks") return state.registry.blocks[optionId];
  if (stepId === "navigation") return state.registry.navigation[optionId];
  if (stepId === "title-page") return state.registry.titlePages[optionId];
  return null;
}

function applyChoice(stepId, optionId) {
  const option = selectedOption(stepId, optionId);
  if (!option) return;

  if (stepId === "color") {
    Object.assign(state.theme.colors, option.colors, { paletteId: option.id });
  }
  if (stepId === "font") {
    state.theme.fonts.body = option.id;
    state.theme.fonts.title = option.id;
    state.theme.fonts.mode = option.mode;
  }
  if (stepId === "bullets") state.theme.bullets.style = option.id;
  if (stepId === "blocks") state.theme.blocks.style = option.id;
  if (stepId === "navigation") state.theme.navigation.style = option.id;
  if (stepId === "title-page") state.theme.titlePage.layout = option.id;

  refreshStatuses();
  render();
  saveDraft().catch((error) => setBuildStatus(error.details || error.message));
}

function refreshStatuses(errors = state.validationErrors) {
  state.validationErrors = errors;
  state.statuses = wizard.deriveStepStatuses(state.theme, state.registry, errors);
}
```

This is the core non-destructive rule: `applyChoice` updates one section only and never clears later sections.

- [ ] **Step 5: Add API helpers and draft persistence**

Add:

```js
async function api(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error || body.message || `Request failed: ${response.status}`);
    error.details = body;
    throw error;
  }
  return body;
}

function setStatus(text, className = "") {
  elements.saveStatus.className = className ? `status ${className}` : "status";
  elements.saveStatus.textContent = text;
}

function setBuildStatus(value) {
  elements.buildStatus.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

async function saveDraft() {
  setStatus("Saving");
  const result = await api("/api/theme", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(state.theme)
  });
  state.theme = clone(result.theme);
  refreshStatuses([]);
  setStatus("Saved", "is-saved");
  return result;
}
```

- [ ] **Step 6: Add step list, cards, and summary rendering**

Add:

```js
function optionCollectionForStep(stepId) {
  if (stepId === "color") return state.registry.palettes;
  if (stepId === "font") return state.registry.fonts;
  if (stepId === "bullets") return state.registry.bullets;
  if (stepId === "blocks") return state.registry.blocks;
  if (stepId === "navigation") return state.registry.navigation;
  if (stepId === "title-page") return state.registry.titlePages;
  return {};
}

function selectedIdForStep(stepId) {
  if (stepId === "color") return state.theme.colors.paletteId;
  if (stepId === "font") return state.theme.fonts.body;
  if (stepId === "bullets") return state.theme.bullets.style;
  if (stepId === "blocks") return state.theme.blocks.style;
  if (stepId === "navigation") return state.theme.navigation.style;
  if (stepId === "title-page") return state.theme.titlePage.layout;
  return "";
}

function renderStepList() {
  const step = currentStep();
  const items = wizard.STEPS.map((item) => {
    const button = document.createElement("button");
    const status = state.statuses.find((entry) => entry.id === item.id);
    button.type = "button";
    button.className = item.id === step.id ? "step-link is-active" : "step-link";
    button.dataset.state = status ? status.state : "complete";
    button.textContent = item.label;
    button.addEventListener("click", () => navigateToStep(item.id));
    return button;
  });
  replaceChildren(elements.stepList, items);
}

function renderOptionCards(stepId) {
  const selectedId = selectedIdForStep(stepId);
  return Object.values(optionCollectionForStep(stepId)).map((option) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = option.id === selectedId ? "option-card is-selected" : "option-card";
    card.setAttribute("aria-pressed", String(option.id === selectedId));
    card.addEventListener("click", () => applyChoice(stepId, option.id));

    const title = document.createElement("span");
    title.className = "option-title";
    title.textContent = option.label;

    const meta = document.createElement("span");
    meta.className = "option-meta";
    meta.textContent = option.description || option.mode || option.id;

    card.append(title, meta);
    if (stepId === "color") card.prepend(colorSwatches(option.colors));
    if (stepId === "font") card.style.fontFamily = option.cssFamily;
    if (stepId === "bullets") card.style.setProperty("--sample-bullet", JSON.stringify(option.cssMarker || "o"));
    return card;
  });
}

function colorSwatches(colors) {
  const row = document.createElement("span");
  row.className = "color-swatches";
  for (const key of ["background", "primary", "accent", "text"]) {
    const swatch = document.createElement("span");
    swatch.className = "color-swatch";
    swatch.style.backgroundColor = colors[key];
    swatch.title = `${key}: ${colors[key]}`;
    row.appendChild(swatch);
  }
  return row;
}

function renderSummary() {
  const items = state.statuses.map((status) => {
    const row = document.createElement("div");
    row.className = "summary-row";
    row.dataset.state = status.state;

    const label = document.createElement("span");
    label.textContent = `${status.label}: ${status.state === "needs-review" ? "needs review" : status.selectedLabel}`;

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "summary-edit";
    edit.textContent = "Edit";
    edit.addEventListener("click", () => navigateToStep(status.id));

    row.append(label, edit);
    return row;
  });
  replaceChildren(elements.summaryList, items);
}
```

- [ ] **Step 7: Add current step rendering**

Add:

```js
function renderStepContent() {
  const step = currentStep();
  elements.stepTitle.textContent = step.label;
  elements.stepDescription.textContent = STEP_DESCRIPTIONS[step.id] || "";

  if (step.id === "start") {
    const start = document.createElement("div");
    start.className = "start-copy";
    start.textContent = "This is the default template. Continue to layer color, type, bullets, blocks, navigation, and title-page choices.";
    replaceChildren(elements.stepContent, [start]);
    return;
  }

  if (step.id === "review") {
    const ready = wizard.canGenerate(state.statuses);
    const review = document.createElement("div");
    review.className = ready ? "review-card is-ready" : "review-card needs-review";
    review.textContent = ready
      ? "All choices are valid. Generate the Beamer template when ready."
      : "Some choices need review before generation.";
    replaceChildren(elements.stepContent, [review]);
    return;
  }

  const grid = document.createElement("div");
  grid.className = "option-grid";
  grid.append(...renderOptionCards(step.id));
  replaceChildren(elements.stepContent, [grid]);
}
```

- [ ] **Step 8: Add cumulative preview rendering**

Keep the existing Beamer-like preview logic if available, but make it read only from `state.theme` and `state.registry`.

The required shape is:

```js
function renderPreview() {
  const theme = state.theme;
  const registry = state.registry;
  const font = registry.fonts[theme.fonts.body] || Object.values(registry.fonts)[0];
  const bullet = registry.bullets[theme.bullets.style] || Object.values(registry.bullets)[0];
  const navigation = registry.navigation[theme.navigation.style] || {};

  elements.preview.style.background = theme.colors.background;
  elements.preview.style.color = theme.colors.text;
  elements.preview.style.fontFamily = font.cssFamily;
  elements.preview.style.setProperty("--accent-color", theme.colors.accent);
  elements.preview.style.setProperty("--bullet-marker", JSON.stringify(bullet.cssMarker || "o"));

  const header = document.createElement("div");
  header.className = navigation.hasHeader ? "preview-header has-miniframes" : "preview-header";

  const title = document.createElement("h3");
  title.className = "frame-title";
  title.style.color = theme.colors.primary;
  title.textContent = theme.contentDefaults.sampleTitle;

  const list = document.createElement("ul");
  for (const text of theme.contentDefaults.sampleBullets || []) {
    const item = document.createElement("li");
    item.textContent = text;
    list.appendChild(item);
  }

  const footline = document.createElement("div");
  footline.className = navigation.hasFootline === false ? "preview-footline is-hidden" : "preview-footline";
  footline.textContent = "1 / 3";

  replaceChildren(elements.preview, [header, title, list, footline]);
}
```

- [ ] **Step 9: Add generation guard and boot flow**

Add:

```js
async function generateTheme() {
  refreshStatuses();
  renderSummary();
  if (!wizard.canGenerate(state.statuses)) {
    setBuildStatus("Review required before generation.");
    navigateToStep("review");
    return;
  }
  await saveDraft();
  const result = await api("/api/generate", { method: "POST" });
  setBuildStatus(result);
}

async function compileTheme() {
  await saveDraft();
  const result = await api("/api/compile", { method: "POST" });
  setBuildStatus(result);
}

function render() {
  refreshStatuses();
  renderStepList();
  renderStepContent();
  renderSummary();
  renderPreview();
  const step = currentStep();
  elements.backStep.disabled = step.id === "start";
  elements.nextStep.disabled = step.id === "review";
  elements.reviewGenerate.disabled = !wizard.canGenerate(state.statuses);
}

function bindControls() {
  elements.backStep.addEventListener("click", () => navigateToStep(wizard.previousStepId(currentStep().id)));
  elements.nextStep.addEventListener("click", () => navigateToStep(wizard.nextStepId(currentStep().id)));
  elements.reviewGenerate.addEventListener("click", () => generateTheme().catch((error) => setBuildStatus(error.details || error.message)));
  elements.compileTheme.addEventListener("click", () => compileTheme().catch((error) => setBuildStatus(error.details || error.message)));
  window.addEventListener("popstate", render);
}

async function boot() {
  setBuildStatus("Loading options and theme...");
  const [registry, theme] = await Promise.all([api("/api/options"), api("/api/theme")]);
  state.registry = registry;
  state.theme = theme;
  refreshStatuses();
  bindControls();
  if (window.location.pathname === "/") navigateToStep("start", { replace: true });
  render();
  setStatus("Idle");
  setBuildStatus("No build yet.");
}

boot().catch((error) => {
  setBuildStatus(error.details || error.message);
  setStatus("Error", "is-error");
});
```

- [ ] **Step 10: Run public UI and syntax tests**

Run:

```powershell
node --test tests/public-ui.test.js tests/wizard-state.test.js
npm run check
```

Expected: PASS.

- [ ] **Step 11: Commit**

Run:

```powershell
git add workbench/public/app.js tests/public-ui.test.js
git commit -m "Implement cumulative wizard browser flow"
```

---

### Task 6: Style The Wizard Layout

**Files:**
- Modify: `workbench/public/styles.css`
- Modify: `tests/public-ui.test.js`

- [ ] **Step 1: Add failing CSS structure test**

Append to `tests/public-ui.test.js`:

```js
test("public CSS defines wizard layout, option cards, summary, and preview states", () => {
  const css = readPublicFile("styles.css");
  for (const selector of [
    ".wizard-app",
    ".wizard-rail",
    ".decision-panel",
    ".preview-panel",
    ".summary-panel",
    ".step-link.is-active",
    ".option-card.is-selected",
    ".summary-row[data-state=\"needs-review\"]",
    ".slide-preview",
    ".preview-footline.is-hidden"
  ]) {
    assert.match(css, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
```

- [ ] **Step 2: Run public UI tests to verify failure**

Run:

```powershell
node --test tests/public-ui.test.js
```

Expected: FAIL until the CSS selectors exist.

- [ ] **Step 3: Replace or extend CSS with wizard layout**

Ensure `workbench/public/styles.css` includes:

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

[hidden] {
  display: none !important;
}

.wizard-app {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 220px minmax(300px, 0.9fr) minmax(420px, 1.2fr) 260px;
  gap: 14px;
  padding: 14px;
}

.wizard-rail,
.decision-panel,
.preview-panel,
.summary-panel {
  background: #ffffff;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  padding: 16px;
}

.brand-block h1,
.preview-toolbar h2,
.summary-panel h2,
.step-heading h2 {
  margin: 0;
}

.eyebrow {
  margin: 0 0 4px;
  color: #64748b;
  font-size: 12px;
  text-transform: uppercase;
}

.step-description {
  margin: 8px 0 0;
  color: #475569;
  line-height: 1.4;
}

.step-list,
.summary-list,
.step-content,
.option-grid {
  display: grid;
  gap: 10px;
}

.step-link,
.option-card,
button {
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 10px;
  background: #ffffff;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.step-link.is-active,
.option-card.is-selected {
  border-color: #0f766e;
  box-shadow: inset 0 0 0 1px #0f766e;
}

.option-card {
  min-height: 78px;
  display: grid;
  gap: 6px;
}

.option-title {
  font-weight: 700;
}

.option-meta {
  color: #64748b;
  font-size: 13px;
}

.color-swatches {
  display: flex;
  gap: 4px;
}

.color-swatch {
  width: 24px;
  height: 18px;
  border: 1px solid rgba(15, 23, 42, 0.18);
  border-radius: 3px;
}

.summary-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: center;
  border-bottom: 1px solid #e2e8f0;
  padding: 8px 0;
  font-size: 13px;
}

.summary-row[data-state="needs-review"] {
  color: #b45309;
}

.summary-edit,
.secondary-button {
  background: #f8fafc;
  color: #334155;
}

.wizard-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.wizard-actions button,
#reviewGenerate,
#compileTheme {
  text-align: center;
}

#reviewGenerate {
  width: 100%;
  background: #0f766e;
  color: #ffffff;
  border-color: #0f766e;
}

.preview-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 14px;
}

.status {
  padding: 4px 8px;
  border-radius: 999px;
  background: #e2e8f0;
  color: #334155;
  font-size: 12px;
}

.status.is-saved {
  background: #dcfce7;
  color: #166534;
}

.status.is-error {
  background: #fee2e2;
  color: #991b1b;
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

.frame-title {
  margin: 0 0 6%;
  font-size: 28px;
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

.preview-header.has-miniframes {
  height: 10px;
  border-top: 4px solid currentColor;
  margin-bottom: 16px;
  opacity: 0.45;
}

.preview-footline {
  margin-top: auto;
  border-top: 3px solid currentColor;
  padding-top: 8px;
  font-size: 12px;
  display: flex;
  justify-content: flex-end;
}

.preview-footline.is-hidden {
  display: none;
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

@media (max-width: 1100px) {
  .wizard-app {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 4: Run public UI tests**

Run:

```powershell
node --test tests/public-ui.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add workbench/public/styles.css tests/public-ui.test.js
git commit -m "Style cumulative workbench wizard"
```

---

### Task 7: Block Generation For Review-Needed Steps

**Files:**
- Modify: `workbench/public/app.js`
- Modify: `tests/public-ui.test.js`

- [ ] **Step 1: Add failing generation guard test**

Append to `tests/public-ui.test.js`:

```js
test("browser generation is blocked until wizard statuses are complete", () => {
  const script = readPublicFile("app.js");
  assert.match(script, /Review required before generation/);
  assert.match(script, /reviewGenerate\.disabled = !wizard\.canGenerate\(state\.statuses\)/);
  assert.match(script, /navigateToStep\("review"\)/);
});
```

- [ ] **Step 2: Run test to verify failure if guard is missing**

Run:

```powershell
node --test tests/public-ui.test.js
```

Expected: FAIL if Task 5 did not include the guard exactly.

- [ ] **Step 3: Implement or correct the guard**

In `generateTheme`, ensure this block appears before `/api/generate`:

```js
refreshStatuses();
renderSummary();
if (!wizard.canGenerate(state.statuses)) {
  setBuildStatus("Review required before generation.");
  navigateToStep("review");
  return;
}
```

In `render`, ensure:

```js
elements.reviewGenerate.disabled = !wizard.canGenerate(state.statuses);
```

- [ ] **Step 4: Run tests**

Run:

```powershell
node --test tests/public-ui.test.js tests/wizard-state.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add workbench/public/app.js tests/public-ui.test.js
git commit -m "Block generation until wizard review passes"
```

---

### Task 8: Update README And Supersede Old Plan UI Task

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-06-26-html-beamer-workbench.md`

- [ ] **Step 1: Add README section**

Insert after the workflow overview in `README.md`:

````markdown
## Cumulative HTML Wizard

The local HTML wizard designs a Beamer template one decision at a time while keeping `theme.json` as the source of truth.

```bash
npm test
npm start
```

Open `http://localhost:5177/start`.

The wizard flow is:

```text
Default Template -> Color -> Font -> Bullets -> Blocks -> Navigation -> Title Page -> Review & Generate
```

Each step previews the accumulated choices. Users can go back to an earlier step and keep later compatible choices. Generation is blocked until every step is valid.
````

- [ ] **Step 2: Add superseded note to old plan**

Add this note near the top of `docs/superpowers/plans/2026-06-26-html-beamer-workbench.md`:

```markdown
> Superseded UI note: Task 8's single-screen browser workbench UI has been
> replaced by `docs/superpowers/plans/2026-06-28-cumulative-workbench-wizard.md`.
> Foundation tasks for schema, registry, generator, server, and build remain
> useful unless contradicted by the newer plan.
```

- [ ] **Step 3: Run documentation grep**

Run:

```powershell
rg "single-screen|one live workbench|rather than a rigid wizard" README.md docs\superpowers\plans docs\superpowers\specs
```

Expected: Only historical superseded notes should mention the old single-screen direction.

- [ ] **Step 4: Commit**

Run:

```powershell
git add README.md docs/superpowers/plans/2026-06-26-html-beamer-workbench.md
git commit -m "Document cumulative workbench wizard flow"
```

---

### Task 9: Final Verification

**Files:**
- No code changes expected.

- [ ] **Step 1: Run full tests**

Run:

```powershell
npm test
```

Expected: PASS.

- [ ] **Step 2: Run syntax checks**

Run:

```powershell
npm run check
```

Expected: PASS.

- [ ] **Step 3: Run CLI generation**

Run:

```powershell
npm run generate -- --out templates/generated
```

Expected: PASS and these files exist:

```text
templates/generated/main.tex
templates/generated/theme.cls
templates/generated/theme.json
templates/generated/content/overview.tex
```

- [ ] **Step 4: Run compile smoke**

Run:

```powershell
npm run smoke:compile
```

Expected if a compiler is available: PASS with `"status": "compiled"`.

Expected if a compiler is missing: exit code 2 with `"status": "missing-compiler"`. In that case, report the implementation as code-complete but not compile-verified.

- [ ] **Step 5: Start server**

Run:

```powershell
npm start
```

Expected: server prints:

```text
BeamerForge workbench running at http://localhost:5177
```

- [ ] **Step 6: Browser smoke flow**

Open:

```text
http://localhost:5177/start
```

Verify:

1. `/start` shows the default template preview.
2. `Next` moves through `/color`, `/font`, `/bullets`, `/blocks`, `/navigation`, `/title-page`, and `/review`.
3. Changing color updates previews on later steps.
4. Going back to color after choosing font and bullets does not reset font or bullets.
5. Summary rows show selected labels.
6. A forced invalid ID in `workbench/state/theme.json` produces `needs review`.
7. Review page blocks generation while `needs review` is present.
8. Generate creates `templates/<theme-name>/main.tex` and `templates/<theme-name>/theme.cls`.

- [ ] **Step 7: Commit final verification note if docs changed**

If verification notes are added to documentation, run:

```powershell
git add README.md docs
git commit -m "Record cumulative wizard verification"
```

If no files changed, do not create an empty commit.

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

## Self-Review Notes

- Spec coverage: the plan covers default template, step routes, cumulative preview, non-destructive backtracking, one `theme.json` source of truth, review blocking, generation, and compile smoke.
- Completeness scan: every task has concrete files, commands, and expected results.
- Type consistency: step IDs are `start`, `color`, `font`, `bullets`, `blocks`, `navigation`, `title-page`, and `review`; routes are `/start`, `/color`, `/font`, `/bullets`, `/blocks`, `/navigation`, `/title-page`, and `/review`; theme sections match the approved spec.
