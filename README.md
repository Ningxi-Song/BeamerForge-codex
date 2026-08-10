# Beamer Template Catalog

A small, read-only library for browsing Beamer templates.

The app discovers folders under `recipes/`, reads each folder's `README.md`, and displays the available PDF and image previews. It does not create, edit, compile, generate, or refine templates.

## Run the catalog

```bash
npm start
```

Open <http://localhost:5177/>.

## Add a template

Create a folder under `recipes/`:

```text
recipes/my-template/
├── README.md       # introduction and template notes
├── main.pdf        # optional full preview
├── page01.png      # optional slide previews
├── page02.png
├── main.tex        # optional source files
└── ...
```

The folder name may contain letters, numbers, hyphens, and underscores. The first Markdown heading becomes the catalog title; otherwise the folder name is used. Add the introduction and visual assets yourself, then refresh the catalog.

## What the catalog displays

- one card per recipe folder;
- the introduction from `README.md`;
- `main.pdf` in an in-browser PDF viewer when present;
- root-level PNG, JPEG, or WebP files as slide previews;
- a clear empty state when no preview is included.

Template source files remain in their recipe folders for your own use, but the app does not process or compile them.

## Project layout

| Path | Purpose |
| --- | --- |
| `recipes/` | User-supplied template folders |
| `workbench/server.js` | Read-only HTTP server |
| `workbench/recipe-catalog.js` | Safe recipe discovery and asset resolution |
| `workbench/public/` | Catalog browser interface |
| `tests/` | Catalog, server, UI, and documentation tests |

## License

MIT
