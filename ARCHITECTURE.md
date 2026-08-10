# Catalog Architecture

Beamer Template Catalog is intentionally small and read-only.

```text
recipes/<slug>/README.md + previews
             ↓
workbench/recipe-catalog.js
             ↓
workbench/server.js
             ↓
workbench/public/index.html + app.js + styles.css
```

## Recipe catalog

`workbench/recipe-catalog.js` discovers direct child recipe folders, extracts the README title and text, identifies supported previews, and resolves only approved local assets. It rejects invalid folder names, symbolic links, traversal, unsupported files, and missing assets.

## HTTP server

`workbench/server.js` serves the static catalog UI and three read-only surfaces:

- `GET /api/recipes` lists recipes;
- `GET /api/recipes/:slug` returns one recipe;
- `GET /recipes/:slug/:asset` serves an approved PDF or image preview.

All other routes return `404`, and non-GET requests return `405`. The server never accepts request bodies and has no state directory, compiler, generator, AI provider, or upload handler.

## Browser interface

The browser renders a catalog grid and a detail view. It displays README introductions, PDF previews, and raster slide previews. It uses ordinary browser history for navigation and has explicit loading, error, and empty-preview states.

## Content boundary

Recipe folders are user-managed content. The app discovers them at runtime and does not rewrite, compile, archive, or download them. Existing recipes and future user-created recipe folders are preserved as the library's content layer.
