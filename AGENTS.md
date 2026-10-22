# Beamer Template Catalog - AI Agent Instructions

## Purpose

This repository is a read-only catalog for user-created Beamer template recipes.

## Recipe contract

When adding or reviewing a template, work inside `recipes/<template-name>/`. Keep the user's source files intact. Every published recipe must include a descriptive `README.md`, a complete `main.pdf`, and `preview-contact-sheet.png`. Use the shared sections in order: Downloads, Preview, Inspiration, Best For, Elements, Quick Start, File Structure, and Customization. Downloads must provide the same view-PDF, download-PDF, and source links as the other recipes. Preserve source filenames and supporting assets; document the correct compiler and entry point. Extra provenance or technical sections may follow the shared sections. Root-level individual slide previews are optional.

## Application boundary

The application only discovers and displays recipes. Do not reintroduce template generation, design selection, AI refinement, compilation, project archiving, upload handling, or write APIs unless the user explicitly changes the project goal.

## Verification

Run:

```bash
npm run check
npm test
```

The server is started with `npm start` and serves the catalog at `http://localhost:5177/`.
