"use strict";

const { validateTheme } = require("../schema/theme-schema");
const { getRegistry, resolveThemeChoices } = require("../registry/options");
const { hexWithoutHash, normalizeLatexNewlines, joinNonEmpty } = require("../lib/utils");

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

function formatErrors(errors) {
  return errors.map((e) => `${e.path}: ${e.message}`).join("; ");
}

const TITLE_FONT_PACKAGES = Object.freeze({
  palatino: { line: "\\usepackage{palatino}", family: "ppl" },
  "latin-modern": { line: "\\usepackage{lmodern}", family: "lmr" },
  helvetica: { line: "\\usepackage{helvet}", family: "phv" },
  times: { line: "\\usepackage{mathptmx}", family: "ptm" }
});

function titleFontSetup(bodyFont, titleFont) {
  const empty = { setup: "", definition: "", familyOption: "" };
  if (!bodyFont || !titleFont || bodyFont.id === titleFont.id) return empty;

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

  const pkg = TITLE_FONT_PACKAGES[titleFont.id];
  if (pkg) {
    return {
      setup: pkg.line,
      definition: `\\newcommand{\\bfTitleFont}{\\fontfamily{${pkg.family}}\\selectfont}`,
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

function generateMainTex(theme) {
  const id = theme.identity;
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

function generateClassTex(theme, registry = getRegistry()) {
  const choices = resolveThemeChoices(theme, registry);
  const aspect = aspectRatioOption(theme.foundation.aspectRatio);
  const classOptions = ["10pt", aspect].filter(Boolean).join(",");
  const bulletPkg = choices.bullet.packageLine ? `${normalizeLatexNewlines(choices.bullet.packageLine)}\n` : "";
  const outerTheme = choices.navigation.latexOuterTheme ? `${normalizeLatexNewlines(choices.navigation.latexOuterTheme)}\n` : "";
  const footline = choices.navigation.latexFootline ? `${normalizeLatexNewlines(choices.navigation.latexFootline)}\n` : "";
  const titleFont = titleFontSetup(choices.bodyFont, choices.titleFont);
  const fontPreamble = joinNonEmpty([
    titleFont.setup,
    normalizeLatexNewlines(choices.bodyFont.latexPreamble),
    titleFont.definition
  ]);
  const blockTemplate = normalizeLatexNewlines(choices.block.latexTemplate);
  const titlePageId = theme.titlePage.layout || "left-curtain";
  const titlePageTemplate = TITLE_PAGE_TEMPLATES[titlePageId] || TITLE_PAGE_TEMPLATES["left-curtain"];
  const frametitleTemplate = choices.navigation.hasHeader ? String.raw`
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
\definecolor{bfBackground}{HTML}{${hexWithoutHash(theme.colors.background)}}
\definecolor{bfPrimary}{HTML}{${hexWithoutHash(theme.colors.primary)}}
\definecolor{bfAccent}{HTML}{${hexWithoutHash(theme.colors.accent)}}
\definecolor{bfText}{HTML}{${hexWithoutHash(theme.colors.text)}}
\definecolor{bfBlockBody}{HTML}{${hexWithoutHash(theme.colors.blockBody || "#F1F5F9")}}
\definecolor{bfAlert}{HTML}{${hexWithoutHash(theme.colors.alert || theme.colors.accent)}}

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

\setbeamertemplate{itemize item}{${choices.bullet.itemTemplate}}
\setbeamertemplate{itemize subitem}{${choices.bullet.subitemTemplate}}

${frametitleTemplate}
${titlePageTemplate}
`;
}

function generateOverviewTex(theme) {
  const title = escapeLatex(theme.contentDefaults.sampleTitle);
  const bullets = theme.contentDefaults.sampleBullets
    .map((b) => `  \\item ${escapeLatex(b)}`)
    .join("\n");

  return `${String.raw`\begin{frame}{`}${title}${String.raw`}
\begin{itemize}
`}${bullets}${String.raw`
\end{itemize}

\begin{block}{Design note}
The HTML preview and compiled PDF use the same theme tokens.
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

function generateReadme(theme) {
  return `# ${escapeLatex(theme.identity.title)}

Generated by BeamerForge.

Compile with:

\`\`\`powershell
latexmk -xelatex -interaction=nonstopmode main.tex
\`\`\`
`;
}

function generateFiles(theme, registry = getRegistry()) {
  const validation = validateTheme(theme, { registry });
  if (!validation.ok) throw new Error(`Invalid theme: ${formatErrors(validation.errors)}`);
  const t = validation.value;
  return {
    "main.tex": generateMainTex(t, registry),
    "theme.cls": generateClassTex(t, registry),
    "theme.json": `${JSON.stringify(t, null, 2)}\n`,
    "README.md": generateReadme(t),
    "content/overview.tex": generateOverviewTex(t),
    "content/figures.tex": generateFiguresTex(t),
    "content/tables.tex": generateTablesTex(t)
  };
}

module.exports = {
  escapeLatex,
  aspectRatioOption,
  generateMainTex,
  generateClassTex,
  generateFiles
};
