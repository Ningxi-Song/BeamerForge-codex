# Beamer Design System

A catalog of Beamer design elements with AI-assisted template generation. Browse elements, pick what you like, and AI assembles them into a complete, compilable template.

## How It Works

Design flows from **vague to specific**. See [WORKFLOW.md](WORKFLOW.md) for the full process.

```
Vibe → Direction → Palette → Details → Template

"I want something modern"  →  3 directions  →  3 palettes  →  fine-tune  →  .tex file
```

## Cumulative HTML Wizard

The local HTML wizard designs a Beamer template one decision at a time while keeping `theme.json` as the source of truth.

```bash
npm test
npm start
```

Open `http://localhost:5177/start`.

The wizard flow is:

```text
Default Template -> Color -> Font -> Bullets -> Blocks -> Navigation -> Title Page -> Review & Generate
```

Each step previews the accumulated choices. Users can go back to an earlier step and keep later compatible choices. Generation is blocked until every step is valid.

## Workflow

### Step 1: Tell Us the Vibe

Describe the overall feeling in natural language. No technical terms needed.

```
"I want something modern and techy"
"Make it look like a serious academic talk"
"Something clean and minimal"
```

### Step 2: Pick a Direction

We show 2-3 visual directions based on your vibe. Each is a mood board — a single slide showing color palette, font feel, and overall tone.

### Step 3: Pick a Palette

We suggest 2-3 specific color + font combinations within your chosen direction.

### Step 4: Fine-tune Details

We ask about bullets, blocks, navigation, and title page — one at a time, with visual previews.

### Step 5: Get Your Template

We generate a complete `.tex` file with:
- All selected elements combined
- Compilation instructions
- Customization guide

## Catalog Structure

```
beamer-design-system/
├── README.md                 # This file
├── ARCHITECTURE.md           # Layer × Element relationship
├── GUIDE.md                  # Design review checklist
│
├── elements/                 # Design element catalog
│   ├── colors/               # Color themes, palettes, gradients
│   ├── fonts/              # Font families, sizes, spacing
│   ├── layout/               # Page geometry, columns, grids
│   ├── frames/               # Title page, section page, summary page
│   ├── navigation/           # Headers, footers, page numbers
│   ├── decorations/          # TikZ shapes, backgrounds, dividers
│   ├── emphasis/             # Block styles, highlights, code blocks
│   ├── animation/            # Transitions, overlays, reveals
│   └── content/              # Reusable content block patterns
│
├── recipes/                  # Pre-composed element combinations
├── templates/                # Ready-to-compile .tex files
└── anti-patterns/            # Common mistakes and fixes
```

## Template Catalog

Each template is a complete, compilable Beamer theme with its own personality and best-fit scenario.

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

## For AI Users

This repository is designed to be read by AI as context. When you ask AI to create a Beamer template, point it to this repo:

```
Read the Beamer design catalog at [repo-url], then create a template
using: colors/dark-blue, typography/sans-serif-modern, layout/16-9-single
```

AI will:
1. Read the relevant element files
2. Understand the design constraints
3. Generate a complete, compilable template
4. Review it against the guidelines

## Element Naming Convention

Each element uses a consistent ID format:

```
{category}/{name}
```

Examples:
- `colors/dark-blue` — dark blue color theme
- `colors/light-green-minimal` — light green minimal theme
- `typography/serif-classic` — classic serif font combination
- `frames/title-center` — centered title page layout

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on adding new elements.

## License

MIT
