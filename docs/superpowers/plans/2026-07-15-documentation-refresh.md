# BeamerForge Documentation Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align BeamerForge's current-facing documentation with the implemented workbench workflow, registry, architecture, and repository structure, with automated drift detection.

**Architecture:** Treat `README.md` as the concise landing page, `WORKFLOW.md` as the canonical user journey, and `ARCHITECTURE.md` as the canonical module and state-flow map. A Node test reads those files, resolves local links against the filesystem, and validates documented theme JSON identifiers against `registry/options.js`.

**Tech Stack:** GitHub-flavored Markdown, Node.js 20 built-in test runner, CommonJS registry module.

---

## File Structure

- Create `tests/documentation-consistency.test.js`: documentation link, workflow, path, and registry contract.
- Modify `README.md`: concise landing page, current quick start, workflow summary, current examples, and documentation links.
- Rewrite `WORKFLOW.md`: canonical normal, manual-only, optional AI, advanced compatibility, and build journeys.
- Rewrite `ARCHITECTURE.md`: current registry, schema, workbench, AI, generation, compilation, and asset architecture.
- Verify `GUIDE.md`: retain the design-review checklist without unrelated rewriting.

### Task 1: Add the failing documentation contract

**Files:**
- Create: `tests/documentation-consistency.test.js`

- [ ] **Step 1: Create the documentation consistency test**

Create `tests/documentation-consistency.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getRegistry } = require('../registry/options');

const root = path.resolve(__dirname, '..');
const currentDocs = ['README.md', 'WORKFLOW.md', 'ARCHITECTURE.md'];
const canonicalStages = [
  'Welcome',
  'Direction',
  'Style',
  'Details',
  'Review',
  'Optional AI refinement',
  'Build',
];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assertStagesInOrder(content, file) {
  let previous = -1;
  for (const stage of canonicalStages) {
    const index = content.indexOf(stage, previous + 1);
    assert.notEqual(index, -1, `${file} is missing workflow stage: ${stage}`);
    assert.ok(index > previous, `${file} has workflow stages out of order at: ${stage}`);
    previous = index;
  }
}

function localMarkdownTargets(content) {
  return [...content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)]
    .map((match) => match[1].trim())
    .filter((target) => !/^(?:https?:|mailto:|#)/i.test(target))
    .map((target) => target.split('#')[0]);
}

function jsonBlocks(content) {
  return [...content.matchAll(/```json\s*([\s\S]*?)```/g)]
    .map((match) => JSON.parse(match[1]));
}

test('README and WORKFLOW present the canonical workflow in order', () => {
  assertStagesInOrder(read('README.md'), 'README.md');
  assertStagesInOrder(read('WORKFLOW.md'), 'WORKFLOW.md');
});

test('current-facing documentation has no legacy paths or broken local links', () => {
  const forbidden = ['templates/', 'CONTRIBUTING.md', 'elements/typography/', 'typography/sans-serif-modern', 'layout/16-9-single'];

  for (const file of currentDocs) {
    const content = read(file);
    for (const fragment of forbidden) {
      assert.equal(content.includes(fragment), false, `${file} still references ${fragment}`);
    }
    for (const target of localMarkdownTargets(content)) {
      const resolved = path.resolve(root, path.dirname(file), target);
      assert.equal(fs.existsSync(resolved), true, `${file} links to missing ${target}`);
    }
  }
});

test('documented theme JSON uses current registry identifiers', () => {
  const registry = getRegistry();
  const blocks = currentDocs.flatMap((file) => jsonBlocks(read(file)));
  assert.ok(blocks.length > 0, 'current documentation needs at least one theme JSON example');

  for (const example of blocks) {
    if (example.colors?.paletteId) assert.ok(registry.palettes[example.colors.paletteId], `unknown palette ${example.colors.paletteId}`);
    if (example.fonts?.body) assert.ok(registry.fonts[example.fonts.body], `unknown body font ${example.fonts.body}`);
    if (example.fonts?.title) assert.ok(registry.fonts[example.fonts.title], `unknown title font ${example.fonts.title}`);
    if (example.bullets?.style) assert.ok(registry.bullets[example.bullets.style], `unknown bullet ${example.bullets.style}`);
    if (example.blocks?.style) assert.ok(registry.blocks[example.blocks.style], `unknown block ${example.blocks.style}`);
    if (example.navigation?.style) assert.ok(registry.navigation[example.navigation.style], `unknown navigation ${example.navigation.style}`);
    if (example.titlePage?.layout) assert.ok(registry.titlePages[example.titlePage.layout], `unknown title page ${example.titlePage.layout}`);
  }
});

test('README retains branding and links to canonical documentation', () => {
  const readme = read('README.md');
  assert.match(readme, /assets\/branding\/beamerforge-logo\.svg/);
  assert.match(readme, /\[Workflow\]\(WORKFLOW\.md\)/);
  assert.match(readme, /\[Architecture\]\(ARCHITECTURE\.md\)/);
  assert.match(readme, /\[Design review guide\]\(GUIDE\.md\)/);
});

test('architecture names the implemented module boundaries', () => {
  const architecture = read('ARCHITECTURE.md');
  for (const modulePath of [
    'registry/options.js',
    'schema/theme-schema.js',
    'design/resolve-design.js',
    'workbench/public/',
    'workbench/server.js',
    'workbench/ai/',
    'generators/',
    'workbench/build.js',
  ]) {
    assert.match(architecture, new RegExp(modulePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
```

- [ ] **Step 2: Run the contract to verify it fails for the documented drift**

Run:

```powershell
node --test tests/documentation-consistency.test.js
```

Expected: failures identify missing canonical stages, legacy paths, broken `CONTRIBUTING.md`, obsolete registry examples, and missing current module names.

- [ ] **Step 3: Commit the failing documentation contract**

```powershell
git add tests/documentation-consistency.test.js
git commit -m "test: define current documentation contract"
```

### Task 2: Make README the concise landing page

**Files:**
- Modify: `README.md`
- Test: `tests/documentation-consistency.test.js`

- [ ] **Step 1: Preserve the approved cover and replace duplicate workflow material**

Keep the existing logo, centered title, tagline, and AI-era LaTeX introduction. Replace the content from `## How It Works` through the old catalog-structure section with these sections and wording:

```markdown
## Why BeamerForge

- **AI-readable source:** LaTeX projects are plain text, structured, reviewable, and easy for models to transform.
- **Reproducible output:** the same validated source can be compiled into the same presentation instead of being trapped in an opaque slide binary.
- **Deliberate visual design:** curated palettes, typography, bullets, blocks, navigation, and title-page patterns give AI a design vocabulary rather than a blank canvas.
- **Human control:** every choice remains inspectable, editable, and reversible; AI refinement is optional.

## Quick Start

```bash
npm start
```

Open `http://localhost:5177/welcome` and select **Start designing**. Manual design, preview, project generation, and downloads do not require an AI provider. A local LaTeX compiler is required only for the final PDF.

## Workflow

```text
Welcome -> Direction -> Style -> Details -> Review -> Optional AI refinement -> Build
```

1. **Welcome:** see what BeamerForge produces and begin a design session.
2. **Direction:** describe the desired feeling and compare curated visual directions.
3. **Style:** choose compatible color and type combinations.
4. **Details:** tune bullets, blocks, navigation, and title-page layout.
5. **Review:** validate the cumulative manual design and freeze a protected baseline.
6. **Optional AI refinement:** request a change in ordinary language, compare it with the protected manual version, and explicitly choose one.
7. **Build:** generate the complete editable Beamer project and compile a PDF when a supported LaTeX compiler is available.

See the detailed [Workflow](WORKFLOW.md) for navigation, validation, manual-only use, AI comparison, and advanced handoff/import behavior.

## Optional AI Refinement

At Review, choose **Refine with AI** only when you want a suggestion. Your reviewed manual design remains protected while BeamerForge creates a separate schema-validated candidate. You can compare both versions, revise the request, keep the manual design, or accept the suggestion.

API keys entered in the connection dialog live only in the running local server process. They are not written to theme files, browser storage, handoff folders, logs, or connection-status responses. You may instead set `OPENAI_API_KEY` or `DEEPSEEK_API_KEY` before running `npm start`. Compatible remote endpoints must use HTTPS; loopback HTTP endpoints are allowed for local models.

## Current Theme Example

```json
{
  "colors": { "paletteId": "academic-blue" },
  "fonts": { "body": "fira-sans", "title": "playfair-display" },
  "bullets": { "style": "triangle" },
  "blocks": { "style": "rounded" },
  "navigation": { "style": "soft-miniframes" },
  "titlePage": { "layout": "left-curtain" }
}
```

The complete theme schema contains additional presentation identity, content defaults, decoration, and transition fields. The workbench writes a validated complete theme before generation.
```

- [ ] **Step 2: Keep the recipe catalog and replace the legacy AI/contribution tail**

Keep the existing D Rose and Bamboo recipe tables. Replace `## For AI Users` through the broken contribution section with:

```markdown
## Documentation

- [Workflow](WORKFLOW.md) — the complete normal, manual-only, optional AI, and advanced compatibility journeys.
- [Architecture](ARCHITECTURE.md) — modules, state boundaries, rendering, AI orchestration, generation, and compilation.
- [Design review guide](GUIDE.md) — human checks for hierarchy, typography, color, spacing, and slide composition.
- [`elements/`](elements/) — source assets and visual references.
- [`recipes/`](recipes/) — complete compilable examples.

## License

MIT
```

- [ ] **Step 3: Run the README-specific contract tests**

Run:

```powershell
node --test --test-name-pattern="README|registry identifiers|legacy paths" tests/documentation-consistency.test.js
```

Expected: README branding, stage-order, JSON registry, and local-link assertions pass; workflow and architecture assertions may still fail until Tasks 3 and 4.

- [ ] **Step 4: Commit the concise README**

```powershell
git add README.md
git commit -m "docs: make README a current concise landing page"
```

### Task 3: Rewrite the canonical workflow

**Files:**
- Rewrite: `WORKFLOW.md`
- Test: `tests/documentation-consistency.test.js`

- [ ] **Step 1: Replace `WORKFLOW.md` with the implemented journey**

The replacement must contain these exact top-level sections in order:

```markdown
# BeamerForge Workflow

## Core Principle
## Canonical Journey
## 1. Welcome
## 2. Direction
## 3. Style
## 4. Details
## 5. Review
## 6. Optional AI Refinement
## 7. Build
## Manual-Only Path
## AI-Assisted Path
## Backward Navigation and Validation
## Advanced Handoff and Import
## Outputs
```

Under `## Canonical Journey`, include:

```text
Welcome -> Direction -> Style -> Details -> Review -> Optional AI refinement -> Build
```

Document these implemented requirements explicitly:

- Welcome states that users receive an editable Beamer project and, when compilation succeeds, a PDF.
- Direction starts from a natural-language vibe and applies one curated direction.
- Style covers color and body/title typography.
- Details covers bullets, blocks, navigation, and title-page layout one decision at a time.
- Review validates all manual steps and creates a protected manual baseline.
- AI refinement is optional, uses a separate validated candidate, supports attachments as bounded context, compares manual and AI versions, and requires explicit selection.
- Build writes and archives the selected project, compiles only the selected reviewed version, and exposes project/PDF downloads.
- Backward navigation preserves compatible later choices, flags incompatible choices, and invalidates stale review/selection state after edits.
- Advanced handoff/import is optional and separate from the normal journey.

Include the current route map:

```text
/welcome
-> /start
-> /color
-> /font
-> /bullets
-> /blocks
-> /navigation
-> /title-page
-> /manual-review
-> optional /ai-customize and /ai-compare
-> /final-review
```

- [ ] **Step 2: Run the workflow contract test**

Run:

```powershell
node --test --test-name-pattern="workflow|legacy paths" tests/documentation-consistency.test.js
```

Expected: workflow ordering and forbidden-path checks pass.

- [ ] **Step 3: Commit the workflow rewrite**

```powershell
git add WORKFLOW.md
git commit -m "docs: align workflow with the current workbench"
```

### Task 4: Rewrite the current architecture

**Files:**
- Rewrite: `ARCHITECTURE.md`
- Test: `tests/documentation-consistency.test.js`

- [ ] **Step 1: Replace the catalog-only architecture with the current module map**

The replacement must contain these exact top-level sections:

```markdown
# BeamerForge Architecture

## System Overview
## Canonical Data Flow
## Registry and Theme Validation
## Design Resolution and Rendering
## Workbench Client
## Server and Protected Workflow State
## Optional AI Refinement
## Project Generation and Compilation
## Assets and Recipes
## Security Boundaries
## Testing Strategy
```

Under `## Canonical Data Flow`, include:

```text
registry/options.js + saved theme
-> schema/theme-schema.js validation
-> design/resolve-design.js
-> workbench/public/ preview and manual editing
-> protected manual review baseline
-> optional workbench/ai/ suggestion and comparison
-> explicit manual or AI selection
-> generators/ project output
-> workbench/build.js compilation
-> project archive and PDF download
```

Describe the responsibilities and boundaries of every module named in the data flow. Explain that `workbench/server.js` owns API validation, protected cycle/review identifiers, selection checks, preview compilation, AI coordination, generation, compilation, and download routes. Document that `elements/` contains source assets and `recipes/` contains complete reference presentations; do not claim a repository-level `templates/` directory exists.

Under `## Security Boundaries`, state:

- Registry identifiers and theme structure are schema-validated before rendering or generation.
- AI suggestions produce schema-constrained theme JSON rather than executable LaTeX.
- Uploaded references are bounded context and are not directly compiled or executed.
- API keys stay in the running server process and are not persisted in browser or theme state.
- Build and preview operations are bound to the reviewed cycle, revision, theme hash, and explicit selected version.

- [ ] **Step 2: Run the architecture and full documentation contract**

Run:

```powershell
node --test tests/documentation-consistency.test.js
```

Expected: all five documentation tests pass.

- [ ] **Step 3: Commit the architecture rewrite**

```powershell
git add ARCHITECTURE.md
git commit -m "docs: document the current BeamerForge architecture"
```

### Task 5: Verify the complete documentation refresh

**Files:**
- Verify: `README.md`
- Verify: `WORKFLOW.md`
- Verify: `ARCHITECTURE.md`
- Verify: `GUIDE.md`
- Verify: `tests/documentation-consistency.test.js`

- [ ] **Step 1: Run the focused documentation tests**

```powershell
node --test tests/documentation-consistency.test.js
```

Expected: five tests pass with zero failures.

- [ ] **Step 2: Run all repository tests**

```powershell
npm test
```

Expected: all tests pass with zero failures; existing platform-dependent skips may remain.

- [ ] **Step 3: Run repository syntax checks**

```powershell
npm run check
```

Expected: exit code 0 and no JavaScript syntax errors.

- [ ] **Step 4: Scan current-facing docs for known legacy claims**

```powershell
rg -n "Vibe → Direction → Palette|templates/|CONTRIBUTING\.md|elements/typography/|typography/sans-serif-modern|layout/16-9-single|# Beamer Design System" README.md WORKFLOW.md ARCHITECTURE.md
```

Expected: no matches.

- [ ] **Step 5: Confirm repository scope**

```powershell
git status --short
```

Expected: only the pre-existing unrelated `patch-staging/` directory remains untracked.
