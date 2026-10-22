# Validation

Validated on 2026-10-22.

## Build and visual review

- Entry point: `main.tex`; context: Beamer, 16:9.
- Compiler: pdfLaTeX, TeX Live 2024.
- Output: ten pages; one state per frame, no incremental overlays.
- Three compilation passes in total: initial build, reference resolution, and a final metadata cleanup.
- The second pass resolved page anchors and the total frame count; no geometry repair was required.
- All ten rendered slides were opened and inspected, including the final cover, divider, equation, schematic figure, and closing slide.
- Checked single-line frame titles, safe margins, text and figure labels, footers, and separation between artwork and text.
- Final compiler log: no overfull/underfull boxes, missing characters, undefined references, or font warnings.
- Visual status: **VISUALLY_VERIFIED**. No unresolved clipping or overlap was observed.
- Evidence: `main.pdf`, `page01.png` through `page10.png`, and `previews/overview.png`.

## Catalog checks

- `npm run check`: passed.
- `npm test`: the existing `node --test tests` entry point failed under Node 24.19.0 with `MODULE_NOT_FOUND` for the directory argument.
- `node --test "tests/*.test.js"`: all 10 tests passed when the test files were selected explicitly.
- No catalog application code or test configuration was changed for this recipe.

The figure is explicitly labeled schematic, and the deck contains no empirical estimates. The earlier template files remain unchanged in `original/` and are not current preview evidence.
