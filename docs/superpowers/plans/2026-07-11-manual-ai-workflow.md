# Manual Design and AI Customization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend BeamerForge from a manual-only wizard into a two-phase workflow that freezes a manual baseline, exports a portable external-agent handoff, validates and compares an imported AI draft, and generates the explicitly accepted theme.

**Architecture:** Keep theme-state transitions, handoff filesystem work, semantic comparison, and HTTP/UI concerns in separate modules. The browser uploads optional references into a staging request; the server publishes a complete handoff atomically, while AI drafts remain separate from the protected baseline until explicit acceptance.

**Tech Stack:** Node.js 20 CommonJS, built-in `node:http`, `node:fs`, Web `Request.formData()`, browser JavaScript/CSS, Node test runner, existing BeamerForge schema and generator.

---

## File Map

- Create `workbench/theme-state.js`: baseline, draft, accepted-theme reads and atomic state transitions.
- Create `workbench/theme-diff.js`: semantic comparison of two validated themes.
- Create `workbench/ai-handoff.js`: brief persistence, safe reference normalization, atomic handoff publication, and AI-draft import.
- Create `tests/theme-state.test.js`: isolated theme-state transition tests.
- Create `tests/theme-diff.test.js`: semantic-difference tests.
- Create `tests/ai-handoff.test.js`: handoff, reference, size, collision, and import safety tests.
- Modify `workbench/server.js`: add phase-two routes and multipart request handling while keeping routing thin.
- Modify `workbench/public/wizard-state.js`: define both phases, route order, and route prerequisites.
- Modify `workbench/public/index.html`: add AI customization, handoff, import, comparison, and final-review regions.
- Modify `workbench/public/app.js`: render and drive both phases through the new APIs.
- Modify `workbench/public/styles.css`: phase indicator, reference controls, comparison grid, and change list.
- Modify `tests/server.test.js`: API integration, route shell, upload, acceptance, and restore tests.
- Modify `tests/wizard-state.test.js`: new route order and gating tests.
- Modify `tests/public-ui.test.js`: static UI contract tests for the two-phase flow.
- Modify `README.md` and `WORKFLOW.md`: document manual-first and external-agent customization.

## Task 1: Protected theme-state transitions

**Files:**
- Create: `workbench/theme-state.js`
- Create: `tests/theme-state.test.js`

- [ ] **Step 1: Write failing baseline and acceptance tests**

Create `tests/theme-state.test.js` with temporary directories and these assertions:

```js
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
```

- [ ] **Step 2: Run the focused test and verify the missing-module failure**

Run: `node --test tests/theme-state.test.js`

Expected: FAIL with `Cannot find module '../workbench/theme-state'`.

- [ ] **Step 3: Implement atomic theme-state helpers**

Create `workbench/theme-state.js` with this public contract:

```js
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

module.exports = { FILES, atomicWriteJson, freezeManualTheme, readManualTheme, saveAiDraft, readAiDraft, acceptAiDraft, restoreManualTheme };
```

- [ ] **Step 4: Run the focused test**

Run: `node --test tests/theme-state.test.js`

Expected: 2 tests pass.

- [ ] **Step 5: Commit the isolated state layer**

```powershell
git add workbench/theme-state.js tests/theme-state.test.js
git commit -m "feat: add protected theme states"
```

## Task 2: Semantic theme differences

**Files:**
- Create: `workbench/theme-diff.js`
- Create: `tests/theme-diff.test.js`

- [ ] **Step 1: Write failing semantic-difference tests**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_THEME } = require("../schema/theme-schema");
const { diffThemes } = require("../workbench/theme-diff");

test("diffThemes reports user-facing changes and ignores identical values", () => {
  const draft = structuredClone(DEFAULT_THEME);
  draft.colors.primary = "#A14D3A";
  draft.fonts.title = "playfair-display";
  assert.deepEqual(diffThemes(DEFAULT_THEME, draft), [
    { path: "colors.primary", label: "Primary color", before: DEFAULT_THEME.colors.primary, after: "#A14D3A" },
    { path: "fonts.title", label: "Title font", before: DEFAULT_THEME.fonts.title, after: "playfair-display" }
  ]);
});

test("diffThemes returns an empty list for equivalent themes", () => {
  assert.deepEqual(diffThemes(DEFAULT_THEME, structuredClone(DEFAULT_THEME)), []);
});
```

- [ ] **Step 2: Verify the test fails**

Run: `node --test tests/theme-diff.test.js`

Expected: FAIL because `workbench/theme-diff.js` does not exist.

- [ ] **Step 3: Implement a stable, allow-listed semantic diff**

Implement `diffThemes(before, after)` using an ordered field list rather than a generic JSON diff:

```js
const FIELDS = [
  ["colors.paletteId", "Palette"], ["colors.primary", "Primary color"],
  ["colors.accent", "Accent color"], ["colors.background", "Background color"],
  ["colors.text", "Text color"], ["fonts.body", "Body font"],
  ["fonts.title", "Title font"], ["bullets.style", "Bullet style"],
  ["blocks.style", "Block style"], ["navigation.style", "Navigation"],
  ["titlePage.layout", "Title page"], ["foundation.aspectRatio", "Aspect ratio"]
];

function valueAt(object, fieldPath) {
  return fieldPath.split(".").reduce((value, key) => value == null ? undefined : value[key], object);
}

function diffThemes(before, after) {
  return FIELDS.flatMap(([fieldPath, label]) => {
    const oldValue = valueAt(before, fieldPath);
    const newValue = valueAt(after, fieldPath);
    return Object.is(oldValue, newValue) ? [] : [{ path: fieldPath, label, before: oldValue, after: newValue }];
  });
}
```

Extend `FIELDS` only with actual properties confirmed in `DEFAULT_THEME`; do not expose identity or sample-content changes as visual customization.

- [ ] **Step 4: Run the focused tests**

Run: `node --test tests/theme-diff.test.js`

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```powershell
git add workbench/theme-diff.js tests/theme-diff.test.js
git commit -m "feat: summarize AI theme changes"
```

## Task 3: Atomic external-agent handoff

**Files:**
- Create: `workbench/ai-handoff.js`
- Create: `tests/ai-handoff.test.js`

- [ ] **Step 1: Write failing handoff publication tests**

Test that `createHandoff({ stateDir, handoffRoot, brief, references })` writes the protected baseline, brief, deterministic agent instructions, and safe relative reference names. Include image and nested Beamer files represented as `{ name, relativePath, bytes }`.

```js
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
```

Add tests that reject `../escape.tex`, absolute paths, duplicate case-insensitive destinations, symlink-like entries, files over 20 MiB, aggregate input over 100 MiB, and unsupported extensions. Assert that a failed publication leaves the previous completed handoff unchanged.

- [ ] **Step 2: Verify the focused test fails**

Run: `node --test tests/ai-handoff.test.js`

Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement handoff validation and atomic publication**

Export these constants and functions from `workbench/ai-handoff.js`:

```js
const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".pdf", ".tex", ".sty", ".cls", ".bib", ".svg"]);
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;

function normalizeReferencePath(value) {
  const normalized = String(value).replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized.split("/").includes("..") || path.isAbsolute(value)) {
    throw Object.assign(new Error("Unsafe reference path"), { statusCode: 400 });
  }
  return normalized;
}
```

Implement `createHandoff` by validating every entry before writing, writing to `${handoffRoot}.tmp-${process.pid}`, and renaming the temporary directory only when complete. Preserve an existing published handoff by first renaming it to a sibling backup, restoring it if final rename fails, and deleting the backup after success. Use native filesystem APIs end-to-end.

Generate `instructions.md` with the closed contract: read `manual-theme.json`, follow `customization-brief.md`, treat `references/` as inspiration, change only schema-supported fields, write a complete `ai-draft-theme.json`, and never emit raw LaTeX fields or edit the manual baseline.

- [ ] **Step 4: Run handoff tests**

Run: `node --test tests/ai-handoff.test.js`

Expected: all handoff and safety tests pass.

- [ ] **Step 5: Commit**

```powershell
git add workbench/ai-handoff.js tests/ai-handoff.test.js
git commit -m "feat: export external AI handoffs"
```

## Task 4: AI-draft import and closed-schema enforcement

**Files:**
- Modify: `schema/theme-schema.js`
- Modify: `workbench/ai-handoff.js`
- Modify: `tests/schema.test.js`
- Modify: `tests/ai-handoff.test.js`

- [ ] **Step 1: Add failing tests for unknown and prohibited fields**

Add schema assertions that a valid theme plus `rawLatex`, an unknown nested palette key, or an unknown top-level key returns `ok: false` with the exact offending path. Add import tests showing `importAiDraft` does not write `ai-draft-theme.json` when validation fails.

```js
const malicious = structuredClone(DEFAULT_THEME);
malicious.rawLatex = "\\usepackage{shellesc}";
const result = validateTheme(malicious);
assert.equal(result.ok, false);
assert.ok(result.errors.some((error) => error.path === "rawLatex" && error.message === "is not allowed"));
```

- [ ] **Step 2: Run focused tests and confirm they fail for silently ignored keys**

Run: `node --test tests/schema.test.js tests/ai-handoff.test.js`

Expected: FAIL because unknown keys are not yet rejected and `importAiDraft` is absent.

- [ ] **Step 3: Add closed-object validation**

In `schema/theme-schema.js`, add a reusable helper and call it for the root and every nested object before normalization:

```js
function rejectUnknownKeys(value, allowed, basePath, errors) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push({ path: basePath ? `${basePath}.${key}` : key, message: "is not allowed" });
  }
}
```

Derive each allowed set directly from the existing normalized output shape. Preserve all existing defaulting and registry validation behavior for known keys.

- [ ] **Step 4: Implement validated draft import**

Add `importAiDraft({ stateDir, draftBuffer, registry })` to `workbench/ai-handoff.js`. Reject buffers over 1 MiB, malformed JSON, incomplete themes, unknown keys, and schema failures. On success call `saveAiDraft(stateDir, validation.value)` and return `{ ok: true, theme: validation.value }`; on schema failure return `{ ok: false, errors }` without writing.

- [ ] **Step 5: Run focused and full tests**

Run: `node --test tests/schema.test.js tests/ai-handoff.test.js`

Expected: all focused tests pass.

Run: `npm test`

Expected: the full suite passes; update existing fixtures only where they contain genuinely unknown properties.

- [ ] **Step 6: Commit**

```powershell
git add schema/theme-schema.js workbench/ai-handoff.js tests/schema.test.js tests/ai-handoff.test.js
git commit -m "feat: validate closed AI theme drafts"
```

## Task 5: Phase-two HTTP API

**Files:**
- Modify: `workbench/server.js`
- Modify: `tests/server.test.js`

- [ ] **Step 1: Write failing API integration tests**

Add tests for these endpoints and status rules:

```text
POST /api/manual-baseline       200 valid current theme; 400 invalid theme
GET  /api/manual-baseline       200 existing; 404 missing
POST /api/ai/handoff            200 multipart brief/references; 409 missing baseline
GET  /api/ai/handoff            200 path/status; 404 missing
POST /api/ai/import             200 valid JSON file; 400 invalid draft; 409 missing baseline
GET  /api/ai/comparison         200 baseline/draft/changes; 409 missing prerequisite
POST /api/ai/accept             200 and current theme becomes draft
POST /api/ai/restore            200 and current theme becomes baseline
```

Build multipart bodies in tests with native `FormData` and `Blob`. Verify filenames such as `source/main.tex` are normalized from the submitted `relativePaths` JSON and that count mismatches are rejected.

- [ ] **Step 2: Run server tests and confirm 404/405 failures**

Run: `node --test tests/server.test.js`

Expected: new endpoint tests fail because the routes do not exist.

- [ ] **Step 3: Add bounded JSON and multipart request adapters**

Keep adapters in `workbench/server.js` but outside `createWorkbenchServer`:

```js
async function readMultipart(req) {
  const contentLength = Number(req.headers["content-length"] || 0);
  if (contentLength > 101 * 1024 * 1024) throw httpError(413, "Upload too large");
  const request = new Request("http://localhost/upload", {
    method: "POST", headers: req.headers, body: req, duplex: "half"
  });
  return request.formData();
}
```

Require multipart fields `brief`, zero or more `references`, and a `relativePaths` JSON array aligned by index. Convert each uploaded `File` into `{ name, relativePath, bytes: Buffer.from(await file.arrayBuffer()) }` before passing it to `createHandoff`.

- [ ] **Step 4: Implement thin endpoint handlers**

Inject or import `theme-state`, `ai-handoff`, and `theme-diff` functions. Each handler validates prerequisites, delegates domain work, and sends JSON. Map missing baseline/draft to 409, missing published handoff to 404, validation errors to 400, oversized input to 413, and unexpected failures to 500.

Extend `WIZARD_ROUTES` with `/manual-review`, `/ai-customize`, `/ai-handoff`, `/ai-import`, `/ai-compare`, and `/final-review`; remove `/review` only after the UI migration task.

- [ ] **Step 5: Run server and full tests**

Run: `node --test tests/server.test.js`

Expected: all server tests pass.

Run: `npm test`

Expected: full suite passes.

- [ ] **Step 6: Commit**

```powershell
git add workbench/server.js tests/server.test.js
git commit -m "feat: expose manual and AI workflow APIs"
```

## Task 6: Two-phase wizard state and route gating

**Files:**
- Modify: `workbench/public/wizard-state.js`
- Modify: `tests/wizard-state.test.js`

- [ ] **Step 1: Write failing route-order and gating tests**

Update the expected route list to:

```js
[
  "/start", "/color", "/font", "/bullets", "/blocks", "/navigation",
  "/title-page", "/manual-review", "/ai-customize", "/ai-handoff",
  "/ai-import", "/ai-compare", "/final-review"
]
```

Test `canEnterStep(stepId, workflow)` with `{ hasManualBaseline, hasHandoff, hasValidAiDraft, selectedVersion }`. Manual steps always use existing completeness rules; AI customization requires the baseline; import requires a handoff; comparison requires a valid draft; final review requires `selectedVersion` equal to `manual` or `ai`.

- [ ] **Step 2: Run and verify failures**

Run: `node --test tests/wizard-state.test.js`

Expected: route-order and missing `canEnterStep` tests fail.

- [ ] **Step 3: Implement explicit phase metadata and gating**

Give every step a `phase: "manual" | "ai" | "final"` property. Export:

```js
function canEnterStep(stepId, workflow) {
  if (stepId === "ai-customize") return workflow.hasManualBaseline;
  if (stepId === "ai-handoff") return workflow.hasManualBaseline;
  if (stepId === "ai-import") return workflow.hasHandoff;
  if (stepId === "ai-compare") return workflow.hasValidAiDraft;
  if (stepId === "final-review") return ["manual", "ai"].includes(workflow.selectedVersion);
  return true;
}
```

Keep `canGenerate` for manual-step validity and introduce `canFinalize(workflow)` for the final accepted-selection condition.

- [ ] **Step 4: Run focused tests**

Run: `node --test tests/wizard-state.test.js`

Expected: all wizard-state tests pass.

- [ ] **Step 5: Commit**

```powershell
git add workbench/public/wizard-state.js tests/wizard-state.test.js
git commit -m "feat: model two-phase wizard navigation"
```

## Task 7: AI customization, handoff, import, and comparison UI

**Files:**
- Modify: `workbench/public/index.html`
- Modify: `workbench/public/app.js`
- Modify: `workbench/public/styles.css`
- Modify: `tests/public-ui.test.js`

- [ ] **Step 1: Add failing public UI contract tests**

Assert the HTML contains `data-region="phase-progress"`, `data-region="ai-customize"`, inputs `#ai-brief`, `#image-references`, `#beamer-references`, regions `#handoff-status`, `#manual-comparison-preview`, `#ai-comparison-preview`, `#ai-change-list`, and buttons for freeze, export, import, accept, revise, keep manual, restore, and generate.

Assert `app.js` references every new API endpoint and uses `FormData`, `webkitdirectory`, semantic change rendering, and explicit acceptance actions. Assert CSS includes a responsive `.comparison-grid` that collapses to one column.

- [ ] **Step 2: Run static UI tests and verify failures**

Run: `node --test tests/public-ui.test.js`

Expected: FAIL for missing phase-two regions and controls.

- [ ] **Step 3: Add accessible phase-two markup**

Add one main region per route while reusing the existing cumulative wizard shell. Use a textarea for the brief, separate image and folder inputs, status output with `aria-live="polite"`, and labeled baseline/draft previews. Set the Beamer folder input with `webkitdirectory` and `multiple`; keep an ordinary multi-file fallback.

- [ ] **Step 4: Split phase-two behavior into focused functions**

In `app.js`, add named functions rather than extending the main render branch indefinitely:

```js
async function freezeManualBaseline() {}
async function exportAiHandoff() {}
async function importAiDraft() {}
async function loadAiComparison() {}
async function selectFinalVersion(version) {}
function renderThemeChanges(changes) {}
function renderPhaseProgress() {}
```

`exportAiHandoff` builds `FormData`, appends uploaded files, and appends a parallel `relativePaths` array using `file.webkitRelativePath || file.name`. `loadAiComparison` renders both previews using the existing preview renderer with an explicit theme argument; refactor that renderer only enough to avoid mutating global `state.theme`.

- [ ] **Step 5: Implement navigation and recovery behavior**

Change manual review’s primary action to freeze and navigate to `/ai-customize`; retain “Generate manual version” as the skip action. Invalid imports stay on `/ai-import` with field errors. “Continue revising” returns to `/ai-handoff` without deleting the draft. “Keep manual” and “Restore manual” call `/api/ai/restore`; “Accept AI” calls `/api/ai/accept`.

- [ ] **Step 6: Add responsive styling**

Use a two-column comparison at wide widths and one column below 900px. Add clear phase labels, equal preview dimensions, a compact difference list, and visible selected-version state. Reuse existing palette, spacing, focus, disabled, and error tokens.

- [ ] **Step 7: Run UI, state, and full tests**

Run: `node --test tests/public-ui.test.js tests/wizard-state.test.js`

Expected: all focused tests pass.

Run: `npm test`

Expected: full suite passes.

- [ ] **Step 8: Commit**

```powershell
git add workbench/public/index.html workbench/public/app.js workbench/public/styles.css tests/public-ui.test.js
git commit -m "feat: add AI customization workflow UI"
```

## Task 8: End-to-end workflow regression

**Files:**
- Modify: `tests/server.test.js`
- Modify: `tests/public-ui.test.js`

- [ ] **Step 1: Add a failing end-to-end state-transition test**

Within one server fixture: save a valid manual theme, freeze it, export a handoff with an image and nested `.tex` reference, import a valid customized draft, fetch comparison changes, accept the AI version, invoke generation, restore manual, and verify a second generation receives the baseline. Capture the injected `writeTemplateProject` themes to prove generation uses the explicit selection.

- [ ] **Step 2: Run the end-to-end test**

Run: `node --test --test-name-pattern="manual to AI handoff" tests/server.test.js`

Expected: FAIL at the first integration mismatch uncovered by the complete sequence.

- [ ] **Step 3: Make only the minimal integration corrections**

Correct endpoint payload names, state refresh timing, or route prerequisite responses identified by Step 2. Do not add new product behavior in this task.

- [ ] **Step 4: Run all automated verification**

Run: `npm run check`

Expected: exit 0 with all JavaScript syntax checks passing. Add `node --check workbench/theme-state.js`, `node --check workbench/theme-diff.js`, and `node --check workbench/ai-handoff.js` to the `check` script if not already covered.

Run: `npm test`

Expected: all tests pass with zero failures.

- [ ] **Step 5: Commit**

```powershell
git add package.json tests/server.test.js tests/public-ui.test.js
git commit -m "test: cover complete manual AI workflow"
```

## Task 9: Documentation and manual verification

**Files:**
- Modify: `README.md`
- Modify: `WORKFLOW.md`

- [ ] **Step 1: Update user documentation**

Replace the old single-flow summary with the manual-first two-phase sequence. Document how to start the workbench, freeze a baseline, add optional image or Beamer references, locate the handoff, ask an external agent to populate `ai-draft-theme.json`, import it, compare versions, and generate either selection. State explicitly that the workbench does not upload references or call a model.

- [ ] **Step 2: Run the application for manual QA**

Run: `npm start`

Expected: server reports the local workbench URL and remains running.

Exercise this checklist in the browser:

```text
[ ] Complete all manual steps and reach Manual Review.
[ ] Freeze the baseline and verify the AI phase unlocks.
[ ] Export a brief with one image and one nested Beamer folder.
[ ] Confirm the handoff contains the baseline, brief, instructions, and references.
[ ] Import a deliberately invalid draft and see field-level errors without state loss.
[ ] Import a valid changed draft and compare both previews.
[ ] Accept AI, generate, and compile or receive the normal missing-compiler message.
[ ] Restore manual and confirm the preview and generated selection change back.
[ ] Verify comparison layout at desktop and narrow viewport widths.
```

- [ ] **Step 3: Run final verification**

Run: `npm run check`

Expected: exit 0.

Run: `npm test`

Expected: all tests pass.

Run: `npm run smoke:compile`

Expected: representative generated themes compile when a supported LaTeX engine is installed; otherwise the command reports the established missing-compiler status without corrupting output.

- [ ] **Step 4: Commit documentation**

```powershell
git add README.md WORKFLOW.md
git commit -m "docs: explain manual and AI design phases"
```

## Final Review Checklist

- [ ] Confirm `manual-theme.json` is never changed by import, comparison, acceptance, generation, or restore operations.
- [ ] Confirm every AI result passes closed-schema validation before persistence or preview.
- [ ] Confirm references never leave the local handoff and are never executed.
- [ ] Confirm both manual-only and manual-then-AI paths generate a complete Beamer project.
- [ ] Confirm no raw LaTeX customization field was introduced.
- [ ] Confirm `npm run check`, `npm test`, and proportional compile verification pass.
