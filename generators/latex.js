"use strict";

const { getRegistry } = require("../registry/options");
const { resolveDesignBundle } = require("../design/resolve-design");
const { hexWithoutHash, normalizeLatexNewlines, joinNonEmpty } = require("../lib/utils");
const { renderTikz, formatNumber, tikzScaleForTargetWidth } = require("../design/vector-renderers");

const LATEX_SPECIAL_CHARS = {
  "\\": "\\textbackslash{}",
  "&": "\\&",
  "%": "\\%",
  "$": "\\$",
  "#": "\\#",
  "_": "\\_",
  "{": "\\{",
  "}": "\\}",
  "~": "\\textasciitilde{}",
  "^": "\\textasciicircum{}"
};

function escapeLatex(value) {
  return String(value).replace(/[\\&%$#_{}~^]/g, (ch) => LATEX_SPECIAL_CHARS[ch]);
}

function aspectRatioOption(ratio) {
  return ratio === "16:9" ? "aspectratio=169" : ratio === "4:3" ? "aspectratio=43" : "";
}

function latexDate(value) {
  return value === "\\today" ? value : escapeLatex(value);
}

function titleFontSetup(bodyFont, titleFont) {
  const empty = { setup: "", definition: "", familyOption: "" };
  if (!bodyFont || !titleFont) return empty;
  if (
    bodyFont.latexPreamble === titleFont.latexPreamble
    && bodyFont.cssFamily === titleFont.cssFamily
  ) return empty;

  const preamble = normalizeLatexNewlines(titleFont.latexPreamble);
  const fontspecMatch = preamble.match(/\\setmainfont(\[[^\]]*\])?\{([^}]+)\}/);
  if (fontspecMatch) {
    const opts = fontspecMatch[1] || "";
    return {
      setup: "\\usepackage{fontspec}",
      definition: `\\newfontfamily\\bfTitleFont${opts}{${fontspecMatch[2]}}`,
      familyOption: "family=\\bfTitleFont,"
    };
  }

  if (titleFont.latexTitlePackage && titleFont.latexTitleFamily) {
    return {
      setup: titleFont.latexTitlePackage,
      definition: `\\newcommand{\\bfTitleFont}{\\fontfamily{${titleFont.latexTitleFamily}}\\selectfont}`,
      familyOption: "family=\\bfTitleFont,"
    };
  }

  return empty;
}

const TITLE_PAGE_TEMPLATES = {
  "left-curtain": String.raw`\setbeamertemplate{title page}{%
  \vbox{}
  \vfill
  \begin{beamercolorbox}[wd=\paperwidth,leftskip=1.2cm,rightskip=1.2cm]{title}
    \usebeamerfont{title}\inserttitle\par
    \vspace{0.35cm}
    \usebeamerfont{subtitle}\usebeamercolor[fg]{subtitle}\insertsubtitle\par
    \vspace{0.9cm}
    \usebeamerfont{author}\usebeamercolor[fg]{author}\insertauthor\par
    \vspace{0.15cm}
    \usebeamerfont{institute}\usebeamercolor[fg]{institute}\insertinstitute\par
    \vspace{0.15cm}
    \usebeamerfont{date}\usebeamercolor[fg]{date}\insertdate\par
  \end{beamercolorbox}
  \vfill
}`,
  centered: String.raw`\setbeamertemplate{title page}{%
  \vbox{}
  \vfill
  \begin{beamercolorbox}[wd=\paperwidth,center]{title}
    \usebeamerfont{title}\inserttitle\par
    \vspace{0.4cm}
    \usebeamerfont{subtitle}\usebeamercolor[fg]{subtitle}\insertsubtitle\par
    \vspace{1.2cm}
    \usebeamerfont{author}\usebeamercolor[fg]{author}\insertauthor\par
    \vspace{0.2cm}
    \usebeamerfont{institute}\usebeamercolor[fg]{institute}\insertinstitute\par
    \vspace{0.2cm}
    \usebeamerfont{date}\usebeamercolor[fg]{date}\insertdate\par
  \end{beamercolorbox}
  \vfill
}`,
  "bottom-aligned": String.raw`\setbeamertemplate{title page}{%
  \vbox{}
  \vfill
  \begin{beamercolorbox}[wd=\paperwidth,leftskip=1.2cm,rightskip=1.2cm,sep=0.8cm]{title}
    \usebeamerfont{title}\inserttitle\par
    \vspace{0.3cm}
    \usebeamerfont{subtitle}\usebeamercolor[fg]{subtitle}\insertsubtitle\par
    \vspace{0.6cm}
    \usebeamerfont{author}\usebeamercolor[fg]{author}\insertauthor\par
    \vspace{0.15cm}
    \usebeamerfont{institute}\usebeamercolor[fg]{institute}\insertinstitute\par
    \vspace{0.15cm}
    \usebeamerfont{date}\usebeamercolor[fg]{date}\insertdate\par
  \end{beamercolorbox}
}`
};

function generateMainTex(design) {
  const id = design.identity;
  return `${String.raw`\documentclass[10pt]{theme}

\title{`}${escapeLatex(id.title || "")}${String.raw`}
\subtitle{`}${escapeLatex(id.subtitle || "")}${String.raw`}
\author{`}${escapeLatex(id.author || "")}${String.raw`}
\institute{`}${escapeLatex(id.institute || "")}${String.raw`}
\date{`}${latexDate(id.date || "")}${String.raw`}

\begin{document}

\begin{frame}[plain]
  \titlepage
\end{frame}

\input{content/overview.tex}
\input{content/figures.tex}
\input{content/tables.tex}

\end{document}
`}`;
}

function generateClassTex(design) {
  const { bullet, block, navigation, titlePage, cornerLogo } = design.components;
  const aspect = aspectRatioOption(design.canvas.aspectRatio);
  const classOptions = ["10pt", aspect].filter(Boolean).join(",");
  const bulletPkg = bullet.latexPackages ? `${normalizeLatexNewlines(bullet.latexPackages)}\n` : "";
  const outerTheme = navigation.latexOuterTheme ? `${normalizeLatexNewlines(navigation.latexOuterTheme)}\n` : "";
  const footline = navigation.latexFootline ? `${normalizeLatexNewlines(navigation.latexFootline)}\n` : "";
  const titleFont = titleFontSetup(design.typography.body, design.typography.title);
  const fontPreamble = joinNonEmpty([
    titleFont.setup,
    normalizeLatexNewlines(design.typography.body.latexPreamble),
    titleFont.definition
  ]);
  const blockTemplate = normalizeLatexNewlines(block.latexTemplate);
  const titlePageTemplate = TITLE_PAGE_TEMPLATES[titlePage.layout]
    || TITLE_PAGE_TEMPLATES["left-curtain"];
  const frametitleTemplate = navigation.header ? String.raw`
\setbeamertemplate{frametitle}{%
  \nointerlineskip
  \begin{beamercolorbox}[wd=\paperwidth,leftskip=0.3cm,rightskip=0.3cm,ht=2.2ex,dp=1.2ex]{frametitle}
    \usebeamerfont{frametitle}\insertframetitle
  \end{beamercolorbox}%
  \vspace*{-0.5ex}%
  \begin{beamercolorbox}[wd=\paperwidth,ht=0.4pt,dp=0pt]{structure}
    \rule{\paperwidth}{0.4pt}
  \end{beamercolorbox}%
}
` : "";
  const logoWidth = `${cornerLogo.sizeUnits}cm`;
  const logoScale = cornerLogo.vector === null
    ? "0"
    : formatNumber(tikzScaleForTargetWidth(cornerLogo.vector, cornerLogo.sizeUnits));
  const logoX = cornerLogo.position === "top-left" ? "0.4cm" : String.raw`\dimexpr\paperwidth-${logoWidth}-0.4cm\relax`;
  const logoGuardOpen = cornerLogo.scope === "content-frames" ? String.raw`\ifnum\insertframenumber>1\relax` : "";
  const logoGuardClose = cornerLogo.scope === "content-frames" ? String.raw`\fi` : "";
  let logoTemplate = "";
  if (cornerLogo.vector !== null) logoTemplate = String.raw`
\RequirePackage{tikz}
\RequirePackage[absolute,overlay]{textpos}
\setbeamertemplate{background canvas}{%
  ${logoGuardOpen}
  \begin{textblock*}{${logoWidth}}(${logoX},0.35cm)
    \begin{tikzpicture}[scale=${logoScale}]
${renderTikz(cornerLogo.vector, { strokeScale: Number(logoScale) })}
    \end{tikzpicture}
  \end{textblock*}%
  ${logoGuardClose}
}
`;

  return String.raw`\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{theme}[2026/06/28 BeamerForge generated theme]
\LoadClass[${classOptions}]{beamer}

\RequirePackage{xcolor}
\RequirePackage{booktabs}
${bulletPkg}${fontPreamble}
${outerTheme}
${blockTemplate}
\setbeamertemplate{navigation symbols}{}
${footline}
\definecolor{bfBackground}{HTML}{${hexWithoutHash(design.colors.background)}}
\definecolor{bfPrimary}{HTML}{${hexWithoutHash(design.colors.primary)}}
\definecolor{bfAccent}{HTML}{${hexWithoutHash(design.colors.accent)}}
\definecolor{bfText}{HTML}{${hexWithoutHash(design.colors.text)}}
\definecolor{bfBlockBody}{HTML}{${hexWithoutHash(design.colors.blockBody)}}
\definecolor{bfAlert}{HTML}{${hexWithoutHash(design.colors.alert)}}

\setbeamercolor{normal text}{fg=bfText,bg=bfBackground}
\setbeamercolor{frametitle}{fg=bfPrimary,bg=bfBackground}
\setbeamercolor{title}{fg=bfPrimary,bg=bfBackground}
\setbeamercolor{subtitle}{fg=bfText,bg=bfBackground}
\setbeamercolor{author}{fg=bfText,bg=bfBackground}
\setbeamercolor{institute}{fg=bfText,bg=bfBackground}
\setbeamercolor{date}{fg=bfText,bg=bfBackground}
\setbeamercolor{structure}{fg=bfPrimary}
\setbeamercolor{alerted text}{fg=bfAlert}
\setbeamercolor{block title}{fg=white,bg=bfPrimary}
\setbeamercolor{block body}{fg=bfText,bg=bfBlockBody}

\setbeamerfont{title}{${titleFont.familyOption}series=\bfseries,size=\huge}
\setbeamerfont{subtitle}{size=\normalsize}
\setbeamerfont{frametitle}{${titleFont.familyOption}series=\bfseries,size=\Large}
\setbeamerfont{block title}{series=\bfseries}

\setbeamertemplate{itemize item}{${bullet.latexItem}}
\setbeamertemplate{itemize subitem}{${bullet.latexSubitem}}

${frametitleTemplate}
${logoTemplate}
${titlePageTemplate}
`;
}

function generateOverviewTex(design) {
  const title = escapeLatex(design.content.sampleTitle);
  const bullets = design.content.bullets
    .map((b) => `  \\item ${escapeLatex(b)}`)
    .join("\n");

  return `${String.raw`\begin{frame}{`}${title}${String.raw`}
\begin{itemize}
`}${bullets}${String.raw`
\end{itemize}

\begin{block}{`}${escapeLatex(design.content.blockTitle)}${String.raw`}
`}${escapeLatex(design.content.blockBody)}${String.raw`
\end{block}
\end{frame}
`}`;
}

function generateFiguresTex() {
  return String.raw`\begin{frame}{Visual evidence belongs on a dedicated slide}
\begin{figure}
  \centering
  \fbox{\rule{0pt}{0.42\textheight}\rule{0.78\textwidth}{0pt}}
  \caption{Replace this placeholder with a focused figure.}
\end{figure}
\end{frame}
`;
}

function generateTablesTex() {
  return String.raw`\begin{frame}{Tables should report only essential quantities}
\begin{table}
  \centering
  \begin{tabular}{lcc}
  \toprule
  Outcome & Estimate & Baseline \\
  \midrule
  Main outcome & 0.12 & 0.48 \\
               & (0.04) & \\
  \bottomrule
  \end{tabular}
\end{table}
\end{frame}
`;
}

function generateReadme(design) {
  return `# ${escapeLatex(design.identity.title)}

Generated by BeamerForge.

Compile with:

\`\`\`powershell
latexmk -xelatex -interaction=nonstopmode main.tex
\`\`\`
`;
}

function generateResolvedFiles(design) {
  return {
    "main.tex": generateMainTex(design),
    "theme.cls": generateClassTex(design),
    "README.md": generateReadme(design),
    "content/overview.tex": generateOverviewTex(design),
    "content/figures.tex": generateFiguresTex(design),
    "content/tables.tex": generateTablesTex(design)
  };
}

function generateFiles(theme, registry = getRegistry(), options = {}) {
  const bundleResolver = options.resolveDesignBundle || resolveDesignBundle;
  const bundle = bundleResolver(theme, registry);
  return {
    ...generateResolvedFiles(bundle.design),
    "theme.json": `${JSON.stringify(bundle.theme, null, 2)}\n`,
  };
}

module.exports = {
  escapeLatex,
  aspectRatioOption,
  generateMainTex,
  generateClassTex,
  generateResolvedFiles,
  generateFiles
};
