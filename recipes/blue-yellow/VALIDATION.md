# Blue Yellow validation

Validated on 2026-10-22. Edition: Counterpoint.

## Visual review

- Context: Beamer; entry point `demo.tex`, theme `beamerthemePoliticsMenu.sty`.
- Status: VISUALLY_VERIFIED. All 16 final pages were opened and inspected at readable resolution; there are no incremental overlays in this example.
- Four compile/render iterations, including the second pass required to resolve page anchors and totals, and two layout refinement cycles.
- Refined the section-label font, block text color, and workflow-node dimensions. A fixed text-height setting displaced workflow labels; it was replaced with minimum-height nodes, then page 9 was re-rendered and inspected. The other 15 page images were unchanged byte-for-byte from the inspected render.
- Final compiler log: no overfull/underfull boxes or LaTeX/package warnings. No unresolved visual defects observed.
- Embedded PDF fonts verified: XCharter Roman/Bold/Italic and Source Sans Pro Regular/Bold.
- Cover, dividers, and evidence pages use white backgrounds. Blue-yellow tension is expressed through interrupted rules, marginal marks, and comparison structure.
- Pages 9–11 demonstrate a four-stage workflow, standard/alert/example blocks, and a two-column comparison.
- Both published PDFs are byte-identical; all 16 previews, the full contact sheet, and the four-page component gallery match the final render.

## Content and repository checks

- Original source, README, PDF, and assets remain archived in `original/` from the pre-redesign revision `3d9dbc9`.
- Original review/sample counts, all trend coordinates, and all six coefficient/parenthetical pairs were checked against the original example and preserved.
- Trend range: 12–183; displayed axis: 0–195. Upper and lower margins are both 12 units, with 87.7% vertical coverage.
- Added component pages organize the supplied research content. Workflow arrows indicate presentation order, not additional causal claims.
- `npm run check` passed.
- `npm test` fails because the installed Node.js 24 runner cannot resolve the `tests` directory. The explicit command `node --test "tests/*.test.js"` passed all 10 tests.
- Changes for this task are limited to `recipes/blue-yellow/`; unrelated working-tree changes are excluded from the commit.
