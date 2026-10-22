# Validation

Date: 2026-10-22

- Context: complete replacement of the rejected PredictionMarket recipe with the Stepwise design.
- Source: `main.tex` and `beamerthemePredictionSteps.sty`.
- Engine: XeLaTeX, TeX Live 2024; page references resolved across repeated compilations.
- Final PDF: 10 pages, 32 by 18 cm. No overlays.
- Final compiler result: success; no font substitution, missing-character, overfull, or underfull warnings.
- Visual review: all ten pages opened at 1440-pixel width, repaired, and reopened. Status: VISUALLY_VERIFIED.
- Repair cycle: corrected the order-book table's overlap with the spread band without shrinking its 18 pt text; aligned square bullets to the text's visual center; enabled scalable math fonts.
- Verified: one-line content titles, constant body size, left-aligned bullet text, clear chart regions, readable diagrams, unobstructed arrows, and separate note/footer zones.
- Remaining visual defects observed: none. Replacing content requires a new render review.
- `npm run check`: passed.
- `npm test`: existing script fails on Node 24.19.0 because `node --test tests` treats the directory as a module.
- Equivalent explicit invocation, `node --test "tests/*.test.js"`: 10 passed, 0 failed.
- `git diff --check`: passed (line-ending notices only).

The previous recipe was moved outside the catalog to a temporary recovery directory after automatic approval review rejected recursive deletion. No rejected theme or content remains in this recipe directory.

## Light-cover and lifecycle revision

- Replaced the full-color cover with a near-white canvas and outlined numerical staircase.
- Added the four-stage lifecycle flowchart on page 4; the final deck now has 11 pages.
- Compiled twice with XeLaTeX through prepare_tikz_review.py, iteration 1. Compiler warnings: none.
- Opened and inspected all 11 final page images at 110 dpi, including all nodes, arrows, labels, titles and footers. No overlays; no observed overlap or clipping.
- Status: VISUALLY_VERIFIED. No repair cycle needed for this revision.

## Four-corner ornament revision

Replaced the upper-right staircase logo with four mirrored inward-facing L brackets, flush with the page edges. Compiled twice with XeLaTeX; warnings: none. All 11 pages visually inspected at 90 dpi, with no overlaps or footer collisions. Iteration 1; no repairs required. Status: VISUALLY_VERIFIED. npm run check passed; explicit test-file invocation passed all 10 tests. The existing npm test directory-resolution issue remains unchanged.
