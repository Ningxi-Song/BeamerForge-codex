# Template Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the BeamerForge authoring workbench with a read-only, folder-backed catalog that introduces and displays Beamer template recipes.

**Architecture:** A focused recipe-catalog module scans `recipes/`, extracts safe README metadata and preview assets, and exposes read-only catalog data. A minimal Node HTTP server serves that data and static files. A single-page browser UI renders a catalog grid and a recipe detail view with Markdown introduction text, PDF display, and PNG gallery.

**Tech Stack:** Node.js 20 CommonJS, built-in `node:http` and `node:fs`, browser HTML/CSS/JavaScript, Node's built-in test runner.

---

### Task 1: Add the recipe catalog domain module and tests

**Files:**
- Create: `workbench/recipe-catalog.js`
- Create: `tests/recipe-catalog.test.js`

- [ ] **Step 1: Write failing tests for recipe discovery and safe metadata**

Create temporary recipe folders containing `README.md`, `main.pdf`, `page01.png`, and source files. Assert that the catalog returns the folder slug, README text, PDF preview, PNG previews sorted by filename, and only safe relative asset paths. Assert that missing README/PDF/PNG files produce empty values, malformed folder names are ignored, and `../` or nested path requests cannot escape the recipe root.

- [ ] **Step 2: Run the focused test file and verify it fails**

Run:

```powershell
node --test tests/recipe-catalog.test.js
```

Expected: FAIL because `workbench/recipe-catalog.js` does not exist.

- [ ] **Step 3: Implement the catalog module**

Export `createRecipeCatalog({ recipesDir })` with:

```js
{
  listRecipes(),
  getRecipe(slug),
  resolveAsset(slug, relativePath)
}
```

Use `fs.readdirSync` and `fs.lstatSync` to discover direct child directories only. Use a slug validator such as `/^[A-Za-z0-9][A-Za-z0-9_-]*$/`. Read `README.md` as UTF-8, identify `main.pdf` if present, and collect `.png`, `.jpg`, `.jpeg`, and `.webp` files from the recipe root sorted lexicographically. Return URL-ready paths using POSIX separators. Resolve assets against the recipe directory and reject symbolic links, traversal, missing files, directories, and paths containing a different normalized root.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run `node --test tests/recipe-catalog.test.js`. Expected: all catalog tests pass with zero failures.

- [ ] **Step 5: Commit the catalog module and tests**

```powershell
git add workbench/recipe-catalog.js tests/recipe-catalog.test.js
git commit -m "feat: add read-only recipe catalog"
```

### Task 2: Replace the workbench server with read-only catalog routes

**Files:**
- Modify: `workbench/server.js`
- Replace: `tests/server.test.js`
- Modify: `package.json`

- [ ] **Step 1: Replace the server test contract**

Keep only tests for `GET /`, `GET /api/recipes`, `GET /api/recipes/:slug`, recipe PDF/PNG asset responses, missing recipe/asset responses, static-file traversal rejection, and rejection of all write or authoring routes with `404` or `405`. Build the server against a temporary `recipesDir` and `publicDir` so tests do not depend on user content.

- [ ] **Step 2: Run the replacement server tests and verify the old implementation fails**

Run:

```powershell
node --test tests/server.test.js
```

Expected: FAIL because the current server still serves the wizard and authoring APIs.

- [ ] **Step 3: Implement the minimal HTTP server**

Export `createWorkbenchServer({ rootDir = projectRoot, recipesDir, publicDir })`. Serve `/` and `/app.js`/`/styles.css` from `publicDir`, return JSON from `/api/recipes` and `/api/recipes/:slug`, and stream recipe assets only after `resolveAsset` approves them. Set content types for HTML, CSS, JavaScript, JSON, Markdown, PDF, and supported image formats. Map unknown routes to `404`; do not parse request bodies and do not implement `POST`, `PUT`, `PATCH`, or `DELETE` handlers. Preserve the existing `if (require.main === module)` startup behavior on port `5177`.

- [ ] **Step 4: Update package scripts and run server tests**

Change `check` to syntax-check only the remaining catalog/server files and change `test` to run the remaining focused test directory. Run `node --test tests/server.test.js`; expected: all server tests pass with zero failures.

- [ ] **Step 5: Commit the server boundary**

```powershell
git add workbench/server.js tests/server.test.js package.json
git commit -m "feat: serve recipes as a read-only catalog"
```

### Task 3: Replace the browser workbench with the catalog UI

**Files:**
- Replace: `workbench/public/index.html`
- Replace: `workbench/public/app.js`
- Replace: `workbench/public/styles.css`
- Modify: `tests/public-ui.test.js`

- [ ] **Step 1: Write UI contract tests**

Assert that the HTML contains catalog and detail containers, no wizard controls, no AI/provider/build controls, and no template-generation form. Assert that the browser script calls only `GET /api/recipes` and `GET /api/recipes/:slug`, renders README introductions, creates PDF viewers for PDF assets, creates image previews for raster assets, and displays an empty-preview message.

- [ ] **Step 2: Run UI tests and verify the old UI fails the new contract**

Run `node --test tests/public-ui.test.js`. Expected: FAIL because the current page contains the wizard and authoring controls.

- [ ] **Step 3: Implement the catalog page**

Create a semantic page with a header, catalog grid, recipe detail panel, back button, introduction container, PDF container, and image gallery. Use `textContent` for README text and a small Markdown-to-HTML renderer limited to headings, paragraphs, unordered lists, bold text, code spans, and links with sanitized relative targets. Render a card per recipe, navigate with a query parameter or history state, and load detail data on selection. Use `iframe`/`object` for PDFs and `<img>` for raster previews. Include accessible labels, keyboard-operable controls, responsive layout, and explicit loading/error/empty states.

- [ ] **Step 4: Run UI tests and verify they pass**

Run `node --test tests/public-ui.test.js`. Expected: all UI contract tests pass with zero failures.

- [ ] **Step 5: Commit the catalog UI**

```powershell
git add workbench/public/index.html workbench/public/app.js workbench/public/styles.css tests/public-ui.test.js
git commit -m "feat: replace wizard with recipe catalog UI"
```

### Task 4: Rewrite documentation and remove retired authoring code

**Files:**
- Modify: `README.md`
- Replace: `WORKFLOW.md`
- Replace: `ARCHITECTURE.md`
- Modify: `AGENTS.md`
- Modify or replace: `tests/documentation-consistency.test.js`
- Delete: authoring source under `schema/`, `registry/`, `design/`, `generators/`, and obsolete `workbench/` modules
- Delete: obsolete wizard, AI, build, generation, design, and registry tests under `tests/`
- Preserve: `recipes/` and user-owned untracked recipe folders

- [ ] **Step 1: Rewrite documentation for the catalog workflow**

Document `npm start`, the `recipes/<slug>/` folder contract, README introductions, PDF/PNG preview naming, and the read-only display behavior. Remove references to choosing styles, AI, compilation, generation, downloads, and element authoring.

- [ ] **Step 2: Replace documentation tests with catalog assertions**

Test that current documentation names the recipe folder contract, links to existing files, and contains no references to wizard routes, AI endpoints, generation, or compilation.

- [ ] **Step 3: Remove obsolete implementation and tests**

Delete only source files that are no longer imported by the minimal server or catalog UI. Preserve every directory under `recipes/`, including existing previews, fonts, figures, and user-owned untracked content. Remove old tests only after `rg` confirms they target retired modules.

- [ ] **Step 4: Run repository-wide reference checks**

Run:

```powershell
rg -n "wizard|ai-|api/theme|api/compile|generate|compileTemplate|theme-schema|registry/options|resolve-design" --glob "!recipes/**" --glob "!docs/superpowers/**"
```

Expected: no runtime or current-documentation references; historical design specs may remain under `docs/superpowers/`.

- [ ] **Step 5: Commit the reduction**

```powershell
git add README.md WORKFLOW.md ARCHITECTURE.md AGENTS.md package.json tests workbench schema registry design generators
git commit -m "refactor: reduce BeamerForge to template catalog"
```

### Task 5: Verify the final catalog end to end

**Files:**
- Verify: all remaining runtime files and `recipes/`

- [ ] **Step 1: Run syntax checks**

Run `npm run check`. Expected: exit code `0`.

- [ ] **Step 2: Run all remaining tests**

Run `npm test`. Expected: all tests pass with zero failures.

- [ ] **Step 3: Start the server and verify the real recipes**

Run `npm start`, request `/`, `/api/recipes`, one existing recipe detail route, one PDF or PNG asset, and a traversal path. Expected: catalog HTML, discovered recipe data, preview content, and a `404` traversal response.

- [ ] **Step 4: Inspect the final file inventory**

Run `rg --files` and confirm the application surface consists of the catalog server/module, catalog browser assets, focused tests, documentation, and recipe folders. Confirm no authoring UI or authoring API remains.
