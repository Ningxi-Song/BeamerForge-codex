# Blue Yellow validation

Validated on 2026-10-22.

- Compiled with pdfLaTeX; final output contains 13 pages with resolved page totals.
- Final compilation log contains no overfull/underfull boxes or LaTeX/package warnings.
- Visually inspected all 13 final rendered pages for typography, clipping, spacing, chart labels, and table legibility.
- Restored the creator's intended blue-yellow political tension through opposing oblique color fields, staggered cover typography, and paired rules on evidence pages. No plate or cutlery artwork is used.
- Compiled twice to resolve TikZ page anchors and page totals.
- Both published PDFs are byte-identical; all 13 page previews and the contact sheet were refreshed.
- Original source, README, and PDF match the pre-redesign Git revision `3d9dbc9` (allowing Windows line endings); original image assets are archived alongside them.
- Review/sample counts, all trend coordinates, and all six coefficient/parenthetical pairs match the original example.
- Trend range is 12 to 183, with a displayed y-axis of 0 to 195: 12 units of space above and below, and 87.7% vertical coverage.
- The example labels unprovided provenance, units, and inference details rather than supplying unsupported claims.
- `npm run check` passed.
- `npm test` cannot resolve the `tests` directory with the installed Node.js 24 runner. Running `node --test "tests/*.test.js"` directly passed all 10 tests.

The catalog application and other recipes were not modified.
