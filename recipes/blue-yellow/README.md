<div align="center">
  <img src="assets/cafe_left.png" width="520" alt="Blue Yellow cafe illustration">
  <h1>Blue Yellow</h1>
  <p><strong>A blue-yellow Beamer recipe for political economy and the choices of everyday life.</strong></p>
  <p><em>Everyday tables. Different identities. A shared space for inquiry.</em></p>
  <p><strong>Contributor:</strong> Willie SONG</p>
</div>

## Preview

![Blue Yellow slide preview](preview-contact-sheet.png)

[View the complete PDF](main.pdf)

## Inspiration

Designed for **Politics on the Menu**, Blue Yellow brings the setting of a cafe into an academic presentation. Pale restaurant artwork connects the argument to everyday consumption; blue and yellow give contrasting identities a common visual structure. The illustration stays in the background so that questions about political identity, consumer sorting, and restaurant engagement remain central.

## Best For

Political economy seminars, consumer-behavior research, and presentations about identity, social interaction, and everyday economic choices.

## Elements

| Layer | Element |
| --- | --- |
| Canvas | 16:9 widescreen |
| Colors | Navy `#0A3555`, blue `#2F6689`, yellow `#E5B51B`, and white |
| Fonts | New TX serif text and mathematics when installed; Palatino fallback |
| Navigation | Section header and configurable footer labels |
| Blocks | Pale panels with navy text and yellow accents |
| Title page | Cafe artwork with seminar and presenter metadata |
| Section dividers | Menu-corner artwork and a configurable tagline |
| Theme name | `PoliticsMenu`; the catalog folder is `blue-yellow` |

## Quick Start

Run from this folder with a LaTeX distribution containing Beamer, TikZ, PGFPlots, and booktabs:

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
|-- demo.pdf                   # Supplied compiled example
|-- main.pdf                   # Same PDF under the catalog filename
|-- page*.png                  # Rendered slide previews
|-- preview-contact-sheet.png  # Combined preview
`-- assets/
    |-- cafe_left.png          # Title-page illustration
    `-- menu_corner.png        # Section-divider illustration
```

## Customization

Edit the title, subtitle, author, institution, and date in `demo.tex`, then replace its example frames with your own research. The following minimal example retains the theme's original API.


```tex
\documentclass[aspectratio=169,11pt]{beamer}
\usetheme{PoliticsMenu}

\title[Politics on the Menu]{Politics on the Menu:}
\subtitle{Political Identity, Consumer Sorting,\\and Restaurant Engagement}
\author{Your Name}
\institute[Your University]{Department of Economics\\Your University}
\date{April 12, 2024}
\PMseminar{Economics Research Seminar}
\PMtopright{Economics Research Seminar\quad\textbar\quad Spring 2024}

\begin{document}
\begin{frame}\titlepage\end{frame}
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
- `\PMassetpath{path/}` - change the asset directory if needed.
- Theme option `nosectionpages` disables automatic section-divider slides.

The decorative artwork is deliberately pale so that it remains a background element rather than competing with the economics content.

Replace demonstration numbers, dates, and research statements with your own verified material before presenting.
