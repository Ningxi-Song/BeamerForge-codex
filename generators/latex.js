const { validateTheme } = require("../schema/theme-schema");
const { getRegistry, resolveThemeChoices } = require("../registry/options");

function escapeLatex(value) {
  return String(value).replace(/[\\&%$#_{}~^]/g, (character) => {
    const replacements = {
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
    return replacements[character];
  });
}

function aspectRatioOption(aspectRatio) {
  const options = {
    "16:9": "aspectratio=169",
    "4:3": "aspectratio=43"
  };
  return options[aspectRatio] || "";
}

function hexWithoutHash(value) {
  return String(value).replace(/^#/, "").toUpperCase();
}

function latexDate(value) {
  return value === "\\today" ? value : escapeLatex(value);
}

function validationMessage(errors) {
  return errors.map((error) => `${error.path}: ${error.message}`).join("; ");
}

function normalizeLatexSnippet(value) {
  return String(value || "").replace(/\\n/g, "\n");
}

function generateMainTex(theme) {
  const identity = theme.identity;

  return `${String.raw`\documentclass[10pt]{theme}

\title{`}${escapeLatex(identity.title || "")}${String.raw`}
\subtitle{`}${escapeLatex(identity.subtitle || "")}${String.raw`}
\author{`}${escapeLatex(identity.author || "")}${String.raw`}
\institute{`}${escapeLatex(identity.institute || "")}${String.raw`}
\date{`}${latexDate(identity.date || "")}${String.raw`}

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
  const aspectRatio = aspectRatioOption(theme.foundation.aspectRatio);
  const classOptions = ["10pt", aspectRatio].filter(Boolean).join(",");
  const bulletPackage = choices.bullet.packageLine ? `${normalizeLatexSnippet(choices.bullet.packageLine)}\n` : "";
  const outerTheme = choices.navigation.latexOuterTheme ? `${normalizeLatexSnippet(choices.navigation.latexOuterTheme)}\n` : "";
  const footline = choices.navigation.latexFootline ? `${normalizeLatexSnippet(choices.navigation.latexFootline)}\n` : "";
  const fontPreamble = normalizeLatexSnippet(choices.bodyFont.latexPreamble);
  const blockTemplate = normalizeLatexSnippet(choices.block.latexTemplate);

  return String.raw`\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{theme}[2026/06/27 BeamerForge generated theme]
\LoadClass[${classOptions}]{beamer}

\RequirePackage{xcolor}
\RequirePackage{booktabs}
${bulletPackage}${fontPreamble}
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

\setbeamerfont{title}{series=\bfseries,size=\huge}
\setbeamerfont{subtitle}{size=\normalsize}
\setbeamerfont{frametitle}{series=\bfseries,size=\Large}
\setbeamerfont{block title}{series=\bfseries}

\setbeamertemplate{itemize item}{${choices.bullet.itemTemplate}}
\setbeamertemplate{itemize subitem}{${choices.bullet.subitemTemplate}}

\setbeamertemplate{title page}{%
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
}
`;
}

function generateOverviewTex(theme) {
  const title = escapeLatex(theme.contentDefaults.sampleTitle);
  const bullets = theme.contentDefaults.sampleBullets
    .map((bullet) => `  \\item ${escapeLatex(bullet)}`)
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
  if (!validation.ok) {
    throw new Error(`Invalid theme: ${validationMessage(validation.errors)}`);
  }

  const validTheme = validation.value;
  return {
    "main.tex": generateMainTex(validTheme, registry),
    "theme.cls": generateClassTex(validTheme, registry),
    "theme.json": `${JSON.stringify(validTheme, null, 2)}\n`,
    "README.md": generateReadme(validTheme),
    "content/overview.tex": generateOverviewTex(validTheme),
    "content/figures.tex": generateFiguresTex(validTheme),
    "content/tables.tex": generateTablesTex(validTheme)
  };
}

module.exports = {
  escapeLatex,
  aspectRatioOption,
  generateMainTex,
  generateClassTex,
  generateFiles
};
