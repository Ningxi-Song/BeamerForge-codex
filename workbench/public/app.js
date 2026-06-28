const COLOR_ROLES = ["background", "primary", "accent", "text", "blockBody", "alert"];

const COLOR_SCHEMES = Object.freeze({
  complementary: {
    id: "complementary",
    label: "Complementary",
    description: "Two colors 180 degrees apart. Useful when the accent needs to stand out."
  },
  analogous: {
    id: "analogous",
    label: "Analogous",
    description: "Neighboring colors on the wheel. Cohesive and calm for academic talks."
  },
  triadic: {
    id: "triadic",
    label: "Triadic",
    description: "Three balanced colors. Good when sections need distinct identities."
  },
  split: {
    id: "split",
    label: "Split-Comp.",
    description: "A base color plus two softened complements. High contrast with less tension."
  },
  monochrome: {
    id: "monochrome",
    label: "Monochrome",
    description: "One hue with lightness changes. Restrained and formal."
  },
  tetradic: {
    id: "tetradic",
    label: "Tetradic",
    description: "Four colors in two complementary pairs. Works for richer visual systems."
  },
  pentagonal: {
    id: "pentagonal",
    label: "Pentagonal",
    description: "Five evenly spaced colors. Best for exploratory palette generation."
  }
});

const PREVIEW_MODES = Object.freeze({
  content: "content",
  title: "title",
  blocks: "blocks"
});

const CUBE_GRID_STEPS = 14;
const CUBE_HALF = 1;

const state = {
  registry: null,
  theme: null,
  baseColor: { r: 69, g: 105, b: 144 },
  colorScheme: "complementary",
  colorMode: "slider",
  previewMode: PREVIEW_MODES.content,
  savedPalettes: [],
  paletteCounter: 0,
  cube: {
    initialized: false,
    bound: false,
    yaw: -0.72,
    pitch: -0.42,
    dragging: false,
    dragMoved: false,
    lastX: 0,
    lastY: 0
  }
};

const elements = {
  palette: document.getElementById("palette"),
  paletteSwatches: document.getElementById("paletteSwatches"),
  colorModeTabs: document.getElementById("colorModeTabs"),
  sliderPanel: document.getElementById("sliderPanel"),
  cubePanel: document.getElementById("cubePanel"),
  colorCubeCanvas: document.getElementById("colorCubeCanvas"),
  cubeSelectedSwatch: document.getElementById("cubeSelectedSwatch"),
  cubeSelectedValues: document.getElementById("cubeSelectedValues"),
  baseColorPreview: document.getElementById("baseColorPreview"),
  baseColorPicker: document.getElementById("baseColorPicker"),
  previewColorLabel: document.getElementById("previewColorLabel"),
  baseHexInput: document.getElementById("baseHexInput"),
  baseRgbSliderR: document.getElementById("baseRgbSliderR"),
  baseRgbSliderG: document.getElementById("baseRgbSliderG"),
  baseRgbSliderB: document.getElementById("baseRgbSliderB"),
  baseRgbR: document.getElementById("baseRgbR"),
  baseRgbG: document.getElementById("baseRgbG"),
  baseRgbB: document.getElementById("baseRgbB"),
  copyHexColor: document.getElementById("copyHexColor"),
  copyRgbColor: document.getElementById("copyRgbColor"),
  colorScheme: document.getElementById("colorScheme"),
  schemeTabs: document.getElementById("schemeTabs"),
  schemeDescription: document.getElementById("schemeDescription"),
  schemeSwatches: document.getElementById("schemeSwatches"),
  paletteDisplay: document.getElementById("paletteDisplay"),
  copyAllColors: document.getElementById("copyAllColors"),
  savePalette: document.getElementById("savePalette"),
  savedPalettes: document.getElementById("savedPalettes"),
  applySchemeColors: document.getElementById("applySchemeColors"),
  bodyFont: document.getElementById("bodyFont"),
  fontGallery: document.getElementById("fontGallery"),
  bulletStyle: document.getElementById("bulletStyle"),
  bulletGallery: document.getElementById("bulletGallery"),
  blockStyle: document.getElementById("blockStyle"),
  navigationStyle: document.getElementById("navigationStyle"),
  templateName: document.getElementById("templateName"),
  previewModeTabs: document.getElementById("previewModeTabs"),
  preview: document.getElementById("slidePreview"),
  saveStatus: document.getElementById("saveStatus"),
  buildStatus: document.getElementById("buildStatus"),
  saveTheme: document.getElementById("saveTheme"),
  generateTheme: document.getElementById("generateTheme"),
  compileTheme: document.getElementById("compileTheme")
};

const themeControls = [
  elements.bodyFont,
  elements.bulletStyle,
  elements.blockStyle,
  elements.navigationStyle,
  elements.templateName
];

const rgbInputs = [elements.baseRgbR, elements.baseRgbG, elements.baseRgbB];
const rgbSliders = [elements.baseRgbSliderR, elements.baseRgbSliderG, elements.baseRgbSliderB];
const actionButtons = [elements.saveTheme, elements.generateTheme, elements.compileTheme];
let cubeCells = [];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function slugifyName(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function setStatus(text, className = "") {
  elements.saveStatus.className = className ? `status ${className}` : "status";
  elements.saveStatus.textContent = text;
}

function setBuildStatus(value) {
  if (typeof value === "string") {
    elements.buildStatus.textContent = value;
    return;
  }

  elements.buildStatus.textContent = JSON.stringify(value, null, 2);
}

function setBusy(isBusy) {
  for (const button of actionButtons) {
    button.disabled = isBusy;
  }
}

function replaceChildren(parent, children) {
  parent.replaceChildren(...children);
}

function optionList(select, collection, selectedId) {
  const options = Object.values(collection).map((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.label;
    option.selected = item.id === selectedId;
    return option;
  });

  replaceChildren(select, options);
}

async function api(path, options) {
  const response = await fetch(path, options);
  const body = await response.json();

  if (!response.ok) {
    const message = Array.isArray(body.errors)
      ? body.errors.map((error) => `${error.path}: ${error.message}`).join("\n")
      : body.error || body.message || body.status;
    const error = new Error(message || `Request failed: ${response.status}`);
    error.details = body;
    throw error;
  }

  return body;
}

function clampByte(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return 0;
  return Math.max(0, Math.min(255, parsed));
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b]
    .map((channel) => clampByte(channel).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function normalizeHex(value) {
  let hex = String(value || "").trim();
  if (!hex) return null;
  if (!hex.startsWith("#")) hex = `#${hex}`;
  if (/^#[0-9A-Fa-f]{3}$/.test(hex)) {
    hex = `#${hex
      .slice(1)
      .split("")
      .map((part) => part + part)
      .join("")}`;
  }
  return /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex.toUpperCase() : null;
}

function hexToRgb(hex) {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;

  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16)
  };
}

function rgbToHsl(r, g, b) {
  const nr = clampByte(r) / 255;
  const ng = clampByte(g) / 255;
  const nb = clampByte(b) / 255;
  const max = Math.max(nr, ng, nb);
  const min = Math.min(nr, ng, nb);
  const lightness = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l: lightness * 100 };
  }

  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue;

  if (max === nr) {
    hue = (ng - nb) / delta + (ng < nb ? 6 : 0);
  } else if (max === ng) {
    hue = (nb - nr) / delta + 2;
  } else {
    hue = (nr - ng) / delta + 4;
  }

  return { h: hue * 60, s: saturation * 100, l: lightness * 100 };
}

function hslToRgb(h, s, l) {
  const hue = ((h % 360) + 360) % 360;
  const saturation = Math.max(0, Math.min(100, s)) / 100;
  const lightness = Math.max(0, Math.min(100, l)) / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = lightness - chroma / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (hue < 60) {
    r = chroma;
    g = x;
  } else if (hue < 120) {
    r = x;
    g = chroma;
  } else if (hue < 180) {
    g = chroma;
    b = x;
  } else if (hue < 240) {
    g = x;
    b = chroma;
  } else if (hue < 300) {
    r = x;
    b = chroma;
  } else {
    r = chroma;
    b = x;
  }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255)
  };
}

function luminance(r, g, b) {
  const channels = [r, g, b].map((channel) => {
    const normalized = clampByte(channel) / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function textColorFor(color) {
  return luminance(color.r, color.g, color.b) > 0.36 ? "#111827" : "#FFFFFF";
}

function colorFromHex(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return { hex: "#000000", r: 0, g: 0, b: 0 };
  return { hex: rgbToHex(rgb.r, rgb.g, rgb.b), r: rgb.r, g: rgb.g, b: rgb.b };
}

function generateScheme(scheme, r, g, b) {
  const hsl = rgbToHsl(r, g, b);
  const colors = [{ hex: rgbToHex(r, g, b), r: clampByte(r), g: clampByte(g), b: clampByte(b) }];

  function addColor(hue, saturation, lightness) {
    const rgb = hslToRgb(hue, saturation, lightness);
    colors.push({ hex: rgbToHex(rgb.r, rgb.g, rgb.b), r: rgb.r, g: rgb.g, b: rgb.b });
  }

  switch (scheme) {
    case "analogous":
      addColor(hsl.h - 30, hsl.s, hsl.l);
      addColor(hsl.h + 30, hsl.s, hsl.l);
      break;
    case "triadic":
      addColor(hsl.h + 120, hsl.s, hsl.l);
      addColor(hsl.h + 240, hsl.s, hsl.l);
      break;
    case "split":
      addColor(hsl.h + 150, hsl.s, hsl.l);
      addColor(hsl.h + 210, hsl.s, hsl.l);
      break;
    case "monochrome":
      addColor(hsl.h, hsl.s, Math.max(hsl.l - 24, 8));
      addColor(hsl.h, hsl.s * 0.72, Math.min(hsl.l + 16, 88));
      addColor(hsl.h, hsl.s * 0.36, Math.min(hsl.l + 34, 94));
      break;
    case "tetradic":
      addColor(hsl.h + 90, hsl.s, hsl.l);
      addColor(hsl.h + 180, hsl.s, hsl.l);
      addColor(hsl.h + 270, hsl.s, hsl.l);
      break;
    case "pentagonal":
      addColor(hsl.h + 72, hsl.s, hsl.l);
      addColor(hsl.h + 144, hsl.s, hsl.l);
      addColor(hsl.h + 216, hsl.s, hsl.l);
      addColor(hsl.h + 288, hsl.s, hsl.l);
      break;
    case "complementary":
    default:
      addColor(hsl.h + 180, hsl.s, hsl.l);
      break;
  }

  return colors;
}

function lightenForBlock(color) {
  return rgbToHex(
    Math.round(color.r * 0.16 + 255 * 0.84),
    Math.round(color.g * 0.16 + 255 * 0.84),
    Math.round(color.b * 0.16 + 255 * 0.84)
  );
}

function tintForSurface(color) {
  return rgbToHex(
    Math.round(color.r * 0.04 + 255 * 0.96),
    Math.round(color.g * 0.04 + 255 * 0.96),
    Math.round(color.b * 0.04 + 255 * 0.96)
  );
}

function getGeneratedSchemeColors() {
  return generateScheme(state.colorScheme, state.baseColor.r, state.baseColor.g, state.baseColor.b);
}

function currentHex() {
  return rgbToHex(state.baseColor.r, state.baseColor.g, state.baseColor.b);
}

function currentRgbString() {
  return `rgb(${state.baseColor.r}, ${state.baseColor.g}, ${state.baseColor.b})`;
}

function syncBaseColorControls() {
  const hex = currentHex();
  elements.baseColorPicker.value = hex;
  elements.baseHexInput.value = hex;
  elements.baseRgbR.value = state.baseColor.r;
  elements.baseRgbG.value = state.baseColor.g;
  elements.baseRgbB.value = state.baseColor.b;
  elements.baseRgbSliderR.value = state.baseColor.r;
  elements.baseRgbSliderG.value = state.baseColor.g;
  elements.baseRgbSliderB.value = state.baseColor.b;
  elements.baseColorPreview.style.backgroundColor = hex;
  elements.previewColorLabel.textContent = hex;
  syncCubeSelectedColor();
  if (state.colorMode === "cube") {
    renderColorCube();
  }
}

function setBaseColor(rgb, options = {}) {
  state.baseColor = {
    r: clampByte(rgb.r),
    g: clampByte(rgb.g),
    b: clampByte(rgb.b)
  };
  syncBaseColorControls();
  renderColorScheme();

  if (options.apply !== false) {
    applyGeneratedScheme();
  }
}

function selectedPalette() {
  return state.registry.palettes[elements.palette.value];
}

function applyPalette(theme, palette) {
  theme.colors.paletteId = palette.id;
  Object.assign(theme.colors, palette.colors);
}

function applySelectedPalette() {
  const palette = selectedPalette();
  if (!palette) return;

  if (palette.id === "custom") {
    state.theme.colors.paletteId = "custom";
    return;
  }

  applyPalette(state.theme, palette);
  const primary = hexToRgb(state.theme.colors.primary);
  if (primary) {
    setBaseColor(primary, { apply: false });
  }
}

function applyGeneratedScheme() {
  const colors = getGeneratedSchemeColors();
  const primary = colors[0];
  const accent = colors[1] || primary;
  const alert = colors[2] || accent;

  Object.assign(state.theme.colors, {
    paletteId: "custom",
    background: tintForSurface(primary),
    primary: primary.hex,
    accent: accent.hex,
    text: "#111827",
    blockBody: lightenForBlock(primary),
    alert: alert.hex
  });

  elements.palette.value = "custom";
  renderPaletteSwatches();
  renderPreview();
  setStatus("Unsaved");
}

function syncThemeFromControls() {
  const theme = state.theme;
  const font = state.registry.fonts[elements.bodyFont.value];

  theme.fonts.body = font.id;
  theme.fonts.title = font.id;
  theme.fonts.mode = font.mode;
  theme.bullets.style = elements.bulletStyle.value;
  theme.blocks.style = elements.blockStyle.value;
  theme.navigation.style = elements.navigationStyle.value;
  theme.identity.name = slugifyName(elements.templateName.value) || "blue-academic";
}

function renderPaletteSwatches() {
  const swatches = COLOR_ROLES.map((name) => {
    const color = state.theme.colors[name];
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.title = `${name}: ${color}`;
    swatch.style.backgroundColor = color;
    return swatch;
  });

  replaceChildren(elements.paletteSwatches, swatches);
}

function renderSchemeTabs() {
  const tabs = Object.values(COLOR_SCHEMES).map((scheme) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = scheme.id === state.colorScheme ? "tab-button is-active" : "tab-button";
    button.dataset.scheme = scheme.id;
    button.textContent = scheme.label;
    return button;
  });

  replaceChildren(elements.schemeTabs, tabs);
}

function renderSchemeSwatches() {
  const swatches = getGeneratedSchemeColors().map((color) => {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "scheme-swatch";
    swatch.title = `Use ${color.hex} as base color`;

    const chip = document.createElement("span");
    chip.className = "scheme-swatch-chip";
    chip.style.backgroundColor = color.hex;

    const label = document.createElement("span");
    label.className = "scheme-swatch-label";
    label.textContent = color.hex;

    swatch.append(chip, label);
    swatch.addEventListener("click", () => {
      setBaseColor(color);
    });
    return swatch;
  });

  replaceChildren(elements.schemeSwatches, swatches);
}

function renderPaletteDisplay() {
  const colors = getGeneratedSchemeColors();
  const cards = colors.map((color) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "palette-color";
    card.title = `Copy ${color.hex}`;

    const chip = document.createElement("span");
    chip.className = "palette-color-chip";
    chip.style.backgroundColor = color.hex;

    const info = document.createElement("span");
    info.className = "palette-color-info";

    const hex = document.createElement("span");
    hex.textContent = color.hex;

    const rgb = document.createElement("span");
    rgb.textContent = `rgb(${color.r}, ${color.g}, ${color.b})`;

    info.append(hex, rgb);
    card.append(chip, info);
    card.addEventListener("click", () => {
      copyText(`${color.hex}  rgb(${color.r}, ${color.g}, ${color.b})`, "Color copied");
    });

    return card;
  });

  replaceChildren(elements.paletteDisplay, cards);
}

function renderColorScheme() {
  const scheme = COLOR_SCHEMES[state.colorScheme] || COLOR_SCHEMES.complementary;
  elements.colorScheme.value = scheme.id;
  elements.schemeDescription.textContent = scheme.description;
  renderSchemeTabs();
  renderSchemeSwatches();
  renderPaletteDisplay();
}

function syncBaseFromTheme() {
  const primary = hexToRgb(state.theme.colors.primary);
  if (primary) {
    state.baseColor = primary;
  }
  syncBaseColorControls();
}

function renderFontGallery() {
  const cards = Object.values(state.registry.fonts).map((font) => {
    const isSelected = font.id === state.theme.fonts.body;
    const card = document.createElement("button");
    card.type = "button";
    card.className = isSelected ? "sample-card font-sample-card is-active" : "sample-card font-sample-card";
    card.dataset.fontId = font.id;
    card.setAttribute("aria-pressed", String(isSelected));
    card.title = `Use ${font.label}`;

    const sample = document.createElement("span");
    sample.className = "font-sample-text";
    sample.style.fontFamily = font.cssFamily;
    sample.textContent = "Presentation Title";

    const meta = document.createElement("span");
    meta.className = "sample-meta";
    meta.textContent = `${font.label} | ${font.mode}`;

    card.append(sample, meta);
    return card;
  });

  replaceChildren(elements.fontGallery, cards);
}

function renderBulletGallery() {
  const cards = Object.values(state.registry.bullets).map((bullet) => {
    const isSelected = bullet.id === state.theme.bullets.style;
    const card = document.createElement("button");
    card.type = "button";
    card.className = isSelected ? "sample-card bullet-sample-card is-active" : "sample-card bullet-sample-card";
    card.dataset.bulletId = bullet.id;
    card.setAttribute("aria-pressed", String(isSelected));
    card.title = `Use ${bullet.label}`;

    const label = document.createElement("span");
    label.className = "bullet-sample-label";
    label.textContent = bullet.label;

    const list = document.createElement("span");
    list.className = "bullet-sample-list";
    list.style.setProperty("--sample-bullet-marker", JSON.stringify(bullet.cssMarker));

    const bulletSampleText = document.createElement("span");
    bulletSampleText.textContent = "Main claim";
    list.appendChild(bulletSampleText);

    card.append(label, list);
    return card;
  });

  replaceChildren(elements.bulletGallery, cards);
}

function selectFontOption(fontId) {
  if (!state.registry.fonts[fontId]) return;
  elements.bodyFont.value = fontId;
  syncThemeFromControls();
  renderFontGallery();
  renderPreview();
  setStatus("Unsaved");
}

function selectBulletOption(bulletId) {
  if (!state.registry.bullets[bulletId]) return;
  elements.bulletStyle.value = bulletId;
  syncThemeFromControls();
  renderBulletGallery();
  renderPreview();
  setStatus("Unsaved");
}

function renderControls() {
  const registry = state.registry;
  const theme = state.theme;

  optionList(elements.palette, registry.palettes, theme.colors.paletteId);
  optionList(elements.colorScheme, COLOR_SCHEMES, state.colorScheme);
  optionList(elements.bodyFont, registry.fonts, theme.fonts.body);
  optionList(elements.bulletStyle, registry.bullets, theme.bullets.style);
  optionList(elements.blockStyle, registry.blocks, theme.blocks.style);
  optionList(elements.navigationStyle, registry.navigation, theme.navigation.style);
  elements.templateName.value = theme.identity.name;
  syncBaseFromTheme();
  renderFontGallery();
  renderBulletGallery();
  renderPaletteSwatches();
  renderColorScheme();
  renderSavedPalettes();
  renderPreviewMode();
}

function appendMiniHeader(parent, color) {
  const header = document.createElement("div");
  header.className = "mini-header";
  header.style.color = color;

  for (let index = 0; index < 4; index += 1) {
    header.appendChild(document.createElement("span"));
  }

  parent.appendChild(header);
}

function appendFrameTitle(parent, theme, text = theme.contentDefaults.sampleTitle) {
  const title = document.createElement("div");
  title.className = "frame-title";
  title.style.color = theme.colors.primary;
  title.textContent = text;
  parent.appendChild(title);
}

function appendBullets(parent, theme) {
  const list = document.createElement("ul");

  for (const item of theme.contentDefaults.sampleBullets) {
    const listItem = document.createElement("li");
    const text = document.createElement("span");
    text.textContent = item;
    listItem.appendChild(text);
    list.appendChild(listItem);
  }

  parent.appendChild(list);
}

function appendPreviewBlock(parent, theme, block, options = {}) {
  const previewBlock = document.createElement("section");
  previewBlock.className = "preview-block";
  previewBlock.style.borderRadius = block.cssRadius;
  previewBlock.style.boxShadow = block.cssShadow;

  const title = document.createElement("div");
  title.className = "preview-block-title";
  title.style.backgroundColor = options.titleColor || theme.colors.primary;
  title.style.color = textColorFor(colorFromHex(options.titleColor || theme.colors.primary));
  title.textContent = options.title || "Design note";

  const body = document.createElement("div");
  body.className = "preview-block-body";
  body.style.backgroundColor = options.bodyColor || theme.colors.blockBody;
  body.textContent = options.body || "The HTML preview and compiled PDF use the same theme tokens.";

  previewBlock.append(title, body);
  parent.appendChild(previewBlock);
}

function appendFootline(parent, theme) {
  const footline = document.createElement("div");
  footline.className = "slide-footline";
  footline.style.color = theme.colors.primary;
  footline.textContent = `${theme.identity.name} | 1 / 3`;
  parent.appendChild(footline);
}

function previewLatexDate(value) {
  if (value !== "\\today") return value || "";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(new Date());
}

function appendContentPreview(parent, theme, block, navigation) {
  if (navigation.hasHeader) {
    appendMiniHeader(parent, theme.colors.primary);
  }

  appendFrameTitle(parent, theme);

  const content = document.createElement("div");
  content.className = "slide-content";
  appendBullets(content, theme);
  appendPreviewBlock(content, theme, block);
  parent.appendChild(content);

  if (navigation.hasFootline) {
    appendFootline(parent, theme);
  }
}

function appendTitlePreview(parent, theme) {
  const wrapper = document.createElement("section");
  wrapper.className = "title-preview";

  const main = document.createElement("div");
  main.className = "title-preview-main";

  const title = document.createElement("h3");
  title.style.color = theme.colors.primary;
  title.textContent = theme.identity.title || "Presentation Title";

  const subtitle = document.createElement("p");
  subtitle.textContent = theme.identity.subtitle || "Short subtitle or event name";

  const meta = document.createElement("div");
  meta.className = "title-preview-meta";

  for (const value of [
    theme.identity.author,
    theme.identity.institute,
    previewLatexDate(theme.identity.date)
  ]) {
    const item = document.createElement("span");
    item.textContent = value || "";
    meta.appendChild(item);
  }

  main.append(title, subtitle, meta);
  wrapper.append(main);
  parent.appendChild(wrapper);
}

function appendBlocksPreview(parent, theme, block, navigation) {
  if (navigation.hasHeader) {
    appendMiniHeader(parent, theme.colors.primary);
  }

  appendFrameTitle(parent, theme, "Block styles should clarify hierarchy");

  const colors = getGeneratedSchemeColors();
  const body = document.createElement("div");
  body.className = "blocks-preview";

  const blocks = [
    {
      title: "Main result",
      body: "Use the primary color for the most important claim on the slide.",
      color: theme.colors.primary,
      bodyColor: theme.colors.blockBody
    },
    {
      title: "Contrast",
      body: "Use the accent color for secondary structure, not decoration.",
      color: theme.colors.accent,
      bodyColor: lightenForBlock(colors[1] || colorFromHex(theme.colors.accent))
    },
    {
      title: "Alert",
      body: "Reserve the alert color for warnings, assumptions, and caveats.",
      color: theme.colors.alert,
      bodyColor: lightenForBlock(colors[2] || colorFromHex(theme.colors.alert))
    }
  ];

  for (const item of blocks) {
    appendPreviewBlock(body, theme, block, {
      title: item.title,
      body: item.body,
      titleColor: item.color,
      bodyColor: item.bodyColor
    });
  }

  parent.appendChild(body);

  if (navigation.hasFootline) {
    appendFootline(parent, theme);
  }
}

function renderPreviewMode() {
  const buttons = elements.previewModeTabs.querySelectorAll("[data-preview-mode]");
  for (const button of buttons) {
    button.classList.toggle("is-active", button.dataset.previewMode === state.previewMode);
  }
  renderPreview();
}

function renderPreview() {
  const theme = state.theme;
  const registry = state.registry;
  const bullet = registry.bullets[theme.bullets.style];
  const block = registry.blocks[theme.blocks.style];
  const font = registry.fonts[theme.fonts.body];
  const navigation = registry.navigation[theme.navigation.style];

  elements.preview.style.background = theme.colors.background;
  elements.preview.style.color = theme.colors.text;
  elements.preview.style.fontFamily = font.cssFamily;
  elements.preview.style.setProperty("--bullet-marker", JSON.stringify(bullet.cssMarker));
  elements.preview.style.setProperty("--accent-color", theme.colors.accent);
  elements.preview.replaceChildren();

  if (state.previewMode === PREVIEW_MODES.title) {
    appendTitlePreview(elements.preview, theme);
    return;
  }

  if (state.previewMode === PREVIEW_MODES.blocks) {
    appendBlocksPreview(elements.preview, theme, block, navigation);
    return;
  }

  appendContentPreview(elements.preview, theme, block, navigation);
}

function render() {
  renderControls();
}

function cubeMetrics() {
  const canvas = elements.colorCubeCanvas;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(220, Math.round(rect.width || canvas.clientWidth || 260));
  const height = Math.max(220, Math.round(rect.height || canvas.clientHeight || 230));
  return {
    width,
    height,
    centerX: width / 2,
    centerY: height / 2,
    scale: Math.min(width, height) * 0.34,
    cameraDistance: 3.6
  };
}

function rotateCubePoint(point) {
  const cosYaw = Math.cos(state.cube.yaw);
  const sinYaw = Math.sin(state.cube.yaw);
  const cosPitch = Math.cos(state.cube.pitch);
  const sinPitch = Math.sin(state.cube.pitch);
  const x1 = point.x * cosYaw - point.z * sinYaw;
  const z1 = point.x * sinYaw + point.z * cosYaw;
  const y1 = point.y * cosPitch - z1 * sinPitch;
  const z2 = point.y * sinPitch + z1 * cosPitch;

  return { x: x1, y: y1, z: z2 };
}

function projectCubePoint(point, metrics) {
  const rotated = rotateCubePoint(point);
  const perspective = metrics.cameraDistance / (metrics.cameraDistance - rotated.z);
  return {
    x: metrics.centerX + rotated.x * metrics.scale * perspective,
    y: metrics.centerY - rotated.y * metrics.scale * perspective,
    z: rotated.z
  };
}

function rgbForCubePoint(point) {
  return {
    r: clampByte(Math.round(((point.x + CUBE_HALF) / (CUBE_HALF * 2)) * 255)),
    g: clampByte(Math.round(((point.y + CUBE_HALF) / (CUBE_HALF * 2)) * 255)),
    b: clampByte(Math.round(((point.z + CUBE_HALF) / (CUBE_HALF * 2)) * 255))
  };
}

function pointForCubeColor(color) {
  return {
    x: (clampByte(color.r) / 255) * 2 - CUBE_HALF,
    y: (clampByte(color.g) / 255) * 2 - CUBE_HALF,
    z: (clampByte(color.b) / 255) * 2 - CUBE_HALF
  };
}

function cubeFacePoint(face, u, v) {
  if (face.axis === "x") return { x: face.side, y: u, z: v };
  if (face.axis === "y") return { x: u, y: face.side, z: v };
  return { x: u, y: v, z: face.side };
}

function cubeCell(face, u0, u1, v0, v1, metrics) {
  const corners = [
    cubeFacePoint(face, u0, v0),
    cubeFacePoint(face, u1, v0),
    cubeFacePoint(face, u1, v1),
    cubeFacePoint(face, u0, v1)
  ];
  const center = cubeFacePoint(face, (u0 + u1) / 2, (v0 + v1) / 2);
  const projected = corners.map((point) => projectCubePoint(point, metrics));
  const color = rgbForCubePoint(center);

  return {
    polygon: projected.map((point) => ({ x: point.x, y: point.y })),
    depth: projected.reduce((total, point) => total + point.z, 0) / projected.length,
    color,
    hex: rgbToHex(color.r, color.g, color.b)
  };
}

function drawCubeCell(ctx, cell) {
  const [first, ...rest] = cell.polygon;
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (const point of rest) {
    ctx.lineTo(point.x, point.y);
  }
  ctx.closePath();
  ctx.fillStyle = cell.hex;
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
  ctx.lineWidth = 0.45;
  ctx.stroke();
}

function drawCubeEdges(ctx, metrics) {
  const vertices = [
    { x: -1, y: -1, z: -1 },
    { x: 1, y: -1, z: -1 },
    { x: 1, y: 1, z: -1 },
    { x: -1, y: 1, z: -1 },
    { x: -1, y: -1, z: 1 },
    { x: 1, y: -1, z: 1 },
    { x: 1, y: 1, z: 1 },
    { x: -1, y: 1, z: 1 }
  ].map((point) => projectCubePoint(point, metrics));
  const edges = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7]
  ];

  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.58)";
  ctx.lineWidth = 1.2;
  for (const [start, end] of edges) {
    ctx.beginPath();
    ctx.moveTo(vertices[start].x, vertices[start].y);
    ctx.lineTo(vertices[end].x, vertices[end].y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCubeMarker(ctx, metrics) {
  const marker = projectCubePoint(pointForCubeColor(state.baseColor), metrics);
  const lightMarker = luminance(state.baseColor.r, state.baseColor.g, state.baseColor.b) < 0.42;

  ctx.save();
  ctx.beginPath();
  ctx.arc(marker.x, marker.y, 7, 0, Math.PI * 2);
  ctx.fillStyle = currentHex();
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = lightMarker ? "#FFFFFF" : "#111827";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(marker.x, marker.y, 11, 0, Math.PI * 2);
  ctx.lineWidth = 1;
  ctx.strokeStyle = lightMarker ? "rgba(255, 255, 255, 0.7)" : "rgba(17, 24, 39, 0.65)";
  ctx.stroke();
  ctx.restore();
}

function renderColorCube() {
  const canvas = elements.colorCubeCanvas;
  if (!canvas || state.colorMode !== "cube") return;

  const metrics = cubeMetrics();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(metrics.width * dpr);
  canvas.height = Math.round(metrics.height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, metrics.width, metrics.height);

  const background = ctx.createLinearGradient(0, 0, metrics.width, metrics.height);
  background.addColorStop(0, "#111827");
  background.addColorStop(1, "#05070b");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, metrics.width, metrics.height);

  const faces = [
    { axis: "x", side: -1 },
    { axis: "x", side: 1 },
    { axis: "y", side: -1 },
    { axis: "y", side: 1 },
    { axis: "z", side: -1 },
    { axis: "z", side: 1 }
  ];
  const cells = [];

  for (const face of faces) {
    for (let row = 0; row < CUBE_GRID_STEPS; row += 1) {
      for (let col = 0; col < CUBE_GRID_STEPS; col += 1) {
        const u0 = -CUBE_HALF + (col / CUBE_GRID_STEPS) * CUBE_HALF * 2;
        const u1 = -CUBE_HALF + ((col + 1) / CUBE_GRID_STEPS) * CUBE_HALF * 2;
        const v0 = -CUBE_HALF + (row / CUBE_GRID_STEPS) * CUBE_HALF * 2;
        const v1 = -CUBE_HALF + ((row + 1) / CUBE_GRID_STEPS) * CUBE_HALF * 2;
        cells.push(cubeCell(face, u0, u1, v0, v1, metrics));
      }
    }
  }

  cubeCells = cells.sort((left, right) => left.depth - right.depth);
  for (const cell of cubeCells) {
    drawCubeCell(ctx, cell);
  }

  drawCubeEdges(ctx, metrics);
  drawCubeMarker(ctx, metrics);
}

function syncCubeSelectedColor() {
  if (!elements.cubeSelectedSwatch || !elements.cubeSelectedValues) return;
  elements.cubeSelectedSwatch.style.backgroundColor = currentHex();
  elements.cubeSelectedValues.textContent = `${currentHex()} | ${currentRgbString()}`;
}

function initColorCube() {
  if (!elements.colorCubeCanvas) return;
  if (!state.cube.initialized) {
    bindCubeControls();
    state.cube.initialized = true;
  }
  renderColorCube();
}

function polygonContainsPoint(polygon, x, y) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const intersects =
      currentPoint.y > y !== previousPoint.y > y &&
      x <
        ((previousPoint.x - currentPoint.x) * (y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function selectCubeColor(x, y) {
  for (let index = cubeCells.length - 1; index >= 0; index -= 1) {
    const cell = cubeCells[index];
    if (polygonContainsPoint(cell.polygon, x, y)) {
      setBaseColor(cell.color);
      return true;
    }
  }
  return false;
}

function cubePointerPosition(event) {
  const rect = elements.colorCubeCanvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function bindCubeControls() {
  if (!elements.colorCubeCanvas || state.cube.bound) return;
  state.cube.bound = true;

  elements.colorCubeCanvas.addEventListener("pointerdown", (event) => {
    const position = cubePointerPosition(event);
    state.cube.dragging = true;
    state.cube.dragMoved = false;
    state.cube.lastX = position.x;
    state.cube.lastY = position.y;
    elements.colorCubeCanvas.setPointerCapture?.(event.pointerId);
  });

  elements.colorCubeCanvas.addEventListener("pointermove", (event) => {
    if (!state.cube.dragging) return;

    const position = cubePointerPosition(event);
    const dx = position.x - state.cube.lastX;
    const dy = position.y - state.cube.lastY;
    if (Math.abs(dx) + Math.abs(dy) > 2) {
      state.cube.dragMoved = true;
    }

    state.cube.yaw += dx * 0.012;
    state.cube.pitch = Math.max(-1.2, Math.min(1.2, state.cube.pitch - dy * 0.012));
    state.cube.lastX = position.x;
    state.cube.lastY = position.y;
    renderColorCube();
  });

  function finishPointer(event) {
    if (!state.cube.dragging) return;

    const position = cubePointerPosition(event);
    state.cube.dragging = false;
    elements.colorCubeCanvas.releasePointerCapture?.(event.pointerId);
    if (!state.cube.dragMoved) {
      selectCubeColor(position.x, position.y);
    }
  }

  elements.colorCubeCanvas.addEventListener("pointerup", finishPointer);
  elements.colorCubeCanvas.addEventListener("pointercancel", () => {
    state.cube.dragging = false;
  });

  window.addEventListener("resize", () => {
    if (state.colorMode === "cube") {
      renderColorCube();
    }
  });
}

function setColorMode(mode) {
  const nextMode = ["slider", "cube", "palette"].includes(mode) ? mode : "slider";
  state.colorMode = nextMode;

  for (const tab of elements.colorModeTabs.querySelectorAll("[data-color-mode]")) {
    tab.classList.toggle("is-active", tab.dataset.colorMode === nextMode);
  }

  elements.sliderPanel.hidden = nextMode !== "slider";
  elements.cubePanel.hidden = nextMode !== "cube";

  if (nextMode === "cube") {
    initColorCube();
    return;
  }

  if (nextMode === "palette") {
    elements.paletteDisplay.scrollIntoView({ block: "nearest" });
  }
}

function cssString(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function assetUrl(asset) {
  return `/assets/${String(asset)
    .split(/[\\/]+/)
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
}

function registerFontFaces(registry) {
  const existing = document.getElementById("previewFontFaces");
  const style = existing || document.createElement("style");
  style.id = "previewFontFaces";

  const rules = [];
  for (const font of Object.values(registry.fonts)) {
    if (!Array.isArray(font.assets) || font.assets.length === 0) continue;
    const regularAsset = font.assets[0];
    const boldAsset = font.assets.find((asset) => /bold/i.test(asset)) || regularAsset;
    rules.push(
      `@font-face { font-family: "${cssString(font.label)}"; src: url("${assetUrl(
        regularAsset
      )}") format("truetype"); font-weight: 400; font-style: normal; font-display: swap; }`
    );
    rules.push(
      `@font-face { font-family: "${cssString(font.label)}"; src: url("${assetUrl(
        boldAsset
      )}") format("truetype"); font-weight: 700; font-style: normal; font-display: swap; }`
    );
  }

  style.textContent = rules.join("\n");
  if (!existing) {
    document.head.appendChild(style);
  }
}

function copyText(text, message = "Copied") {
  const done = () => {
    setStatus(message, "is-saved");
    window.setTimeout(() => setStatus("Unsaved"), 1200);
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    return;
  }

  fallbackCopy(text, done);
}

function fallbackCopy(text, done) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    document.execCommand("copy");
  } catch (error) {
    setStatus("Copy failed", "is-error");
  }

  textarea.remove();
  done();
}

function copyAllColors() {
  const text = getGeneratedSchemeColors()
    .map((color) => `${color.hex}  rgb(${color.r}, ${color.g}, ${color.b})`)
    .join("\n");
  copyText(text, "Palette copied");
}

function savePalette() {
  state.paletteCounter += 1;
  state.savedPalettes.push({
    id: state.paletteCounter,
    name: `Palette ${state.paletteCounter}`,
    scheme: state.colorScheme,
    base: currentHex(),
    colors: getGeneratedSchemeColors(),
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  });
  renderSavedPalettes();
  setStatus("Palette saved", "is-saved");
}

function loadSavedPalette(id) {
  const palette = state.savedPalettes.find((item) => item.id === id);
  if (!palette) return;

  const rgb = hexToRgb(palette.base);
  if (!rgb) return;

  state.colorScheme = palette.scheme;
  setBaseColor(rgb);
  renderColorScheme();
  setStatus("Unsaved");
}

function deleteSavedPalette(id) {
  state.savedPalettes = state.savedPalettes.filter((item) => item.id !== id);
  renderSavedPalettes();
  setStatus("Palette deleted");
}

function renderSavedPalettes() {
  if (state.savedPalettes.length === 0) {
    const empty = document.createElement("p");
    empty.className = "saved-empty";
    empty.textContent = "No saved palettes yet.";
    replaceChildren(elements.savedPalettes, [empty]);
    return;
  }

  const items = state.savedPalettes
    .slice()
    .reverse()
    .map((palette) => {
      const item = document.createElement("div");
      item.className = "saved-item";

      const main = document.createElement("div");
      main.className = "saved-item-main";

      const name = document.createElement("span");
      name.className = "saved-name";
      name.textContent = palette.name;

      const meta = document.createElement("span");
      meta.className = "saved-meta";
      const scheme = COLOR_SCHEMES[palette.scheme] || { label: palette.scheme };
      meta.textContent = `${palette.base} | ${scheme.label} | ${palette.time}`;

      const swatches = document.createElement("div");
      swatches.className = "mini-swatches";
      for (const color of palette.colors) {
        const swatch = document.createElement("span");
        swatch.className = "mini-swatch";
        swatch.style.backgroundColor = color.hex;
        swatch.title = color.hex;
        swatches.appendChild(swatch);
      }

      main.append(name, meta, swatches);

      const actions = document.createElement("div");
      actions.className = "saved-actions";

      const load = document.createElement("button");
      load.type = "button";
      load.className = "secondary-button";
      load.textContent = "Load";
      load.addEventListener("click", () => loadSavedPalette(palette.id));

      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "secondary-button";
      copy.textContent = "Copy";
      copy.addEventListener("click", () => {
        const text = palette.colors
          .map((color) => `${color.hex}  rgb(${color.r}, ${color.g}, ${color.b})`)
          .join("\n");
        copyText(text, "Palette copied");
      });

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "secondary-button";
      remove.textContent = "Del";
      remove.addEventListener("click", () => deleteSavedPalette(palette.id));

      actions.append(load, copy, remove);
      item.append(main, actions);
      return item;
    });

  replaceChildren(elements.savedPalettes, items);
}

async function saveTheme() {
  syncThemeFromControls();
  const result = await api("/api/theme", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(state.theme)
  });

  state.theme = clone(result.theme);
  renderControls();
  setStatus("Saved", "is-saved");
  return result;
}

async function runAction(actionName, request) {
  try {
    setBusy(true);
    setStatus("Saving");
    await saveTheme();
    setStatus(actionName);
    const result = await request();
    setBuildStatus(result);
    setStatus("Saved", "is-saved");
  } catch (error) {
    setBuildStatus(error.details || error.message);
    setStatus("Error", "is-error");
  } finally {
    setBusy(false);
  }
}

function bindThemeControls() {
  elements.palette.addEventListener("input", () => {
    applySelectedPalette();
    syncThemeFromControls();
    renderPaletteSwatches();
    renderPreview();
    setStatus("Unsaved");
  });

  for (const control of themeControls) {
    control.addEventListener("input", () => {
      syncThemeFromControls();
      renderFontGallery();
      renderBulletGallery();
      renderPreview();
      setStatus("Unsaved");
    });
  }

  elements.fontGallery.addEventListener("click", (event) => {
    const button = event.target.closest("[data-font-id]");
    if (!button) return;

    selectFontOption(button.dataset.fontId);
  });

  elements.bulletGallery.addEventListener("click", (event) => {
    const button = event.target.closest("[data-bullet-id]");
    if (!button) return;

    selectBulletOption(button.dataset.bulletId);
  });
}

function bindColorModeTabs() {
  elements.colorModeTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-color-mode]");
    if (!button) return;

    setColorMode(button.dataset.colorMode);
  });
}

function bindColorControls() {
  bindColorModeTabs();

  elements.baseColorPicker.addEventListener("input", (event) => {
    const rgb = hexToRgb(event.target.value);
    if (rgb) setBaseColor(rgb);
  });

  elements.baseHexInput.addEventListener("input", (event) => {
    const rgb = hexToRgb(event.target.value);
    if (rgb) setBaseColor(rgb);
  });

  elements.baseHexInput.addEventListener("change", (event) => {
    const rgb = hexToRgb(event.target.value);
    if (!rgb) {
      syncBaseColorControls();
      setStatus("Invalid HEX", "is-error");
    }
  });

  rgbInputs.forEach((input, index) => {
    input.addEventListener("input", () => {
      rgbSliders[index].value = input.value;
      setBaseColor({
        r: elements.baseRgbR.value,
        g: elements.baseRgbG.value,
        b: elements.baseRgbB.value
      });
    });
  });

  rgbSliders.forEach((slider, index) => {
    slider.addEventListener("input", () => {
      rgbInputs[index].value = slider.value;
      setBaseColor({
        r: elements.baseRgbSliderR.value,
        g: elements.baseRgbSliderG.value,
        b: elements.baseRgbSliderB.value
      });
    });
  });

  elements.colorScheme.addEventListener("input", () => {
    state.colorScheme = elements.colorScheme.value;
    renderColorScheme();
    applyGeneratedScheme();
  });

  elements.schemeTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-scheme]");
    if (!button) return;

    state.colorScheme = button.dataset.scheme;
    renderColorScheme();
    applyGeneratedScheme();
  });

  elements.applySchemeColors.addEventListener("click", () => {
    applyGeneratedScheme();
  });

  elements.copyHexColor.addEventListener("click", () => {
    copyText(currentHex(), "HEX copied");
  });

  elements.copyRgbColor.addEventListener("click", () => {
    copyText(currentRgbString(), "RGB copied");
  });

  elements.copyAllColors.addEventListener("click", () => {
    copyAllColors();
  });

  elements.savePalette.addEventListener("click", () => {
    savePalette();
  });
}

function bindPreviewModeTabs() {
  elements.previewModeTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-preview-mode]");
    if (!button) return;

    state.previewMode = button.dataset.previewMode;
    renderPreviewMode();
  });
}

function bindActions() {
  elements.saveTheme.addEventListener("click", async () => {
    try {
      setBusy(true);
      setStatus("Saving");
      await saveTheme();
      setBuildStatus("Theme saved.");
    } catch (error) {
      setBuildStatus(error.details || error.message);
      setStatus("Error", "is-error");
    } finally {
      setBusy(false);
    }
  });

  elements.generateTheme.addEventListener("click", () => {
    runAction("Generating", () => api("/api/generate", { method: "POST" }));
  });

  elements.compileTheme.addEventListener("click", () => {
    runAction("Compiling", () => api("/api/compile", { method: "POST" }));
  });
}

function bindControls() {
  bindThemeControls();
  bindColorControls();
  bindPreviewModeTabs();
  bindActions();
}

async function boot() {
  setBuildStatus("Loading options and theme...");
  const [registry, theme] = await Promise.all([api("/api/options"), api("/api/theme")]);
  state.registry = registry;
  state.theme = theme;
  registerFontFaces(registry);
  render();
  bindControls();
  setStatus("Idle");
  setBuildStatus("No build yet.");
}

boot().catch((error) => {
  setBuildStatus(error.details || error.message);
  setStatus("Error", "is-error");
});
