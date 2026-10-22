# Beamer Template Catalog

A small, read-only library for browsing Beamer templates.

The app discovers folders under `recipes/`, reads each folder's `README.md`, and displays the available PDF and image previews. It does not create, edit, compile, generate, or refine templates.

## Run the catalog

```bash
npm start
```

Open <http://localhost:5177/>.

## Template index

| Template | Best for | Preview | Full PDF | Source |
| --- | --- | --- | --- | --- |
| [Air Pollution](recipes/air-pollution/README.md) | Environmental economics, pollution exposure, and policy research | [View slides](recipes/air-pollution/preview-contact-sheet.png) | [Download PDF](https://raw.githubusercontent.com/Ningxi-Song/BeamerForge-codex/main/recipes/air-pollution/main.pdf) | [Browse files](recipes/air-pollution/) |
| [Bamboo](recipes/bamboo/README.md) | Research talks, policy briefings, concept pitches, and analytical presentations | [View slides](recipes/bamboo/preview-contact-sheet.png) | [Download PDF](https://raw.githubusercontent.com/Ningxi-Song/BeamerForge-codex/main/recipes/bamboo/main.pdf) | [Browse files](recipes/bamboo/) |
| [Blue Yellow](recipes/blue-yellow/README.md) | Political economy, consumer behavior, and everyday economic choices | [View slides](recipes/blue-yellow/preview-contact-sheet.png) | [Download PDF](https://raw.githubusercontent.com/Ningxi-Song/BeamerForge-codex/main/recipes/blue-yellow/main.pdf) | [Browse files](recipes/blue-yellow/) |
| [D Rose](recipes/d-rose/README.md) | Narratives about tension, contrast, inequality, crisis, and resilience | [View slides](recipes/d-rose/preview-contact-sheet.png) | [Download PDF](https://raw.githubusercontent.com/Ningxi-Song/BeamerForge-codex/main/recipes/d-rose/main.pdf) | [Browse files](recipes/d-rose/) |
| [Prediction Market](recipes/PredictionMarket/README.md) | Prediction markets, information aggregation, and market design | [View slides](recipes/PredictionMarket/preview-contact-sheet.png) | [Download PDF](https://raw.githubusercontent.com/Ningxi-Song/BeamerForge-codex/main/recipes/PredictionMarket/main.pdf) | [Browse files](recipes/PredictionMarket/) |

## Add a template

Create a folder under `recipes/`:

```text
recipes/my-template/
├── README.md       # introduction and template notes
├── main.pdf        # required complete presentation
├── preview-contact-sheet.png # required combined slide preview
├── page01.png      # optional slide previews
├── page02.png
├── main.tex        # optional source files
└── ...
```

The folder name may contain letters, numbers, hyphens, and underscores. The first Markdown heading becomes the catalog title; otherwise the folder name is used. Add the introduction and visual assets yourself, then refresh the catalog.

Follow the introduction format used by [D Rose](recipes/d-rose/README.md): a centered image, title, one-sentence description, italic theme statement, and contributor credit. Use the same core sections in this order: Downloads, Preview, Inspiration, Best For, Elements, Quick Start, File Structure, and Customization. Keep the inspiration specific to the recipe, preserve the contributor's own wording when available, and put extra provenance or technical notes after those sections. Raw HTML in this introduction is intended for GitHub rendering; the local catalog currently displays a limited Markdown subset.

Every published recipe must include `README.md`, `main.pdf`, and `preview-contact-sheet.png`. Its Downloads section must include `[View full PDF](main.pdf)`, a `Download full PDF` link to `https://raw.githubusercontent.com/Ningxi-Song/BeamerForge-codex/main/recipes/<template-name>/main.pdf`, and `[Browse source files](./)`. The full PDF must be compiled from the recipe source, not assembled from preview thumbnails. Preserve original source filenames and document the correct build command in Quick Start. Run `npm run check` and `npm test` before publishing; the delivery tests enforce the same sections, assets, PDF links, and Git ignore exception for every recipe.

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
