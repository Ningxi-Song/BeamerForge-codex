%%%%%%%%%%%% define the basic settings
\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{bamboo}[2026/06/24 reusable academic Beamer recipe]
\LoadClass[compress,10pt]{beamer}

%%%%%%%%%%%% define the fonts
\usepackage[english]{babel}
\usepackage[utf8]{inputenc}
\usepackage{palatino}
\usepackage[T1]{fontenc}
\usepackage{pdfpages}
\usepackage{graphicx}
\usepackage[footnotesize,hang]{caption}
\usepackage{hyperref}
\usepackage{amsfonts,amsmath,amssymb}
\usepackage[none]{hyphenat}
\usepackage{booktabs}
\usepackage{threeparttable}
\usepackage{url}
\usepackage{nicefrac}
\usepackage{microtype}
\usepackage{etoolbox}

%%%%%%%%%%%% use tikz
\usepackage{tikz}
\usetikzlibrary{arrows.meta,positioning,calc}
\usefonttheme{serif}
\tikzset{
  every node/.style={
    font=\usebeamerfont{normal text}\selectfont,
    text=normal text.fg
  }
}

%%%%%%%%%%%% tables
\usepackage{tcolorbox}
\usepackage{tabularx}
\usepackage{array}
\usepackage{colortbl}

%%%%%%%%%%%% colors: original template palette
\definecolor{myblue}{RGB}{12,91,122}
\definecolor{titleColor}{RGB}{255,255,255}
\definecolor{titleTextColor}{RGB}{1,49,78}
\definecolor{bodyColor}{RGB}{255,255,255}
\definecolor{normalTextColor}{RGB}{0,0,0}
\definecolor{alertTextColor}{RGB}{87,195,194}

\definecolor{normalBlockColor}{RGB}{178,213,219}
\definecolor{normalTitleBlockColor}{RGB}{12,91,122}
\definecolor{normalBlockTextColor}{RGB}{0,0,0}
\definecolor{normalBlockTitleTextColor}{RGB}{255,255,255}

\definecolor{exampleBlockColor}{RGB}{192,223,248}
\definecolor{exampleTitleBlockColor}{RGB}{71,137,190}
\definecolor{exampleBlockTextColor}{RGB}{0,0,0}
\definecolor{exampleBlockTitleTextColor}{RGB}{255,255,255}

\definecolor{alertBlockColor}{RGB}{249,189,187}
\definecolor{alertTitleBlockColor}{RGB}{204,45,24}
\definecolor{alertBlockTextColor}{RGB}{0,0,0}
\definecolor{alertBlockTitleTextColor}{RGB}{255,255,255}

%%%%%%%%%%%% base colors
\setbeamercolor*{structure}{fg=myblue}
\setbeamercolor{titlelike}{fg=myblue,bg=titleColor}
\setbeamercolor*{normal text}{fg=normalTextColor,bg=bodyColor}
\setbeamercolor*{example text}{fg=myblue}
\setbeamercolor*{alerted text}{fg=alertTextColor}
\setbeamercolor{itemize item}{fg=myblue}
\setbeamercolor{enumerate item}{fg=myblue!70}
\setbeamercolor{description item}{fg=titleTextColor!70}
\setbeamercolor{section in head/foot}{bg=white, fg=myblue}
\setbeamercolor{subsection in head/foot}{bg=white, fg=myblue}

%%%%%%%%%%%% itemize
\usepackage{pifont}
\setbeamertemplate{itemize item}{\ding{109}}
\setbeamertemplate{itemize subitem}{\ding{119}}
\setbeamertemplate{enumerate item}{%
  \makebox[0.5em][l]{\textbf{\arabic{enumi})}}
}
\setbeamertemplate{enumerate subitem}{%
  \makebox[1em][r]{\raisebox{0.2ex}{\textbf{\alph{enumii})}}}
}

%%%%%%%%%%%% upper line and navigation
\useoutertheme[subsection=false]{miniframes}
\setbeamertemplate{navigation symbols}{}
\setbeamertemplate{frametitle continuation}{}
\makeatletter
  \beamer@compressfalse
\makeatother

%%%%%%%%%%%% blocks
\setbeamertemplate{blocks}[rounded][shadow=False]
\setbeamercolor*{block title}{fg=normalBlockTitleTextColor,bg=normalTitleBlockColor}
\setbeamercolor*{block body}{fg=normalBlockTextColor,bg=normalBlockColor}
\setbeamercolor*{block title alerted}{fg=alertBlockTitleTextColor,bg=alertTitleBlockColor}
\setbeamercolor*{block body alerted}{fg=alertBlockTextColor,bg=alertBlockColor}
\setbeamercolor*{block title example}{fg=exampleBlockTitleTextColor,bg=exampleTitleBlockColor}
\setbeamercolor*{block body example}{fg=exampleBlockTextColor,bg=exampleBlockColor}
\AtBeginEnvironment{exampleblock}{%
  \setbeamercolor{itemize item}{fg=exampleTitleBlockColor!70}
}
\AtBeginEnvironment{alertblock}{%
  \setbeamercolor{itemize item}{fg=alertTitleBlockColor!70}
}
\AtBeginEnvironment{block}{%
  \setbeamercolor{itemize item}{fg=normalTitleBlockColor!70}
}

%%%%%%%%%%%% title page
\makeatletter
\newif\ifbamboo@titleimage
\bamboo@titleimagefalse
\newcommand{\titleimage}[1]{\gdef\bamboo@titleimagepath{#1}\bamboo@titleimagetrue}
\gdef\bamboo@titleimagepath{}

\setbeamerfont{title like}{shape=\scshape}
\setbeamerfont{frametitle}{shape=\scshape}
\setbeamerfont{title}{size=\fontsize{18pt}{32pt}\selectfont}
\setbeamerfont{subtitle}{size=\fontsize{10pt}{16pt}\selectfont}
\setbeamerfont{author}{size=\fontsize{10pt}{22pt}\selectfont}
\setbeamerfont{institute}{size=\fontsize{10pt}{22pt}\selectfont}
\setbeamerfont{date}{size=\fontsize{9pt}{18pt}\selectfont}

\setbeamertemplate{title page}{%
  \begin{tikzpicture}[remember picture,overlay]
    \fill[bodyColor] (current page.south west) rectangle (current page.north east);
    \ifbamboo@titleimage
      \node[anchor=east,inner sep=0pt,opacity=0.9] at (current page.east) {\includegraphics[height=\paperheight]{\bamboo@titleimagepath}};
      \fill[white,opacity=0.86] (current page.south west) rectangle ([xshift=-0.34\paperwidth]current page.north east);
      \draw[myblue!45,line width=0.45pt] ([xshift=0.09\paperwidth,yshift=-0.15\paperheight]current page.north west) -- ([xshift=0.09\paperwidth,yshift=0.18\paperheight]current page.south west);
    \fi
  \end{tikzpicture}%
  \vspace*{0.2\paperheight}
  \begin{minipage}{0.58\paperwidth}
    {\usebeamerfont{title}\usebeamercolor[fg]{title}\inserttitle\par}
    \vspace{0.35cm}
    {\usebeamerfont{subtitle}\usebeamercolor[fg]{subtitle}\insertsubtitle\par}
    \vspace{0.55cm}
    {\usebeamerfont{author}\insertauthor\par}
    {\usebeamerfont{institute}\insertinstitute\par}
    \vspace{0.18cm}
    {\usebeamerfont{date}\insertdate\par}
  \end{minipage}
}
\makeatother

%%%%%%%%%%%% footnote frame number
\setbeamertemplate{footline}{%
  \leavevmode%
  \hbox{%
    \begin{beamercolorbox}[
      wd=\paperwidth,
      ht=2ex,
      dp=1ex,
      rightskip=1em
    ]{author in head/foot}%
      \hfill
      {\itshape\scriptsize \insertframenumber\,/\,\inserttotalframenumber}
    \end{beamercolorbox}%
  }%
}

%%%%%%%%%%%% figures
\usepackage{subfigure}

%%%%%%%%%%%% biblatex
\usepackage[backend=biber, style=apa]{biblatex}
\bibliography{references}
\setbeamertemplate{bibliography item}{}
\setlength{\bibitemsep}{0.3em}
\setlength{\bibhang}{1.2em}
\renewcommand*{\bibfont}{\footnotesize}
% Bamboo typography, list markers, and centered title-page styling.
\definecolor{stoneGray}{HTML}{708487}
\setbeamercolor{section in head/foot}{bg=bodyColor,fg=stoneGray}
\setbeamercolor{subsection in head/foot}{bg=bodyColor,fg=stoneGray}
\setbeamercolor{section in head/foot shaded}{fg=stoneGray!65!bodyColor}
\setbeamercolor{author in head/foot}{fg=stoneGray,bg=bodyColor}
\setbeamercolor{caption name}{fg=myblue}
\setbeamercolor{itemize subitem}{fg=stoneGray}
\setbeamercolor{enumerate item}{fg=myblue}
\setbeamerfont{frametitle}{shape=\upshape}
\setbeamerfont{title like}{shape=\upshape}
\newcommand{\inkleaf}{%
  \tikz[baseline=-0.48ex,x=1em,y=1em]{%
    \fill[bulletColor] (0,0.39) .. controls (0.35,0.43) and (0.65,0.16) .. (0.87,-0.05)
      .. controls (0.53,-0.11) and (0.15,0.03) .. (0,0.39) -- cycle;
  }%
}
\setbeamertemplate{itemize item}{\inkleaf}
\setbeamertemplate{itemize subitem}{\textendash}
\setbeamertemplate{enumerate item}{\arabic{enumi}.}
\setbeamertemplate{enumerate subitem}{\alph{enumii}.}
\newcommand{\inkblockbegin}[1]{%
 \par\vskip0.7ex
 \begin{tcolorbox}[colback=normalBlockColor,colframe=#1,boxrule=0pt,
   leftrule=0.65pt,arc=0pt,outer arc=0pt,left=8pt,right=8pt,top=5pt,bottom=5pt]
 {\color{#1}\insertblocktitle\par}\vspace{2pt}
 \raggedright\usebeamerfont{normal text}\color{normalTextColor}
}
\setbeamertemplate{block begin}{\inkblockbegin{myblue}}
\setbeamertemplate{block end}{\end{tcolorbox}}
\setbeamertemplate{block example begin}{\inkblockbegin{myblue}}
\setbeamertemplate{block example end}{\end{tcolorbox}}
\setbeamertemplate{block alerted begin}{\inkblockbegin{alertTextColor}}
\setbeamertemplate{block alerted end}{\end{tcolorbox}}


% Abstract typographic cover; no literal botanical illustration.
\setbeamerfont{title}{size=\fontsize{23pt}{29pt}\selectfont,shape=\upshape}
\setbeamertemplate{title page}{%
 \begin{tikzpicture}[remember picture,overlay]
  \fill[bodyColor] (current page.south west) rectangle (current page.north east);
  \draw[myblue!55,line width=0.55pt]
    ([xshift=0.12\paperwidth,yshift=-0.115\paperheight]current page.north west) --
    ([xshift=-0.12\paperwidth,yshift=-0.115\paperheight]current page.north east);
  \draw[myblue!20,line width=0.35pt]
    ([xshift=0.12\paperwidth,yshift=0.115\paperheight]current page.south west) --
    ([xshift=-0.12\paperwidth,yshift=0.115\paperheight]current page.south east);
  \node[anchor=center,inner sep=0pt,text width=0.78\paperwidth,align=center] at (current page.center) {%
    {\usebeamerfont{title}\color{myblue}\inserttitle\par}
    \vspace{0.3cm}
    {\usebeamerfont{subtitle}\color{myblue}\insertsubtitle\par}
    \vspace{0.4cm}
    {\color{myblue!55}\rule{0.085\paperwidth}{1.0pt}\par}
    \vspace{0.45cm}
    {\usebeamerfont{author}\color{normalTextColor}\insertauthor\par}
    \vspace{0.08cm}
    {\usebeamerfont{institute}\color{normalTextColor}\insertinstitute\par}
    \vspace{0.35cm}
    {\usebeamerfont{date}\color{normalTextColor}\insertdate\par}
  };
 \end{tikzpicture}%
}
% Navigation uses the primary theme color.
\setbeamercolor{section in head/foot}{bg=white,fg=myblue}
\setbeamercolor{subsection in head/foot}{bg=white,fg=myblue}

% Two-tone hierarchy from the original reference block.
\setbeamercolor{itemize item}{fg=normalBlockColor}
\setbeamercolor{itemize subitem}{fg=normalBlockColor}
\setbeamercolor{enumerate item}{fg=normalBlockColor}
\setbeamercolor{enumerate subitem}{fg=normalBlockColor}
\setbeamercolor{block title}{fg=white,bg=normalTitleBlockColor}
\setbeamercolor{block body}{fg=black,bg=normalBlockColor}
\setbeamercolor{block title example}{fg=white,bg=normalTitleBlockColor}
\setbeamercolor{block body example}{fg=black,bg=normalBlockColor}
\setbeamercolor{block title alerted}{fg=white,bg=normalTitleBlockColor}
\setbeamercolor{block body alerted}{fg=black,bg=normalBlockColor}
\setbeamertemplate{blocks}[rounded][shadow=false]
\definecolor{exampleBlockColor}{RGB}{178,213,219}
\definecolor{exampleTitleBlockColor}{RGB}{12,91,122}
\setbeamercolor{alerted text}{fg=normalTitleBlockColor}

% Stronger, fuller willow-leaf and numbered list markers.
\definecolor{bulletColor}{HTML}{397C90}
\setbeamercolor{itemize item}{fg=bulletColor}
\setbeamercolor{itemize subitem}{fg=bulletColor}
\setbeamercolor{enumerate item}{fg=bulletColor}
\setbeamercolor{enumerate subitem}{fg=bulletColor}
