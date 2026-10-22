# Prediction Markets — Stepwise

A rebuilt academic Beamer recipe inspired by price ladders, order books, and stacked architectural planes. Square corners, stepped silhouettes, and monospaced numerical labels establish a digital visual identity.

## Layout and typography

- Canvas: 32 × 18 cm, 16:9.
- Body: Segoe UI, 18 pt with 25 pt leading; constant throughout the deck.
- Content titles: Segoe UI Semibold, 26 pt; single line.
- Cover title: 40 pt. Numerical cover accents: Consolas, 30 pt.
- Metadata and source notes: 10 pt; never used for main arguments.
- Bullets share a fixed left edge. Figures and tables are centered within their allocated visual region, independently of the text column.
- Content occupies the upper, middle, and lower body regions. The footer and source-note zones remain separate.
- Near-white canvas on every page, including the cover. Navy text and electric-blue accents; open staircase outlines on the cover. Never use full-page dark or saturated backgrounds.

## Files

- `main.tex`: eleven editable demonstration slides.
- `beamerthemePredictionSteps.sty`: shared theme and layout macros.
- `main.pdf`: compiled deck.
- `page-01.png` through `page-11.png`: full-page previews.
- `preview-contact-sheet.png`: overview.
- `VALIDATION.md`: compilation and visual-review record.

## Build and edit

Requires XeLaTeX, Segoe UI (including Semibold), and Consolas. Compile `main.tex` twice from this directory using `xelatex -interaction=nonstopmode -halt-on-error main.tex`.

Change the author, institution, and date in `main.tex`. `PMpoint` places a left-aligned bullet; `PMtier` creates a square visual layer. Coordinates are centimeters from the upper-left corner, with negative vertical coordinates inside `PMcanvas`. Keep bullet text short; split an overloaded slide instead of reducing its font size. The fixed layout must be rendered and visually checked after replacing text or charts.

The contract, order book, price path, and research framework are illustrative teaching content. Numerical examples are synthetic and explicitly labeled; no empirical findings are claimed. Replace them with documented research material before presenting.

## Process diagram

Page 4 adds a four-stage market lifecycle: define event, trade claims, resolve event, settle claims. Equal square-corner nodes, blue connectors, and consistent left-aligned labels share the theme typography.

## Corner ornament

Four mirrored, inward-facing blue L brackets sit flush with the page corners, on every slide including the cover. Each arm is 0.8 cm long and 0.12 cm thick. They replace the previous upper-right staircase logo. The shared `PMcorners` macro controls all four ornaments.
