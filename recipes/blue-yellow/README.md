<div align="center">
  <img src="assets/cafe_left.png" width="520" alt="Blue Yellow cafe illustration">
  <h1>Blue Yellow</h1>
  <p><strong>An academic Beamer recipe shaped by blue-yellow confrontation, political identity, and everyday choices.</strong></p>
  <p><em>Opposing colors. Contested identities. Evidence in the space between.</em></p>
  <p><strong>Contributor:</strong> Willie SONG</p>
</div>

## Preview

![Blue Yellow slide preview](preview-contact-sheet.png)

[View the complete PDF](main.pdf)

## Inspiration

Blue Yellow originates in the creator's interpretation of confrontation during Hong Kong's political unrest. Blue and yellow carry the central meaning of the template: opposing political identities and the tension that reaches into everyday economic choices. **Politics on the Menu** places those questions in the setting of restaurants and consumer behavior; the cafe illustration above recalls that research setting.

The visual composition gives both colors substantial weight. Oblique blue and yellow fields flank a white interval on the cover, with the typography stepping along its edge. Chapter pages bring the fields in from above and below. The separation between them expresses tension without turning the slide into an illustration of a literal object.

Evidence pages translate the same contrast into paired blue-yellow rules, clear typography, and spacious charts and tables.

## Best For

Political economy seminars, consumer-behavior research, and presentations about identity, social interaction, and everyday economic choices.

## Elements

| Layer | Element |
| --- | --- |
| Canvas | 16:9 widescreen |
| Colors | Blue `#1649B8`, yellow `#F4CD28`, ink `#19232F`, and white |
| Fonts | TeX Gyre Heros sans-serif; Latin Modern mathematics |
| Navigation | Small gray section label, paired blue-yellow rules, and configurable footer labels |
| Blocks | Open subheadings and pale-yellow takeaway strips |
| Title page | Opposing oblique blue-yellow fields with staggered typography in the white interval |
| Section dividers | Blue and yellow fields framing a white band, with modest chapter numbers |
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

Edit the title, subtitle, author, institution, and date in `demo.tex`, then replace its example frames with your own research. The following minimal example uses the theme's existing metadata commands. Keep the title frame plain and keep the cover title concise.


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

Adjust the `PMBlue`, `PMYellow`, and `PMInk` definitions in the theme to change its palette. The cover and chapter dividers use fixed text positions, so keep headings concise and check the rendered output after changing text. The original edition is preserved in `original/`; compile its `demo.tex` from that folder to reproduce it.

The supplied review counts, trend coordinates, and regression entries are preserved. The chart and result table now occupy separate slides; the example explicitly identifies missing units and inference details instead of inventing them.

Replace demonstration numbers, dates, and research statements with your own verified material before presenting.
