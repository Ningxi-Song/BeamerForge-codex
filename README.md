<p align="center">
  <img src="assets/branding/beamerforge-logo.svg" width="144" alt="BeamerForge logo">
</p>

<h1 align="center">BeamerForge</h1>

<p align="center">
  Craft distinctive, reproducible Beamer presentations with a visual design catalog and an AI-guided workflow.
</p>

BeamerForge turns presentation design into a structured, inspectable workflow. In the AI era, LaTeX's foundation in the Turing-complete TeX language is a genuine advantage: models can generate and transform plain-text source, humans can review every change, and mature compilers produce reproducible PDFs. Unlike opaque slide binaries, Beamer projects are versionable, composable, and portable. BeamerForge adds curated visual language and a guided path—from vibe to direction, style, details, and a complete project—so AI can design deliberately instead of improvising from scratch.

## Why BeamerForge

- **AI-readable source:** LaTeX projects are plain text, structured, reviewable, and easy for models to transform.
- **Reproducible output:** the same validated source can be compiled into the same presentation instead of being trapped in an opaque slide binary.
- **Deliberate visual design:** curated palettes, typography, bullets, blocks, navigation, and title-page patterns give AI a design vocabulary rather than a blank canvas.
- **Human control:** every choice remains inspectable, editable, and reversible; AI refinement is optional.

## Quick Start

```bash
npm start
```

Open `http://localhost:5177/welcome` and select **Start designing**. Manual design, preview, project generation, and downloads do not require an AI provider. A local LaTeX compiler is required only for the final PDF.

## Workflow

```text
Welcome -> Direction -> Style -> Details -> Review -> Optional AI refinement -> Build
```

1. **Welcome:** see what BeamerForge produces and begin a design session.
2. **Direction:** describe the desired feeling and compare curated visual directions.
3. **Style:** choose compatible color and type combinations.
4. **Details:** tune bullets, blocks, navigation, and title-page layout.
5. **Review:** validate the cumulative manual design and freeze a protected baseline.
6. **Optional AI refinement:** request a change in ordinary language, compare it with the protected manual version, and explicitly choose one.
7. **Build:** generate the complete editable Beamer project and compile a PDF when a supported LaTeX compiler is available.

See the detailed [Workflow](WORKFLOW.md) for navigation, validation, manual-only use, AI comparison, and advanced handoff/import behavior.

## Optional AI Refinement

At Review, choose **Refine with AI** only when you want a suggestion. Your reviewed manual design remains protected while BeamerForge creates a separate schema-validated candidate. You can compare both versions, revise the request, keep the manual design, or accept the suggestion.

API keys entered in the connection dialog live only in the running local server process. They are not written to theme files, browser storage, handoff folders, logs, or connection-status responses. You may instead set `OPENAI_API_KEY` or `DEEPSEEK_API_KEY` before running `npm start`. Compatible remote endpoints must use HTTPS; loopback HTTP endpoints are allowed for local models.

## Current Theme Example

```json
{
  "colors": { "paletteId": "academic-blue" },
  "fonts": { "body": "fira-sans", "title": "playfair-display" },
  "bullets": { "style": "triangle" },
  "blocks": { "style": "rounded" },
  "navigation": { "style": "soft-miniframes" },
  "titlePage": { "layout": "left-curtain" }
}
```

The complete theme schema contains additional presentation identity, content defaults, decoration, and transition fields. The workbench writes a validated complete theme before generation.

## Template Catalog

Each recipe is a complete, compilable Beamer theme with its own personality and best-fit scenario.

### [D Rose](recipes/d-rose/) - Bloom in Darkness

| Aspect | Description |
|--------|-------------|
| **Inspiration** | Derrick Rose (NBA superstar): his logo, his career of soaring highs and crushing lows |
| **Core concept** | Oppression and blooming coexist; prosperity and regret are inseparable |
| **Visual tone** | Deep red against white, serif fonts, subdued elegance with an undercurrent of tension |
| **Best for** | Polarizing topics: social inequality, urban segregation, crisis narratives, dualities |
| **Colors** | Red-black primary (RGB 186,84,68), white background, dark navy structure |
| **Fonts** | Neuton (serif, bundled) |
| **Navigation** | Miniframes header, page-number footer |
| **Blocks** | Regular block with dark gray title and light red body; alert block with red title and light red body |
| **Bullets** | Pifont ding outline style |
| **Preview** | [page01](recipes/d-rose/page01.png) / [page04](recipes/d-rose/page04.png) / [page06](recipes/d-rose/page06.png) |

### [Bamboo](recipes/bamboo/) - Clean Academic Structure

| Aspect | Description |
|--------|-------------|
| **Creator** | Willie SONG |
| **Inspiration** | Chinese landscape painting, especially the crisp, upright, and forceful brushwork of bamboo |
| **Core concept** | Clean academic structure with fresh, transparent elements and a firm visual rhythm |
| **Visual tone** | Blue-white academic palette, Palatino serif text, clean blocks, generous white space, and a crisp bamboo-inspired restraint |
| **Best for** | Research talks, policy briefings, concept pitches, and analytical presentations |
| **Colors** | Original blue-white palette with subtle alert accents |
| **Fonts** | Palatino serif body text |
| **Navigation** | Miniframes header, page-number footer |
| **Blocks** | Rounded Beamer blocks in normal, example, and alert styles; sample takeaway uses normal blue block |
| **Bullets** | Original pifont markers |
| **Title page** | Optional right-side image with a white curtain for title text |
| **Preview** | [page01](recipes/bamboo/page01.png) / [page04](recipes/bamboo/page04.png) / [page07](recipes/bamboo/page07.png) |

## Documentation

- [Workflow](WORKFLOW.md) — the complete normal, manual-only, optional AI, and advanced compatibility journeys.
- [Architecture](ARCHITECTURE.md) — modules, state boundaries, rendering, AI orchestration, generation, and compilation.
- [Design review guide](GUIDE.md) — human checks for hierarchy, typography, color, spacing, and slide composition.
- [`elements/`](elements/) — source assets and visual references.
- [`recipes/`](recipes/) — complete compilable examples.

## License

MIT
