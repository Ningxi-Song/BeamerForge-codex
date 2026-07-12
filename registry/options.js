"use strict";

const path = require("node:path");
const duckVector = require("../elements/decorations/logos/duck-vector");
const { clone } = require("../lib/utils");

function defineRegistryCollection(options, supportById) {
  return Object.freeze(Object.fromEntries(
    Object.entries(options).map(([id, option]) => {
      const renderers = supportById?.[id];
      if (typeof renderers?.html !== "boolean" || typeof renderers?.latex !== "boolean") {
        throw new Error(`Registry option ${id} must explicitly declare renderer support`);
      }
      return [id, { ...option, renderers: { ...renderers } }];
    })
  ));
}

const PAGE_NUMBER_FOOTLINE =
  "\\setbeamertemplate{footline}{%\\n  \\hfill\\insertframenumber/\\inserttotalframenumber\\hspace{1.2em}\\vspace{0.8em}\\n}";

const PALETTES = defineRegistryCollection({
  "academic-blue": {
    id: "academic-blue",
    label: "Academic Blue",
    description: "Blue-white academic palette based on the Bamboo recipe.",
    colors: {
      background: "#FFFFFF",
      primary: "#456990",
      accent: "#57C3C2",
      text: "#000000",
      blockBody: "#D9EBEF",
      alert: "#CC2D18"
    }
  },
  "rose-red": {
    id: "rose-red",
    label: "Rose Red",
    description: "White academic surface with a Derrick Rose-inspired red structure.",
    colors: {
      background: "#FFFFFF",
      primary: "#BA5444",
      accent: "#01314E",
      text: "#000000",
      blockBody: "#F9BDBB",
      alert: "#CC2D18"
    }
  },
  "midnight-blue": {
    id: "midnight-blue",
    label: "Midnight Blue",
    description: "Dark technology palette with blue structure and gold accent.",
    colors: {
      background: "#0D1B2A",
      primary: "#4A90D9",
      accent: "#D4A843",
      text: "#F7FBFF",
      blockBody: "#1B2A4A",
      alert: "#D4A843"
    }
  },
  "forest-minimal": {
    id: "forest-minimal",
    label: "Forest Minimal",
    description: "Quiet green palette for policy, environment, and calm analytical talks.",
    colors: {
      background: "#F7FAF4",
      primary: "#2F6F4E",
      accent: "#86A873",
      text: "#1B241D",
      blockBody: "#E4EEDD",
      alert: "#B45309"
    }
  },
  "slate-teal": {
    id: "slate-teal",
    label: "Slate Teal",
    description: "Neutral operational palette with teal emphasis.",
    colors: {
      background: "#F8FAFC",
      primary: "#334155",
      accent: "#0F766E",
      text: "#111827",
      blockBody: "#E2E8F0",
      alert: "#B91C1C"
    }
  },
  "warm-neutral": {
    id: "warm-neutral",
    label: "Warm Neutral",
    description: "Warm paper-like background with restrained brown and green accents.",
    colors: {
      background: "#FFFDF7",
      primary: "#7C5E2A",
      accent: "#3F7C6B",
      text: "#1F2937",
      blockBody: "#F0E6D2",
      alert: "#B45309"
    }
  },
  custom: {
    id: "custom",
    label: "Custom",
    description: "Workbench-authored colors generated from the embedded color picker.",
    colors: {
      background: "#FFFFFF",
      primary: "#456990",
      accent: "#57C3C2",
      text: "#000000",
      blockBody: "#D9EBEF",
      alert: "#CC2D18"
    }
  }
}, {
  "academic-blue": { html: true, latex: true },
  "rose-red": { html: true, latex: true },
  "midnight-blue": { html: true, latex: true },
  "forest-minimal": { html: true, latex: true },
  "slate-teal": { html: true, latex: true },
  "warm-neutral": { html: true, latex: true },
  custom: { html: true, latex: true }
});

function localFont(id, label, fileName, mode, fallback) {
  return {
    id,
    label,
    mode,
    cssFamily: `'${label}', ${fallback}`,
    latexPreamble: `\\usepackage{fontspec}\\n\\setmainfont[Path=font/]{${fileName}}\\n\\setsansfont[Path=font/]{${fileName}}\\n\\usefonttheme{professionalfonts}`,
    assets: [`elements/fonts/local/${fileName}`]
  };
}

const PACKAGE_TITLE_FONTS = Object.freeze({
  palatino: { latexTitlePackage: "\\usepackage{palatino}", latexTitleFamily: "ppl" },
  "latin-modern": { latexTitlePackage: "\\usepackage{lmodern}", latexTitleFamily: "lmr" },
  helvetica: { latexTitlePackage: "\\usepackage{helvet}", latexTitleFamily: "phv" },
  times: { latexTitlePackage: "\\usepackage{mathptmx}", latexTitleFamily: "ptm" }
});

function withTitleFontSemantics(fonts) {
  return Object.fromEntries(Object.entries(fonts).map(([id, font]) => [
    id,
    {
      latexTitlePackage: "",
      latexTitleFamily: "",
      ...font,
      ...PACKAGE_TITLE_FONTS[id]
    }
  ]));
}

const FONTS = defineRegistryCollection(withTitleFontSemantics({
  palatino: {
    id: "palatino",
    label: "Palatino",
    mode: "serif-academic",
    cssFamily: "Palatino, 'Palatino Linotype', 'Book Antiqua', serif",
    latexPreamble: "\\usepackage{palatino}\\n\\usefonttheme{serif}",
    assets: []
  },
  neuton: {
    id: "neuton",
    label: "Neuton",
    mode: "serif-editorial",
    cssFamily: "Neuton, Georgia, serif",
    latexPreamble: "\\usepackage{fontspec}\\n\\setmainfont[Path=font/,BoldFont=Neuton-Bold.ttf,ItalicFont=Neuton-Italic.ttf]{Neuton-Regular.ttf}\\n\\usefonttheme{serif}",
    assets: [
      "elements/fonts/serif-neuton/fonts/Neuton-Regular.ttf",
      "elements/fonts/serif-neuton/fonts/Neuton-Bold.ttf",
      "elements/fonts/serif-neuton/fonts/Neuton-Italic.ttf"
    ]
  },
  "latin-modern": {
    id: "latin-modern",
    label: "Latin Modern",
    mode: "serif-classic",
    cssFamily: "'Latin Modern Roman', 'Computer Modern', Georgia, serif",
    latexPreamble: "\\usepackage{lmodern}\\n\\usefonttheme{serif}",
    assets: []
  },
  helvetica: {
    id: "helvetica",
    label: "Helvetica",
    mode: "sans-clean",
    cssFamily: "Helvetica, Arial, sans-serif",
    latexPreamble: "\\usepackage{helvet}\\n\\renewcommand{\\familydefault}{\\sfdefault}\\n\\usefonttheme{professionalfonts}",
    assets: []
  },
  times: {
    id: "times",
    label: "Times",
    mode: "serif-formal",
    cssFamily: "'Times New Roman', Times, serif",
    latexPreamble: "\\usepackage{mathptmx}\\n\\usefonttheme{serif}",
    assets: []
  },
  lato: localFont("lato", "Lato", "Lato.ttf", "sans-humanist", "Arial, sans-serif"),
  "fira-sans": localFont("fira-sans", "Fira Sans", "Fira_Sans.ttf", "sans-modern", "Arial, sans-serif"),
  "source-sans-3": localFont("source-sans-3", "Source Sans 3", "Source_Sans_3.ttf", "sans-clean", "Arial, sans-serif"),
  inter: localFont("inter", "Inter", "Inter.ttf", "sans-neutral", "Arial, sans-serif"),
  roboto: localFont("roboto", "Roboto", "Roboto.ttf", "sans-neutral", "Arial, sans-serif"),
  montserrat: localFont("montserrat", "Montserrat", "Montserrat.ttf", "sans-geometric", "Arial, sans-serif"),
  poppins: localFont("poppins", "Poppins", "Poppins.ttf", "sans-geometric", "Arial, sans-serif"),
  "ibm-plex-sans": localFont("ibm-plex-sans", "IBM Plex Sans", "IBM_Plex_Sans.ttf", "sans-technical", "Arial, sans-serif"),
  "public-sans": localFont("public-sans", "Public Sans", "Public_Sans.ttf", "sans-formal", "Arial, sans-serif"),
  "open-sans": localFont("open-sans", "Open Sans", "Open_Sans.ttf", "sans-readable", "Arial, sans-serif"),
  "crimson-text": localFont("crimson-text", "Crimson Text", "Crimson_Text.ttf", "serif-literary", "Georgia, serif"),
  cardo: localFont("cardo", "Cardo", "Cardo.ttf", "serif-classical", "Georgia, serif"),
  "pt-serif": localFont("pt-serif", "PT Serif", "PT_Serif.ttf", "serif-academic", "Georgia, serif"),
  merriweather: localFont("merriweather", "Merriweather", "Merriweather.ttf", "serif-readable", "Georgia, serif"),
  "source-serif-4": localFont("source-serif-4", "Source Serif 4", "Source_Serif_4.ttf", "serif-editorial", "Georgia, serif"),
  "ibm-plex-serif": localFont("ibm-plex-serif", "IBM Plex Serif", "IBM_Plex_Serif.ttf", "serif-technical", "Georgia, serif"),
  arvo: localFont("arvo", "Arvo", "Arvo.ttf", "serif-slab", "Georgia, serif"),
  lora: localFont("lora", "Lora", "Lora.ttf", "serif-humanist", "Georgia, serif"),
  "eb-garamond": localFont("eb-garamond", "EB Garamond", "EB_Garamond.ttf", "serif-classical", "Georgia, serif"),
  literata: localFont("literata", "Literata", "Literata.ttf", "serif-bookish", "Georgia, serif"),
  "fira-code": localFont("fira-code", "Fira Code", "Fira_Code.ttf", "mono-code", "Consolas, monospace"),
  "jetbrains-mono": localFont("jetbrains-mono", "JetBrains Mono", "JetBrains_Mono.ttf", "mono-code", "Consolas, monospace"),
  "ibm-plex-mono": localFont("ibm-plex-mono", "IBM Plex Mono", "IBM_Plex_Mono.ttf", "mono-technical", "Consolas, monospace"),
  inconsolata: localFont("inconsolata", "Inconsolata", "Inconsolata.ttf", "mono-code", "Consolas, monospace"),
  "space-mono": localFont("space-mono", "Space Mono", "Space_Mono.ttf", "mono-geometric", "Consolas, monospace"),
  "source-code-pro": localFont("source-code-pro", "Source Code Pro", "Source_Code_Pro.ttf", "mono-code", "Consolas, monospace"),
  "bebas-neue": localFont("bebas-neue", "Bebas Neue", "Bebas_Neue.ttf", "display-condensed", "Impact, sans-serif"),
  oswald: localFont("oswald", "Oswald", "Oswald.ttf", "display-condensed", "Arial Narrow, sans-serif"),
  rajdhani: localFont("rajdhani", "Rajdhani", "Rajdhani.ttf", "display-tech", "Arial, sans-serif"),
  orbitron: localFont("orbitron", "Orbitron", "Orbitron.ttf", "display-tech", "Arial, sans-serif"),
  "playfair-display": localFont("playfair-display", "Playfair Display", "Playfair_Display.ttf", "display-editorial", "Georgia, serif"),
  "dm-serif-display": localFont("dm-serif-display", "DM Serif Display", "DM_Serif_Display.ttf", "display-serif", "Georgia, serif"),
  "abril-fatface": localFont("abril-fatface", "Abril Fatface", "Abril_Fatface.ttf", "display-serif", "Georgia, serif"),
  "zilla-slab": localFont("zilla-slab", "Zilla Slab", "Zilla_Slab.ttf", "serif-slab", "Georgia, serif"),
  "space-grotesk": localFont("space-grotesk", "Space Grotesk", "Space_Grotesk.ttf", "sans-modern", "Arial, sans-serif"),
  manrope: localFont("manrope", "Manrope", "Manrope.ttf", "sans-modern", "Arial, sans-serif")
}), {
  palatino: { html: true, latex: true },
  neuton: { html: true, latex: true },
  "latin-modern": { html: true, latex: true },
  helvetica: { html: true, latex: true },
  times: { html: true, latex: true },
  lato: { html: true, latex: true },
  "fira-sans": { html: true, latex: true },
  "source-sans-3": { html: true, latex: true },
  inter: { html: true, latex: true },
  roboto: { html: true, latex: true },
  montserrat: { html: true, latex: true },
  poppins: { html: true, latex: true },
  "ibm-plex-sans": { html: true, latex: true },
  "public-sans": { html: true, latex: true },
  "open-sans": { html: true, latex: true },
  "crimson-text": { html: true, latex: true },
  cardo: { html: true, latex: true },
  "pt-serif": { html: true, latex: true },
  merriweather: { html: true, latex: true },
  "source-serif-4": { html: true, latex: true },
  "ibm-plex-serif": { html: true, latex: true },
  arvo: { html: true, latex: true },
  lora: { html: true, latex: true },
  "eb-garamond": { html: true, latex: true },
  literata: { html: true, latex: true },
  "fira-code": { html: true, latex: true },
  "jetbrains-mono": { html: true, latex: true },
  "ibm-plex-mono": { html: true, latex: true },
  inconsolata: { html: true, latex: true },
  "space-mono": { html: true, latex: true },
  "source-code-pro": { html: true, latex: true },
  "bebas-neue": { html: true, latex: true },
  oswald: { html: true, latex: true },
  rajdhani: { html: true, latex: true },
  orbitron: { html: true, latex: true },
  "playfair-display": { html: true, latex: true },
  "dm-serif-display": { html: true, latex: true },
  "abril-fatface": { html: true, latex: true },
  "zilla-slab": { html: true, latex: true },
  "space-grotesk": { html: true, latex: true },
  manrope: { html: true, latex: true }
});

function bullet(id, label, packageLine, itemTemplate, subitemTemplate, cssMarker) {
  return {
    id,
    label,
    packageLine,
    itemTemplate,
    subitemTemplate,
    cssMarker,
    marker: cssMarker,
    latexPackages: packageLine,
    latexItem: itemTemplate,
    latexSubitem: subitemTemplate
  };
}

const PIFONT = "\\usepackage{pifont}";
const AMSSYMB = "\\usepackage{amssymb}";
const TIKZ_SHAPES = "\\RequirePackage{tikz}\\n\\usetikzlibrary{shapes.geometric}";

const BULLETS = defineRegistryCollection({
  "pifont-outline": bullet("pifont-outline", "Pifont Outline", PIFONT, "\\ding{109}", "\\ding{119}", "□"),
  triangle: bullet("triangle", "Triangle", AMSSYMB, "$\\blacktriangleright$", "$\\triangleright$", ">"),
  "ding-arrow": bullet("ding-arrow", "Ding Arrow", PIFONT, "\\ding{220}", "\\ding{216}", "➜"),
  square: bullet("square", "Square", AMSSYMB, "$\\blacksquare$", "$\\square$", "■"),
  star: bullet("star", "Star", AMSSYMB, "$\\bigstar$", "$\\star$", "★"),
  diamond: bullet("diamond", "Diamond", AMSSYMB, "$\\blacklozenge$", "$\\diamond$", "◆"),
  "pifont-ding32": bullet("pifont-ding32", "Pifont Star Open", PIFONT, "\\ding{32}", "\\ding{70}", "☆"),
  "pifont-ding67": bullet("pifont-ding67", "Pifont Star Filled", PIFONT, "\\ding{67}", "\\ding{32}", "★"),
  "pifont-ding70": bullet("pifont-ding70", "Pifont Circle", PIFONT, "\\ding{70}", "\\ding{108}", "●"),
  "pifont-ding109": bullet("pifont-ding109", "Pifont Check", PIFONT, "\\ding{109}", "\\ding{113}", "✓"),
  "pifont-ding110": bullet("pifont-ding110", "Pifont Cross", PIFONT, "\\ding{110}", "\\ding{114}", "✕"),
  "pifont-ding168": bullet("pifont-ding168", "Pifont Heart", PIFONT, "\\ding{168}", "\\ding{170}", "♥"),
  "math-bullet": bullet("math-bullet", "Math Bullet", AMSSYMB, "$\\bullet$", "$\\circ$", "•"),
  "math-star": bullet("math-star", "Math Star", AMSSYMB, "$\\star$", "$\\ast$", "☆"),
  "math-asterisk": bullet("math-asterisk", "Math Asterisk", AMSSYMB, "$\\ast$", "$\\cdot$", "*"),
  "math-dagger": bullet("math-dagger", "Math Dagger", AMSSYMB, "$\\dagger$", "$\\ddagger$", "†"),
  "math-ddagger": bullet("math-ddagger", "Math Double Dagger", AMSSYMB, "$\\ddagger$", "$\\dagger$", "‡"),
  "math-oplus": bullet("math-oplus", "Math Circled Plus", AMSSYMB, "$\\oplus$", "$\\odot$", "⊕"),
  "math-ominus": bullet("math-ominus", "Math Circled Minus", AMSSYMB, "$\\ominus$", "$\\oslash$", "⊖"),
  "math-otimes": bullet("math-otimes", "Math Circled Times", AMSSYMB, "$\\otimes$", "$\\oplus$", "⊗"),
  "math-odot": bullet("math-odot", "Math Circled Dot", AMSSYMB, "$\\odot$", "$\\circ$", "⊙"),
  "math-oslash": bullet("math-oslash", "Math Circled Slash", AMSSYMB, "$\\oslash$", "$\\ominus$", "⊘"),
  "math-circledast": bullet("math-circledast", "Math Circled Asterisk", AMSSYMB, "$\\circledast$", "$\\ast$", "⊛"),
  "tikz-cross": bullet("tikz-cross", "TikZ Cross", "\\RequirePackage{tikz}",
    "\\tikz[baseline=-0.5ex] \\node[inner sep=1.5pt] {\\textbf{\\times}};", "$\\times$", "×"),
  "tikz-plus": bullet("tikz-plus", "TikZ Plus", "\\RequirePackage{tikz}",
    "\\tikz[baseline=-0.5ex] \\node[inner sep=1.5pt] {\\textbf{+}};", "$+$", "+"),
  "tikz-arrow": bullet("tikz-arrow", "TikZ Arrow", "\\RequirePackage{tikz}",
    "\\tikz[baseline=-0.5ex] \\node[inner sep=1pt] {$\\rightarrow$};", "$\\triangleright$", "→"),
  "tikz-octagon": bullet("tikz-octagon", "TikZ Octagon", TIKZ_SHAPES,
    "\\tikz[baseline=-0.5ex] \\node[regular polygon, regular polygon sides=8, fill=black, inner sep=1.5pt] {};",
    "$\\circ$", "⬣")
}, {
  "pifont-outline": { html: true, latex: true },
  triangle: { html: true, latex: true },
  "ding-arrow": { html: true, latex: true },
  square: { html: true, latex: true },
  star: { html: true, latex: true },
  diamond: { html: true, latex: true },
  "pifont-ding32": { html: true, latex: true },
  "pifont-ding67": { html: true, latex: true },
  "pifont-ding70": { html: true, latex: true },
  "pifont-ding109": { html: true, latex: true },
  "pifont-ding110": { html: true, latex: true },
  "pifont-ding168": { html: true, latex: true },
  "math-bullet": { html: true, latex: true },
  "math-star": { html: true, latex: true },
  "math-asterisk": { html: true, latex: true },
  "math-dagger": { html: true, latex: true },
  "math-ddagger": { html: true, latex: true },
  "math-oplus": { html: true, latex: true },
  "math-ominus": { html: true, latex: true },
  "math-otimes": { html: true, latex: true },
  "math-odot": { html: true, latex: true },
  "math-oslash": { html: true, latex: true },
  "math-circledast": { html: true, latex: true },
  "tikz-cross": { html: true, latex: true },
  "tikz-plus": { html: true, latex: true },
  "tikz-arrow": { html: true, latex: true },
  "tikz-octagon": { html: true, latex: true }
});

const BLOCKS = defineRegistryCollection({
  classic: {
    id: "classic",
    label: "Classic",
    latexTemplate: "\\setbeamertemplate{blocks}[default]",
    cssRadius: "0",
    cssShadow: "none",
    radiusUnits: 0,
    shadow: false
  },
  rounded: {
    id: "rounded",
    label: "Rounded",
    latexTemplate: "\\setbeamertemplate{blocks}[rounded][shadow=false]",
    cssRadius: "6px",
    cssShadow: "none",
    radiusUnits: 0.1,
    shadow: false
  },
  shadowed: {
    id: "shadowed",
    label: "Shadowed",
    latexTemplate: "\\setbeamertemplate{blocks}[rounded][shadow=true]",
    cssRadius: "6px",
    cssShadow: "0 10px 24px rgba(15, 23, 42, 0.18)",
    radiusUnits: 0.1,
    shadow: true
  }
}, {
  classic: { html: true, latex: true },
  rounded: { html: true, latex: true },
  shadowed: { html: true, latex: true }
});

const NAVIGATION = defineRegistryCollection({
  none: {
    id: "none",
    label: "None",
    latexOuterTheme: "",
    latexFootline: "\\setbeamertemplate{footline}{}",
    hasHeader: false,
    hasFootline: false,
    header: false,
    footline: false
  },
  "page-number": {
    id: "page-number",
    label: "Page Number",
    latexOuterTheme: "",
    latexFootline: PAGE_NUMBER_FOOTLINE,
    hasHeader: false,
    hasFootline: true,
    header: false,
    footline: true
  },
  "plain-footer": {
    id: "plain-footer",
    label: "Plain Footer",
    latexOuterTheme: "",
    latexFootline: PAGE_NUMBER_FOOTLINE,
    hasHeader: false,
    hasFootline: true,
    header: false,
    footline: true
  },
  "soft-miniframes": {
    id: "soft-miniframes",
    label: "Soft Miniframes",
    latexOuterTheme: "\\useoutertheme[subsection=false]{miniframes}",
    latexFootline: PAGE_NUMBER_FOOTLINE,
    hasHeader: true,
    hasFootline: true,
    header: true,
    footline: true
  }
}, {
  none: { html: true, latex: true },
  "page-number": { html: true, latex: true },
  "plain-footer": { html: true, latex: true },
  "soft-miniframes": { html: true, latex: true }
});

const TITLE_PAGES = defineRegistryCollection({
  "left-curtain": {
    id: "left-curtain",
    label: "Left Curtain",
    description: "Left-aligned title block with generous whitespace.",
    alignment: "left",
    layout: "curtain"
  }
}, {
  "left-curtain": { html: true, latex: true }
});

const LOGOS = defineRegistryCollection({
  none: { id: "none", label: "No Logo", vector: null, vectorId: null, previewUrl: "", asset: null },
  duck: {
    id: "duck",
    label: "Duck",
    vector: duckVector,
    vectorId: "duck",
    previewUrl: "/assets/generated/logos/duck.svg",
    asset: null
  }
}, {
  none: { html: true, latex: true },
  duck: { html: true, latex: true }
});

function getRegistry() {
  return clone({
    palettes: PALETTES,
    fonts: FONTS,
    bullets: BULLETS,
    blocks: BLOCKS,
    navigation: NAVIGATION,
    titlePages: TITLE_PAGES,
    logos: LOGOS
  });
}

function resolveThemeChoices(theme, registry = getRegistry()) {
  return {
    palette: registry.palettes[theme.colors.paletteId],
    bodyFont: registry.fonts[theme.fonts.body],
    titleFont: registry.fonts[theme.fonts.title],
    bullet: registry.bullets[theme.bullets.style],
    block: registry.blocks[theme.blocks.style],
    navigation: registry.navigation[theme.navigation.style],
    titlePage: registry.titlePages[theme.titlePage.layout],
    logo: registry.logos[theme.decorations.cornerLogo.id]
  };
}

function resolveAssetPath(rootDir, assetPath) {
  return path.join(rootDir, assetPath);
}

module.exports = {
  defineRegistryCollection,
  getRegistry,
  resolveThemeChoices,
  resolveAssetPath
};
