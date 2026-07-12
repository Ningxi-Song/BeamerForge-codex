# Renderer Parity Foundation Design

## Summary

BeamerForge will preserve its fast HTML design experience while making compiled
LaTeX the explicit source of final visual authority. A new resolved design model
will sit between validated theme JSON and both renderers. This model will give the
HTML preview and LaTeX generator one shared interpretation of colors, typography,
geometry, component behavior, trusted assets, and renderer capabilities.

The manual and AI workflow remains unchanged at its security boundary:
`theme.json`, `manual-theme.json`, and `ai-draft-theme.json` remain closed,
declarative schema documents. Neither manual controls nor external AI agents may
inject HTML, LaTeX, TikZ, packages, shell commands, or asset paths.

## Goals

- Keep HTML preview updates immediate during manual editing.
- Make compiled LaTeX previews available at review decisions where fidelity
  matters.
- Resolve theme choices once so HTML and LaTeX cannot independently reinterpret
  raw theme IDs.
- Make renderer differences explicit and testable.
- Cache compiled previews deterministically and invalidate them when either the
  theme or generator implementation changes.
- Preserve a useful HTML preview and prior successful compile when compilation
  fails.
- Generate browser and LaTeX forms of the duck logo from one trusted vector
  description.
- Add structural and optional rendered-image parity checks for representative
  themes and difficult content.

## Non-Goals

- Replacing LaTeX with an HTML-to-LaTeX translator.
- Compiling after every keystroke or every manual wizard choice.
- Allowing arbitrary user or AI-authored HTML, SVG, LaTeX, or TikZ.
- Expanding the theme schema with new AI-customizable design components in this
  phase.
- Requiring pixel-identical browser and PDF rendering.
- Making XeLaTeX or PDF rasterization mandatory for the ordinary unit-test suite.

## Architecture

The data flow will be:

```text
theme JSON
    |
    v
closed-schema validation
    |
    v
resolveDesign(theme, registry)
    |
    +--> instant HTML renderer
    |
    `--> LaTeX generator --> compiler --> authoritative PDF preview
```

Theme JSON remains the stable persistence and external-agent contract. The new
resolver produces a deeply frozen, serializable `ResolvedDesign` value. It owns
all registry lookup and converts public IDs and theme values into renderer-ready
semantics. Renderers consume the resolved value and do not look up raw theme IDs.

The resolver is a pure module. It performs no filesystem access, HTTP work,
compilation, or DOM manipulation. Invalid themes fail before resolution through
the existing schema validator.

## Resolved Design Model

The initial `ResolvedDesign` contains these sections:

```js
{
  source: {
    themeHash,
    generatorVersion
  },
  canvas: {
    aspectRatio,
    widthUnits,
    heightUnits
  },
  colors: {
    background,
    primary,
    accent,
    text,
    blockBody,
    alert,
    primaryText
  },
  typography: {
    body: { id, label, cssFamily, latexPreamble, assets },
    title: { id, label, cssFamily, latexPreamble, assets }
  },
  components: {
    bullet: { id, marker, latexPackages, latexItem, latexSubitem },
    block: { id, radiusUnits, shadow, latexTemplate },
    navigation: { id, header, footline, latexOuterTheme, latexFootline },
    titlePage: { id, alignment, layout },
    cornerLogo: { id, position, sizeUnits, scope, vector }
  },
  content: {
    title,
    bullets,
    blockTitle,
    blockBody
  },
  capabilities: {
    html: true,
    latex: true,
    approximations: []
  }
}
```

These field names define the initial resolver contract. The model uses normalized
canvas units for shared placement and size semantics. Renderer syntax such as CSS
declarations and LaTeX commands remains trusted registry data, not theme input.

`themeHash` is a SHA-256 digest of canonical JSON with recursively sorted object
keys. `generatorVersion` is a checked-in version string changed whenever resolved
semantics or generated LaTeX changes. The compiled-preview cache key combines
both values.

## Registry Contract

Every selectable registry entry must declare support for HTML and LaTeX. An entry
either provides both implementations or explicitly lists an approximation or
unsupported capability. Registry validation runs in tests and at server startup;
silent renderer omissions are errors.

The resolver is the only production module that maps theme IDs to registry
entries. The HTML renderer and LaTeX generator receive resolved components rather
than the registry itself.

## Preview Workflow

Individual manual wizard steps show an `Instant HTML preview` only. They never
start compilation.

Review routes add an `Authoritative LaTeX preview`:

- Entering manual review compiles the frozen or currently reviewed manual theme.
- Entering AI comparison reuses the cached manual preview and compiles the AI
  draft.
- Entering final review compiles the explicitly selected version.
- A visible retry action reruns a failed compile.
- A visible refresh action may force recompilation despite a valid cache entry.

The server exposes a dedicated compiled-preview operation rather than overloading
final project generation. Its response reports `pending`, `ready`, `failed`, or
`unavailable`, along with the cache key, whether the result was cached, the PDF
URL when ready, and a useful compiler excerpt when failed.

The server serves only PDFs produced beneath the configured preview-cache root.
Path resolution uses the existing beneath-root safety pattern. PDF responses use
`application/pdf` and are not accepted from user-controlled paths.

The browser always retains the HTML preview. A failed compile does not clear a
previous successful PDF; the UI labels that PDF as stale and shows the failure
for the current theme. If no compiler is installed, the UI reports that the
authoritative preview is unavailable and keeps the HTML preview usable.

## Cache Behavior

Compiled previews live under a server-controlled cache directory keyed by
`themeHash-generatorVersion`. A cache entry is ready only when it contains both a
successful metadata record and the expected PDF. Partial or failed entries are
not treated as hits.

Concurrent requests for the same key share one in-flight promise within the
server process. A forced refresh bypasses a ready entry and atomically replaces
it only after a successful compile. Failed refreshes preserve the prior ready
artifact as stale fallback.

Cache metadata records the theme hash, generator version, compiler identity,
completion time, and source version (`manual`, `ai`, or `selected`) for display
and diagnosis. Source version does not affect the cache key because equivalent
themes should share a compiled result.

## Canonical Trusted Vector Assets

The duck logo will move from separate SVG and hand-written TikZ implementations
to one trusted vector-primitive description stored in the repository. The first
primitive vocabulary supports only what the duck requires: filled ellipses,
polygons, lines, and circles in a normalized view box.

Two pure renderers consume that description:

- an SVG renderer for browser preview and generated project assets;
- a TikZ renderer for XeLaTeX overlays.

Both outputs inherit colors, dimensions, and geometry from the same description.
Unknown primitives or malformed numeric values are rejected. Theme JSON contains
only the trusted catalog ID and its closed position, size, and scope parameters.

This phase does not attempt to import or translate arbitrary SVG files.

## Parity and Stress Testing

The ordinary test suite remains dependency-light and covers:

- deterministic canonical hashing;
- resolved-model completeness, deep immutability, and invalid-input rejection;
- registry renderer-support declarations;
- both renderers consuming equivalent resolved colors, component IDs, placement,
  and visibility rules;
- canonical duck description producing SVG and TikZ with the same view box,
  primitives, and catalog identity;
- compiled-preview cache hits, misses, invalidation, concurrent request sharing,
  forced refresh, and stale fallback;
- preview API path safety and content types;
- UI labels, route-triggered compilation, retry, unavailable compiler, and
  preserved HTML fallback.

Fixtures cover the default theme, a dark theme, 4:3 canvas, the duck logo, and a
long-content stress theme. Long-content checks expose overflow or density warnings
without promising identical line wrapping between browser and TeX.

An explicit local `npm run parity` command performs the higher-cost check when
XeLaTeX and PDF rasterization are available. It captures the HTML fixture at the
same aspect ratio, compiles and rasterizes the LaTeX fixture, then compares
structural landmarks, dominant colors, and a tolerant image-distance score. The
command reports `unavailable` with the missing dependency when the toolchain is
absent; it must not report a false pass. CI may enable this command on a runner
with the required toolchain.

Pixel identity is not a goal because browser and TeX font rasterization differ.
Thresholds detect missing or displaced components and major color or layout
drift.

## Error Handling

- Invalid theme: return existing field-level validation errors; do not resolve or
  compile.
- Missing registry implementation: fail registry validation with the exact entry
  and renderer.
- Missing compiler: return `unavailable`; keep HTML preview active.
- Compilation failure: return `failed` with a bounded log excerpt; preserve the
  last ready artifact as stale fallback.
- Cache corruption: ignore the entry, compile into a temporary sibling, and
  publish atomically after success.
- Asset primitive error: fail generation before compilation and identify the
  trusted catalog asset.
- Preview PDF traversal attempt: return 404 without exposing filesystem details.

## Rollout

Implementation proceeds in four independently testable increments:

1. Canonical hashing, registry contract, and resolved design model.
2. Migrate HTML and LaTeX rendering to the resolved model without changing the
   visible workflow.
3. Add compiled-preview cache, API, review-route UI, and failure states.
4. Unify the duck asset and add structural plus optional rendered parity tests.

Each increment uses test-first development and keeps the complete existing suite
green. Expansion of AI-customizable components begins only after this foundation
is complete, so later components inherit the same renderer contract.

## Success Criteria

The foundation is complete when:

- HTML and LaTeX consume the same resolved design model;
- review pages clearly distinguish instant and authoritative previews;
- equivalent themes reuse compiled output and generator changes invalidate it;
- compile failures preserve usable preview state and provide actionable errors;
- the duck SVG and TikZ are generated from one trusted vector description;
- registry, cache, UI, stress, and renderer-parity tests pass;
- `npm run parity` either produces a measured parity report or explicitly reports
  the missing local toolchain.
