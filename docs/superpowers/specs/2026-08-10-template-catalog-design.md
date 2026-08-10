# Template Catalog Design

## Goal

Reduce BeamerForge to a read-only catalog that displays user-supplied Beamer template recipes. Each recipe is a folder under `recipes/` with an introduction and visual previews.

## Scope

The application will retain only:

- discovery of recipe folders under `recipes/`;
- reading each recipe's `README.md` introduction;
- display of recipe cards and a read-only recipe detail view;
- display of available PDF and PNG previews;
- serving recipe assets and static application files.

The application will remove or retire all design-authoring behavior, including the wizard, theme selection, live design editing, AI refinement, handoff/import, project generation, LaTeX compilation, downloads, build state, and advanced controls.

## Recipe Contract

Each recipe is a folder such as `recipes/my-template/`. The folder may contain:

- `README.md` — human-written introduction and metadata;
- `main.tex` and any supporting `.tex`, `.sty`, `.cls`, `.bib`, font, image, or other source files;
- a compiled PDF, preferably `main.pdf`;
- PNG previews such as `page01.png`, `page02.png`, or a contact sheet.

The catalog treats recipe contents as displayable files. It does not compile, modify, or generate them.

## Application Structure

The server will expose one catalog page and a small read-only API:

- `GET /` — catalog shell;
- `GET /api/recipes` — recipe metadata and safe asset paths;
- `GET /api/recipes/:slug` — one recipe's introduction and assets;
- static routes for application assets and files inside `recipes/`.

Recipe discovery will use safe directory and file handling so a recipe cannot escape the `recipes/` directory. Supported display assets will be limited to Markdown text, PDF files, and common raster previews. Other files remain available only as recipe source assets if explicitly linked by the detail view.

The browser will show a catalog grid. Selecting a card opens a detail view with the README introduction, PDF viewer when a PDF exists, and an image gallery for PNG previews. Missing previews are handled with a clear text state rather than an error page.

## Documentation and Tests

`README.md` and `WORKFLOW.md` will describe the catalog-only workflow: add a recipe folder, add its README and previews, then run the server. Tests will cover recipe discovery, README extraction, safe asset paths, empty/malformed folders, and the basic catalog page/API contract. Obsolete wizard, AI, generation, compilation, and design-registry tests will be removed with the retired implementation.

## Success Criteria

1. Starting the app opens the recipe catalog without a welcome wizard.
2. Existing recipes appear with their introductions and previews.
3. Adding a new folder under `recipes/` makes it discoverable after restarting or refreshing the app.
4. No UI or API path can create, edit, compile, generate, refine, import, or download a template project.
5. The remaining server and browser code are covered by focused tests and pass the repository checks.
