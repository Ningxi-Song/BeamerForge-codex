# HTML Beamer Workbench Design

> Superseded product-shape note: the single-screen workbench UI described in
> this document has been superseded by
> `docs/superpowers/specs/2026-06-28-cumulative-workbench-wizard-design.md`.
> The source-of-truth, generation, local server, and compile pipeline ideas
> remain valid unless contradicted by the newer cumulative wizard design.

## Summary

BeamerForge should add a local HTML workbench for designing Beamer templates.
HTML is the fast interactive design surface, while Beamer remains the stable,
authoritative compile target.

The first version will be a local server workbench. Users edit a structured
`theme.json` design state through browser controls, see an immediate HTML slide
preview, generate complete Beamer files, and compile them with XeLaTeX or
`latexmk` to inspect the real PDF output.

## Goals

- Preserve the existing vague-to-specific design process.
- Let users explore colors, fonts, bullets, blocks, footlines, navigation, and
  title pages in one live workbench.
- Keep `theme.json` as the source of truth for both HTML preview and Beamer
  generation.
- Generate complete, compilable Beamer projects under `templates/<name>/`.
- Show build status, useful LaTeX errors, warnings, and preview assets.
- Keep the existing `elements/`, `recipes/`, and `preview/` catalog useful.

## Non-Goals

- Pixel-perfect HTML replication of Beamer rendering.
- A full multi-project platform with accounts, galleries, or remote builds.
- Editing arbitrary LaTeX through the browser.
- Supporting every catalog element in the first version.

## Product Shape

The selected direction is a live template workbench rather than a rigid wizard.
The screen has three regions:

- Left: stepwise controls for design decisions.
- Center: live HTML slide preview.
- Right: output actions and build status.

The controls still follow the repository workflow:

1. Vibe and direction.
2. Color combinations.
3. Font pairing.
4. Bullets and blocks.
5. Footline and navigation.
6. Title page layout.
7. Generate and compile.

This keeps one-decision-at-a-time guidance while letting the user see the whole
template context after each change.

## Architecture

Version 1 uses a local server workbench:

```text
HTML controls -> theme.json -> Beamer generator -> XeLaTeX PDF
                         |              |
                         v              v
               HTML slide preview   generated project
```

The HTML preview is for fast exploration. The compiled PDF is the final visual
authority because Beamer spacing, package behavior, and fonts can differ from
browser rendering.

The local server should provide:

- Static workbench UI.
- API route to read and write `theme.json`.
- API route to generate Beamer files from tokens.
- API route to run XeLaTeX or `latexmk`.
- API route to read build status, logs, and preview output paths.

Node is the preferred version 1 runtime because the browser UI and generator can
share JavaScript objects for tokens and registry metadata.

## Source Of Truth

The source of truth is a structured `theme.json`, not raw LaTeX.

Example shape:

```json
{
  "name": "blue-academic",
  "aspectRatio": "16:9",
  "colors": {
    "paletteId": "academic-blue",
    "background": "#FFFFFF",
    "primary": "#456990",
    "accent": "#57C3C2",
    "text": "#000000"
  },
  "fonts": {
    "body": "Palatino",
    "title": "Palatino",
    "mode": "serif-academic"
  },
  "bullets": {
    "style": "pifont-outline"
  },
  "blocks": {
    "style": "rounded"
  },
  "navigation": {
    "style": "soft-miniframes"
  },
  "titlePage": {
    "layout": "left-curtain"
  }
}
```

Version 1 token groups:

- `identity`: name, title placeholders, author placeholders, output path.
- `foundation`: aspect ratio, base layout, title page, navigation.
- `colors`: palette ID and resolved colors.
- `fonts`: font family IDs and rendering mode.
- `bullets`: marker style and nesting defaults.
- `blocks`: Beamer block style and color mapping.
- `navigation`: header, footline, page number, miniframe behavior.
- `titlePage`: title page layout and optional image behavior.
- `contentDefaults`: sample bullet, figure, table, and section slides.
- `build`: generated filenames, compile status, warnings, and logs.

A new control should be added only when it can affect both the HTML preview and
the generated LaTeX output.

## Repository Layout

Existing folders remain catalog inputs:

- `elements/`: element docs and examples.
- `recipes/`: complete template references.
- `preview/`: generated preview images and galleries.

New folders:

- `workbench/`: local server, browser UI, preview renderer, API routes.
- `schema/`: `theme.json` schema and validation helpers.
- `registry/`: curated metadata connecting element IDs to token options.
- `generators/`: token-to-Beamer generation code.
- `templates/<name>/`: generated complete Beamer projects.

Build logs and LaTeX intermediate files should not be committed.

## Generator Output

For a generated template, the system writes:

```text
templates/<template-name>/
  main.tex
  theme.cls
  theme.json
  README.md
  content/
  fig/
  font/
  preview.pdf
  preview-contact-sheet.png
```

The generated `main.tex` should stay small, similar to current recipes. The
custom class file owns theme implementation: colors, fonts, item markers,
blocks, navigation, title page, and footline.

## Build Loop

The compile pipeline is:

```text
validate theme.json
  -> generate main.tex/theme.cls/README/sample slides
  -> run latexmk -xelatex or xelatex
  -> render PDF/PNG preview assets
  -> report success, warnings, or errors
```

Expected behavior:

- HTML preview updates immediately after control changes.
- PDF compilation runs only when the user clicks `Compile PDF`.
- A successful build creates or updates the template folder.
- A failed build preserves logs and shows a useful error excerpt.
- Missing XeLaTeX or `latexmk` produces setup guidance rather than a silent
  failure.

## Error Handling

Validation errors should be field-level where possible:

- Missing required token group.
- Invalid color value.
- Unknown registry element ID.
- Font selected in tokens but unavailable to the generator.
- Unsupported option combination.

Build errors should include:

- Exit status.
- Relevant LaTeX log excerpt.
- Path to the full log.
- Last successful generated output, when available.

## Testing And Verification

Version 1 should include:

- Schema validation tests for valid and invalid `theme.json`.
- Registry tests for required element metadata.
- Generator snapshot tests for at least one complete theme.
- A smoke compile that generates and compiles one Beamer template with XeLaTeX
  or `latexmk`.
- A visual sanity check that a PDF and preview PNG/contact sheet are created.

## Rollout

The first implementation should prove one complete vertical slice:

1. One palette family.
2. Two font choices.
3. Two bullet styles.
4. Two navigation or footline choices.
5. One title page layout.
6. One generated template folder.
7. One successful compile smoke test.

After that slice works, additional catalog elements can be added through the
registry without changing the architecture.
