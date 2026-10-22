<div align="center">
  <img src="assets/cafe_left.png" width="520" alt="Blue Yellow cafe illustration">
  <h1>Blue Yellow</h1>
  <p><strong>A bold blue-yellow Beamer recipe for political economy and everyday choices.</strong></p>
  <p><em>Everyday tables. Different identities. A shared space for inquiry.</em></p>
  <p><strong>Contributor:</strong> Willie SONG</p>
</div>

## Preview

![Blue Yellow slide preview](preview-contact-sheet.png)

[View the complete PDF](main.pdf)

## Inspiration

Designed for **Politics on the Menu**, Blue Yellow begins with a cafe: an everyday setting where identity and economic choices meet. The introduction keeps that cafe illustration, while the redesigned slides translate the dining table into a geometric plate, fork, and knife.

The poster-inspired edition pairs saturated ultramarine with bright yellow, large sans-serif typography, and generous white space. Blue introduces the talk, yellow marks its chapters, and white gives the evidence room to breathe. Its graphic rhythm is deliberately distinct from the catalog's softer, serif-led research themes.

## Best For

Political economy seminars, consumer-behavior research, and presentations about identity, social interaction, and everyday economic choices.

## Elements

| Layer | Element |
| --- | --- |
| Canvas | 16:9 widescreen |
| Colors | Ultramarine `#173BD1`, yellow `#FFD43B`, ink `#17213B`, and white |
| Fonts | TeX Gyre Heros sans-serif; Latin Modern mathematics |
| Navigation | Small section label, yellow title marker, and configurable footer labels |
| Blocks | Open subheadings and flat pale-yellow takeaway strips |
| Title page | Solid blue with a yellow plate and white cutlery, drawn in TikZ |
| Section dividers | Solid yellow with oversized blue chapter numbers |
| Evidence | Full-width trend chart and a separate, spacious results table |
| Example | 13 slides, including five chapter dividers |
| Theme name | `PoliticsMenu`; the catalog folder is `blue-yellow` |

## Quick Start

Run from this folder with a LaTeX distribution containing Beamer, TikZ, PGFPlots, booktabs, colortbl, Latin Modern, and TeX Gyre fonts:

```bash
pdflatex -interaction=nonstopmode -halt-on-error demo.tex
pdflatex -interaction=nonstopmode -halt-on-error demo.tex
```

Alternatively, use `latexmk -pdf demo.tex`. The source entry point remains `demo.tex` and produces `demo.pdf`. The catalog copy is named `main.pdf`; refresh it from `demo.pdf` after recompiling, then regenerate the PNG previews.

## File Structure

```text
blue-yellow/
|-- README.md
|-- beamerthemePoliticsMenu.sty # Theme and reusable commands
|-- demo.tex                   # Editable example and metadata
|-- demo.pdf                   # Redesigned compiled example
|-- main.pdf                   # Same PDF under the catalog filename
|-- page*.png                  # Rendered slide previews
|-- preview-contact-sheet.png  # Combined preview
|-- VALIDATION.md             # Rendering and verification notes
|-- original/                 # Preserved original source, PDF, README, and assets
`-- assets/
    |-- cafe_left.png          # README introduction illustration
    `-- menu_corner.png        # Preserved original artwork
```

## Customization

Edit the title, subtitle, author, institution, and date in `demo.tex`, then replace its example frames with your own research. The following minimal example uses the theme's existing metadata commands. Keep the title frame plain and insert a deliberate line break for a two-line cover title.


```tex
\documentclass[aspectratio=169,11pt]{beamer}
\usetheme{PoliticsMenu}

\title[Politics on the Menu]{Politics on\\the Menu}
\subtitle{Political Identity, Consumer Sorting,\\and Restaurant Engagement}
\author{Your Name}
\institute[Your University]{Department of Economics\\Your University}
\date{April 12, 2024}
\PMseminar{Economics Research Seminar}
\PMtopright{Economics Research Seminar\quad\textbar\quad Spring 2024}

\begin{document}
\begin{frame}[plain]\titlepage\end{frame}
\section{Motivation}
\begin{frame}{Motivation}
Your content.
\end{frame}
\end{document}
```

### Useful theme commands

- `\PMseminar{...}` - seminar name on the title slide.
- `\PMtopright{...}` - right side of the title-slide header.
- `\PMleftfooter{...}` and `\PMcenterfooter{...}` - footer labels.
- `\PMsectiontagline{...}` - section-divider subtitle.
- `\PMassetpath{path/}` - retained for compatibility; the new artwork needs no external image assets.
- Theme option `nosectionpages` disables automatic section-divider slides.

Adjust the `PMBlue`, `PMYellow`, and `PMInk` definitions in the theme to change its palette. The cover and chapter dividers use fixed geometric compositions, so keep headings concise and check the rendered output after changing text. The original edition is preserved in `original/`; compile its `demo.tex` from that folder to reproduce it.

The supplied review counts, trend coordinates, and regression entries are preserved. The chart and result table now occupy separate slides; the example explicitly identifies missing units and inference details instead of inventing them.

Replace demonstration numbers, dates, and research statements with your own verified material before presenting.
