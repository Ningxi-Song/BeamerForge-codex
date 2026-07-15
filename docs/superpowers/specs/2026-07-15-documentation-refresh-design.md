# BeamerForge Documentation Refresh Design

## Purpose

Bring the public documentation into alignment with the current BeamerForge workbench. Remove legacy catalog-only workflow claims, invalid registry examples, nonexistent paths, and broken links while preserving useful design guidance and recipe documentation.

## Documentation Roles

Each top-level document has one clear responsibility:

- `README.md` is the concise project landing page and quick-start guide.
- `WORKFLOW.md` is the canonical description of the user journey and its manual-only and AI-assisted branches.
- `ARCHITECTURE.md` explains the current system modules, state boundaries, and build data flow.
- `GUIDE.md` remains the human design-review checklist; only links or terminology that conflict with the current product should change.

Historical design specifications under `docs/superpowers/specs/` remain historical records and are not rewritten as current user documentation.

## Canonical Workflow

All current-facing documentation must use this stage model:

```text
Welcome -> Direction -> Style -> Details -> Review -> Optional AI refinement -> Build
```

The detailed route sequence is:

```text
/welcome
-> /start
-> /color
-> /font
-> /bullets
-> /blocks
-> /navigation
-> /title-page
-> /manual-review
-> optional /ai-customize and /ai-compare
-> /final-review
```

Advanced AI handoff and import routes remain documented as optional compatibility tools rather than part of the normal beginner journey.

## README Design

Retain the approved centered logo, title, tagline, and AI-era LaTeX introduction. Restructure the remaining README into a concise landing page containing:

1. A short “Why BeamerForge” summary.
2. Installation and `npm start` quick start.
3. The canonical seven-stage workflow in one compact section.
4. A brief explanation of manual-only and optional AI-assisted use.
5. A concise description of outputs: editable Beamer project and compiled PDF when a compiler is available.
6. The existing recipe catalog, with working preview links.
7. Links to `WORKFLOW.md`, `ARCHITECTURE.md`, `GUIDE.md`, and the element catalog.
8. Existing security guidance for API keys and compatible endpoints, kept concise and accurate.

Remove duplicate legacy workflow sections, the nonexistent `templates/` directory, the nonexistent `CONTRIBUTING.md` link, and examples using obsolete element identifiers.

## Workflow Document Design

Rewrite `WORKFLOW.md` around the implemented workbench:

- Welcome explains the deliverables and AI-optional model.
- Direction starts from a natural-language vibe and presents curated visual directions.
- Style covers compatible color and type choices.
- Details covers bullets, blocks, navigation, and title-page layout.
- Review validates the cumulative manual design and freezes a protected baseline.
- Optional AI refinement accepts a plain-language request, produces a separate validated suggestion, and requires comparison and explicit selection.
- Build writes the selected complete project, compiles when possible, and exposes project and PDF downloads.

Document backward navigation, preserved compatible choices, validation gates, manual restoration, and the optional advanced handoff/import path.

## Architecture Document Design

Replace the original catalog-only architecture with a current module map:

- `registry/options.js`: supported palettes, fonts, bullets, blocks, navigation, title pages, and trusted vector logos.
- `schema/theme-schema.js`: validates theme identifiers and structure.
- `design/resolve-design.js`: resolves a theme into renderer-ready design data.
- `workbench/public/`: wizard state, cumulative selection state, previews, and browser interaction.
- `workbench/server.js`: API boundary, protected workflow state, previews, AI orchestration, generation, compilation, and downloads.
- `workbench/ai/`: provider configuration, bounded reference context, prompt construction, and suggestion coordination.
- `generators/`: writes complete Beamer projects from validated selected themes.
- `workbench/build.js` and preview cache modules: compiler discovery, PDF compilation, caching, and diagnostics.
- `elements/` and `recipes/`: source assets, visual references, fonts, and complete examples.

Show the principal data flow:

```text
Registry + saved theme
-> schema validation
-> resolved design
-> browser preview and manual review baseline
-> optional AI suggestion and comparison
-> explicit manual/AI selection
-> project generation
-> LaTeX compilation
-> project/PDF download
```

Document that AI suggestions are schema-constrained and do not directly execute arbitrary LaTeX from user references.

## Current Registry Examples

Examples must use identifiers exported by `registry/options.js`, such as:

- Palette: `academic-blue` or `midnight-blue`.
- Body font: `fira-sans` or `neuton`.
- Title font: `playfair-display` or `palatino`.

Examples should use the current theme JSON shape rather than legacy paths such as `typography/sans-serif-modern` or `layout/16-9-single`.

## Consistency Tests

Add a focused Node test that verifies:

- README, workflow, and architecture internal Markdown links resolve.
- No current-facing document references nonexistent `templates/`, `CONTRIBUTING.md`, or `elements/typography/` paths.
- The README and workflow contain the canonical stage names in order.
- Registry identifiers used in documented JSON examples exist in the exported registry.
- The README retains the production logo reference and links to the three canonical detailed documents.

The test should fail with a file and reference name that makes documentation drift easy to correct.

## Acceptance Criteria

- The README presents one concise and internally consistent current workflow.
- `WORKFLOW.md` matches the implemented normal and optional AI routes.
- `ARCHITECTURE.md` describes the current modules and protected state flow.
- Broken links, nonexistent directories, and obsolete catalog IDs are removed.
- The existing logo cover, recipe previews, API-key safety guidance, and design-review guide remain available.
- Documentation consistency tests and the complete repository test suite pass.

## Out of Scope

- Changing application behavior, route names, registry options, theme schema, or build logic.
- Rewriting historical specifications and implementation plans.
- Creating a full contribution guide in this change.
- Generating documentation automatically from source code.
