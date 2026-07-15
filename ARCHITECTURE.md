# BeamerForge Architecture

## System Overview

BeamerForge is a local workbench for composing, reviewing, refining, generating, and compiling Beamer presentations. The element catalog remains useful source material, but the running product is driven by a validated theme registry and a cumulative browser workflow.

The system keeps three concerns separate:

1. **Design choices:** supported colors, fonts, bullets, blocks, navigation, title pages, and trusted vector art.
2. **Workflow state:** the editable manual theme, protected review baseline, optional AI candidate, and explicit final selection.
3. **Artifacts:** the generated Beamer project, archive, compiler diagnostics, and PDF.

For the user-facing sequence, see [Workflow](WORKFLOW.md). For visual quality criteria, see the [Design review guide](GUIDE.md).

## Canonical Data Flow

```text
registry/options.js + saved theme
-> schema/theme-schema.js validation
-> design/resolve-design.js
-> workbench/public/ preview and manual editing
-> protected manual review baseline
-> optional workbench/ai/ suggestion and comparison
-> explicit manual or AI selection
-> generators/ project output
-> workbench/build.js compilation
-> project archive and PDF download
```

The same validated and resolved design semantics feed browser preview and Beamer generation. Renderer-parity tests guard the places where HTML/CSS and LaTeX necessarily use different implementations.

## Registry and Theme Validation

`registry/options.js` exports the supported design vocabulary:

- palettes;
- body and title fonts;
- bullet styles;
- block styles;
- navigation styles;
- title-page layouts;
- trusted vector logos.

Each registry entry declares whether both HTML and LaTeX renderers support it. Local font entries also declare the assets that must be copied into generated projects.

`schema/theme-schema.js` validates the complete theme structure and rejects unknown fields or registry identifiers. A theme is not eligible for preview, review, AI comparison, generation, or compilation until it satisfies this contract.

Example registry-backed choices include:

```json
{
  "colors": { "paletteId": "midnight-blue" },
  "fonts": { "body": "fira-sans", "title": "palatino" },
  "bullets": { "style": "pifont-outline" },
  "blocks": { "style": "classic" },
  "navigation": { "style": "page-number" },
  "titlePage": { "layout": "left-curtain" }
}
```

## Design Resolution and Rendering

`design/resolve-design.js` combines a validated theme with the registry and produces renderer-ready design data. It centralizes derived colors, typography, component semantics, identity, content defaults, aspect ratio, and trusted decorations.

Related modules enforce the renderer contract:

- `design/registry-contract.js` checks that registry entries provide the required semantics.
- `design/vector-renderers.js` converts validated trusted vectors into deterministic SVG and TikZ output.
- renderer-parity fixtures compare stable layout and color landmarks between standalone HTML and compiled Beamer output.

The browser and generator consume resolved design data rather than independently interpreting raw theme IDs.

## Workbench Client

`workbench/public/` contains the browser application and its focused state modules:

- `wizard-state.js` defines the visible stages, detailed routes, completion state, validation mapping, and route gates.
- `onboarding-state.js` decides whether the welcome experience or an active session should be shown.
- `selection-state.js` binds final manual or AI selection to reviewed state.
- `preview-state.js` and `authoritative-preview-state.js` manage trusted preview URLs, pending work, stale results, retries, and renderer geometry.
- `ai-refinement-state.js` models provider connection and suggestion progress without owning protected server state.
- `app.js` coordinates API calls, cumulative choices, preview rendering, navigation, comparison, and build actions.

Browser state improves interaction but is not the authority for protected review, selection, or build eligibility.

## Server and Protected Workflow State

`workbench/server.js` is the API and state boundary. It:

- serves the workbench and local assets;
- exposes registry options and curated directions;
- validates theme reads and writes;
- resolves designs for preview;
- creates and verifies protected manual review baselines;
- coordinates optional AI requests and comparison state;
- accepts explicit manual or AI selection;
- gates generation and compilation against the current cycle, review revision, theme hash, and selected version;
- serves project archives, compiled PDFs, and sanitized diagnostics.

Protected workflow state distinguishes:

- the current editable manual theme;
- the reviewed manual baseline;
- a separate validated AI draft;
- the comparison binding between reviewed hashes;
- the explicitly selected final version;
- build status for that exact reviewed selection.

Manual edits begin a new review revision. Stale AI responses, comparisons, selections, and build requests cannot silently attach themselves to the new design.

## Optional AI Refinement

`workbench/ai/` isolates provider-facing concerns:

- `provider-config.js` validates provider choice, model settings, endpoints, and connection state.
- `provider-service.js` connects, disconnects, and requests completions without exposing API keys in public state.
- `reference-context.js` converts supported attachments into bounded text or image context.
- `suggestion-prompt.js` constructs the protected context and parses a complete candidate theme.
- `suggestion-coordinator.js` owns request identity, cancellation, and late-response protection.

AI suggestions produce schema-constrained theme JSON. They do not directly edit protected manual state and do not execute arbitrary LaTeX supplied through references. A valid suggestion remains separate until the user compares it and explicitly selects a version.

Advanced handoff and import reuse the same baseline and validation boundaries for external-agent workflows.

## Project Generation and Compilation

`generators/` converts the selected resolved design into a complete Beamer project:

- `generators/latex.js` creates Beamer source from resolved semantics.
- `generators/project-writer.js` writes files inside an owned output root and copies required assets safely.
- `generators/cli.js` exposes the generation pipeline to command-line use.

`workbench/build.js` discovers supported LaTeX compilers, runs compilation with bounded output and timeouts, cleans up owned child processes, and returns useful diagnostics.

Supporting modules include:

- `workbench/preview-cache.js`, which caches authoritative compiled previews by safe keys;
- `workbench/project-archive.js`, which creates the downloadable project archive without allowing path escape;
- `workbench/parity-check.js`, which measures HTML/Beamer renderer agreement when the required tools are available.

Project generation remains available without a local compiler. PDF output is available only after successful compilation.

## Assets and Recipes

[`elements/`](elements/) contains fonts, color references, navigation examples, reusable content patterns, and trusted vector source data used by the registry and generator.

[`recipes/`](recipes/) contains complete reference presentations such as D Rose and Bamboo, including Beamer sources, assets, and rendered previews. Recipes demonstrate coherent combinations; they are not the runtime registry themselves.

Brand assets used by repository documentation live under [`assets/branding/`](assets/branding/).

## Security Boundaries

- Registry identifiers and complete theme structure are schema-validated before rendering or generation.
- AI suggestions produce schema-constrained theme JSON rather than executable LaTeX.
- Uploaded references are bounded context and are not directly compiled or executed.
- API keys stay in the running server process and are not persisted in browser or theme state.
- Custom remote provider endpoints require HTTPS, except loopback HTTP endpoints for local models.
- Build and preview operations are bound to the reviewed cycle, revision, theme hash, and explicit selected version.
- File writers, archives, asset routes, and preview caches reject traversal and unsafe paths.
- Compiler output, provider failures, and public diagnostics are bounded and sanitized.

## Testing Strategy

The Node test suite covers:

- schema and registry contracts;
- cumulative wizard and route gates;
- protected baseline, comparison, selection, and stale-response behavior;
- AI provider and reference safety;
- deterministic SVG and TikZ vector rendering;
- generator output and owned-path enforcement;
- compiler discovery, timeout, cleanup, and diagnostics;
- preview caching and renderer parity;
- server APIs, static routes, archives, and downloads;
- current documentation links, registry examples, workflow language, and module references.

Run the complete checks with:

```bash
npm test
npm run check
```
