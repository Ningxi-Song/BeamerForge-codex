# Beamer Template Catalog - AI Agent Instructions

## Purpose

This repository is a read-only catalog for user-created Beamer template recipes.

## Recipe contract

When adding or reviewing a template, work inside `recipes/<template-name>/`. Keep the user's source files intact. A recipe should include a descriptive `README.md`, and may include `main.pdf`, root-level PNG/JPEG/WebP previews, LaTeX source, fonts, figures, and supporting files.

## Application boundary

The application only discovers and displays recipes. Do not reintroduce template generation, design selection, AI refinement, compilation, project archiving, upload handling, or write APIs unless the user explicitly changes the project goal.

## Verification

Run:

```bash
npm run check
npm test
```

The server is started with `npm start` and serves the catalog at `http://localhost:5177/`.
