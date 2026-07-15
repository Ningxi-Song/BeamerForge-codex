# BeamerForge Logo Design

## Purpose

Create a compact, standalone symbol for BeamerForge's GitHub and README branding. The mark should feel academic and refined while communicating the project's role as a tool for crafting Beamer presentations.

## Approved Direction

The logo combines two simple ideas:

- A presentation screen represents Beamer and slide design.
- A restrained hammer gesture represents the “Forge” name and template-making workflow.

The symbol is geometric rather than typographic. It contains no text or embedded fonts, so it remains portable and renders consistently across browsers, Markdown, and LaTeX-related tooling.

## Visual Specification

- Format: transparent vector SVG.
- Primary color: slate `#303B48`.
- Accent color: academic blue `#5F8FBF`.
- Shape: presentation screen and stand, paired with a compact hammer above the screen's upper-right area and a small anvil-like base below it.
- Background: none. The SVG canvas remains transparent.
- Styling: medium-weight strokes, rounded line caps, and restrained geometry.
- Minimum recommended display size: 32 × 32 pixels.

## Variants and Deliverables

The implementation will provide:

1. A primary transparent SVG for light backgrounds using slate and academic blue.
2. A transparent dark-background SVG using a light slate stroke and a brighter blue accent.
3. A monochrome SVG for contexts that cannot preserve the two-color palette.
4. PNG exports at common GitHub/README sizes if the local rendering toolchain supports reliable raster export.
5. A short usage note with Markdown examples and minimum-size guidance.

## Placement

Production assets should live in a dedicated repository branding or assets directory rather than in the temporary `.superpowers/brainstorm/` preview area. The README may reference the primary SVG once the assets are complete.

## README Cover Treatment

Replace the current README heading and opening sentence with a centered cover treatment:

```html
<p align="center">
  <img src="assets/branding/beamerforge-logo.svg" width="144"
       alt="BeamerForge logo">
</p>

<h1 align="center">BeamerForge</h1>

<p align="center">
  Craft distinctive, reproducible Beamer presentations with a visual
  design catalog and an AI-guided workflow.
</p>
```

Follow the cover with this introduction before the existing “How It Works” section:

> BeamerForge turns presentation design into a structured, inspectable workflow. In the AI era, LaTeX’s foundation in the Turing-complete TeX language is a genuine advantage: models can generate and transform plain-text source, humans can review every change, and mature compilers produce reproducible PDFs. Unlike opaque slide binaries, Beamer projects are versionable, composable, and portable. BeamerForge adds curated visual language and a guided path—from vibe to direction, palette, details, and complete template—so AI can design deliberately instead of improvising from scratch.

The remainder of the README begins with the existing “How It Works” section and remains unchanged except where a relative logo path or surrounding spacing must be adjusted for correct rendering.

## Acceptance Criteria

- The master SVG has a transparent background and no font dependency.
- The mark is recognizable at 32 pixels.
- Light and dark variants retain sufficient contrast on typical GitHub backgrounds.
- SVG files parse successfully and use a consistent view box.
- The README usage example renders the asset without requiring external resources.
- The README begins with the approved centered logo, project name, tagline, and introduction.

## Out of Scope

- A wordmark or custom typeface.
- Animated logo variants.
- A rounded-square badge or other enclosing background.
- Changes to Beamer templates or catalog elements.
