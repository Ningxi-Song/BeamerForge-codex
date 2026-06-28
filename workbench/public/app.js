const wizard = window.BeamerForgeWizard;

const STEP_DESCRIPTIONS = Object.freeze({
  start: "Start from the default BeamerForge template, then make one cumulative design decision per step.",
  color: "Choose the color palette that sets the slide surface, structure, accent, text, and alert colors.",
  font: "Choose the type family used for body text and titles.",
  bullets: "Choose the bullet marker style used in itemized content.",
  blocks: "Choose how Beamer blocks frame emphasized content.",
  navigation: "Choose whether slides use headers, footlines, and page numbers.",
  "title-page": "Choose the title slide layout.",
  review: "Review every accumulated choice before generating or compiling the template."
});

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
  }
});

const state = {
  registry: null,
  theme: null,
  validationErrors: [],
  statuses: [],
  busy: false,
  baseColor: { r: 69, g: 105, b: 144 },
  colorScheme: "complementary",
  savedPalettes: [],
  paletteCounter: 0
};

const elements = {
  wizardApp: document.getElementById("wizardApp"),
  stepList: document.getElementById("stepList"),
  stepTitle: document.getElementById("stepTitle"),
  stepDescription: document.getElementById("stepDescription"),
  stepContent: document.getElementById("stepContent"),
  summaryList: document.getElementById("summaryList"),
  slidePreview: document.getElementById("slidePreview"),
  saveStatus: document.getElementById("saveStatus"),
  backStep: document.getElementById("backStep"),
  nextStep: document.getElementById("nextStep"),
  reviewGenerate: document.getElementById("reviewGenerate"),
  compileTheme: document.getElementById("compileTheme"),
  buildStatus: document.getElementById("buildStatus")
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function replaceChildren(parent, children) {
  parent.replaceChildren(...children);
}

function currentStep() {
  return wizard.stepForPath(window.location.pathname);
}

function stepById(stepId) {
  return wizard.STEPS.find((step) => step.id === stepId) || wizard.STEPS[0];
}

function navigateToStep(stepId, options = {}) {
  const step = stepById(stepId);
  if (options.replace) {
    window.history.replaceState({ stepId: step.id }, "", step.path);
  } else {
    window.history.pushState({ stepId: step.id }, "", step.path);
  }
  render();
}

function selectedIdForStep(stepId) {
  const theme = state.theme;
  if (!theme) return "";

  switch (stepId) {
    case "color":
      return theme.colors.paletteId;
    case "font":
      return theme.fonts.body;
    case "bullets":
      return theme.bullets.style;
    case "blocks":
      return theme.blocks.style;
    case "navigation":
      return theme.navigation.style;
    case "title-page":
      return theme.titlePage.layout;
    default:
      return "";
  }
}

function optionCollectionForStep(stepId) {
  const registry = state.registry;
  if (!registry) return {};

  switch (stepId) {
    case "color":
      return registry.palettes || {};
    case "font":
      return registry.fonts || {};
    case "bullets":
      return registry.bullets || {};
    case "blocks":
      return registry.blocks || {};
    case "navigation":
      return registry.navigation || {};
    case "title-page":
      return registry.titlePages || {};
    default:
      return {};
  }
}

function applyChoice(stepId, optionId) {
  const collection = optionCollectionForStep(stepId);
  const option = collection[optionId];
  if (!state.theme || !option) return;

  if (stepId === "color") {
    state.theme.colors.paletteId = option.id;
    Object.assign(state.theme.colors, option.colors);
    syncBaseFromTheme();
  }

  if (stepId === "font") {
    state.theme.fonts.body = option.id;
    state.theme.fonts.title = option.id;
    state.theme.fonts.mode = option.mode;
  }

  if (stepId === "bullets") {
    state.theme.bullets.style = option.id;
  }

  if (stepId === "blocks") {
    state.theme.blocks.style = option.id;
  }

  if (stepId === "navigation") {
    state.theme.navigation.style = option.id;
  }

  if (stepId === "title-page") {
    state.theme.titlePage.layout = option.id;
  }

  state.validationErrors = state.validationErrors.filter((error) => errorStepId(error) !== stepId);
  setStatus("Unsaved");
  render();
}

function errorStepId(error) {
  const path = error && error.path ? String(error.path) : "";
  if (path === "identity" || path.startsWith("identity.") || path === "foundation" || path.startsWith("foundation.")) {
    return "start";
  }
  if (path === "colors" || path.startsWith("colors.")) return "color";
  if (path === "fonts" || path.startsWith("fonts.")) return "font";
  if (path === "bullets" || path.startsWith("bullets.")) return "bullets";
  if (path === "blocks" || path.startsWith("blocks.")) return "blocks";
  if (path === "navigation" || path.startsWith("navigation.")) return "navigation";
  if (path === "titlePage" || path.startsWith("titlePage.")) return "title-page";
  return "review";
}

function refreshStatuses() {
  if (!state.theme || !state.registry) {
    state.statuses = [];
    return state.statuses;
  }
  state.statuses = wizard.deriveStepStatuses(state.theme, state.registry, state.validationErrors);
  return state.statuses;
}

async function api(path, options = {}) {
  const response = await fetch(path, options);
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};

  if (!response.ok || body.ok === false) {
    const error = new Error(body.error || body.message || `Request failed: ${response.status}`);
    error.details = body;
    error.errors = Array.isArray(body.errors) ? body.errors : [];
    throw error;
  }

  return body;
}

function setStatus(text, className = "") {
  elements.saveStatus.className = className ? `status ${className}` : "status";
  elements.saveStatus.textContent = text;
}

function setBuildStatus(value) {
  elements.buildStatus.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function setBusy(isBusy) {
  state.busy = isBusy;
  updateActionStates();
}

function updateActionStates() {
  elements.backStep.disabled = state.busy || currentStep().id === "start";
  elements.nextStep.disabled = state.busy || currentStep().id === "review";
  elements.reviewGenerate.disabled = state.busy || !wizard.canGenerate(state.statuses);
  elements.compileTheme.disabled = state.busy || !wizard.canGenerate(state.statuses);
}

async function saveDraft() {
  try {
    const result = await api("/api/theme", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(state.theme)
    });
    state.theme = clone(result.theme);
    state.validationErrors = [];
    refreshStatuses();
    setStatus("Saved", "is-saved");
    return result;
  } catch (error) {
    if (Array.isArray(error.errors) && error.errors.length > 0) {
      state.validationErrors = error.errors;
      refreshStatuses();
      render();
    }
    setStatus("Error", "is-error");
    throw error;
  }
}

function optionLabel(stepId, optionId) {
  const option = optionCollectionForStep(stepId)[optionId];
  return option ? option.label || option.id : optionId || "Not selected";
}

function renderStepList() {
  const activeStep = currentStep();
  const statusById = new Map(state.statuses.map((status) => [status.id, status]));
  const buttons = wizard.STEPS.map((step) => {
    const status = statusById.get(step.id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = step.id === activeStep.id ? "step-button is-active" : "step-button";
    button.dataset.stepId = step.id;
    button.dataset.state = status ? status.state : "pending";
    button.setAttribute("aria-current", step.id === activeStep.id ? "step" : "false");

    const title = document.createElement("span");
    title.className = "step-button-title";
    title.textContent = step.label;

    const meta = document.createElement("span");
    meta.className = "step-button-meta";
    meta.textContent = status && status.selectedLabel ? status.selectedLabel : status ? status.state : "";

    button.append(title, meta);
    button.addEventListener("click", () => navigateToStep(step.id));
    return button;
  });

  replaceChildren(elements.stepList, buttons);
}

function colorSwatches(colors) {
  const swatches = document.createElement("span");
  swatches.className = "color-swatches";
  for (const color of Object.values(colors || {})) {
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.backgroundColor = color;
    swatch.title = color;
    swatches.appendChild(swatch);
  }
  return swatches;
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

function currentHex() {
  return rgbToHex(state.baseColor.r, state.baseColor.g, state.baseColor.b);
}

function currentRgbString() {
  return `rgb(${state.baseColor.r}, ${state.baseColor.g}, ${state.baseColor.b})`;
}

function getGeneratedSchemeColors() {
  return generateScheme(state.colorScheme, state.baseColor.r, state.baseColor.g, state.baseColor.b);
}

function syncBaseFromTheme() {
  const primary = hexToRgb(state.theme?.colors?.primary);
  if (primary) state.baseColor = primary;
}

function setBaseColor(rgb, options = {}) {
  state.baseColor = {
    r: clampByte(rgb.r),
    g: clampByte(rgb.g),
    b: clampByte(rgb.b)
  };

  if (options.apply === false) {
    if (options.render !== false) render();
    return;
  }

  applyGeneratedScheme({ render: options.render });
}

function applyGeneratedScheme(options = {}) {
  const colors = getGeneratedSchemeColors();
  const primary = colors[0];
  const accent = colors[1] || primary;
  const alert = colors[2] || accent;
  const background = tintForSurface(primary);

  Object.assign(state.theme.colors, {
    paletteId: "custom",
    background,
    primary: primary.hex,
    accent: accent.hex,
    text: textColorFor(background),
    blockBody: lightenForBlock(primary),
    alert: alert.hex
  });

  state.validationErrors = state.validationErrors.filter((error) => errorStepId(error) !== "color");
  setStatus("Unsaved");
  if (options.render !== false) render();
}

function refreshColorEditorOutputs() {
  const preview = document.getElementById("baseColorPreview");
  if (preview) preview.style.backgroundColor = currentHex();

  const colorInput = document.getElementById("baseColorPicker");
  if (colorInput && document.activeElement !== colorInput) colorInput.value = currentHex();

  const hexInput = document.getElementById("baseHexInput");
  if (hexInput && document.activeElement !== hexInput) hexInput.value = currentHex();

  const label = document.getElementById("previewColorLabel");
  if (label) label.textContent = currentHex();

  for (const [channel, suffix] of [
    ["r", "R"],
    ["g", "G"],
    ["b", "B"]
  ]) {
    const slider = document.getElementById(`baseRgbSlider${suffix}`);
    const number = document.getElementById(`baseRgb${suffix}`);
    if (slider && document.activeElement !== slider) slider.value = String(state.baseColor[channel]);
    if (number && document.activeElement !== number) number.value = String(state.baseColor[channel]);
  }

  const selectedId = selectedIdForStep("color");
  for (const button of document.querySelectorAll(".option-card[data-option-id]")) {
    const selected = button.getAttribute("data-option-id") === selectedId;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  }

  const schemeDescription = document.getElementById("schemeDescription");
  if (schemeDescription) {
    schemeDescription.textContent = (COLOR_SCHEMES[state.colorScheme] || COLOR_SCHEMES.complementary).description;
  }

  const schemeSwatches = document.getElementById("schemeSwatches");
  if (schemeSwatches) replaceChildren(schemeSwatches, Array.from(renderSchemeSwatches().childNodes));

  const paletteDisplay = document.getElementById("paletteDisplay");
  if (paletteDisplay) replaceChildren(paletteDisplay, Array.from(renderPaletteDisplay().childNodes));

  refreshStatuses();
  renderStepList();
  renderSummary();
  renderPreview();
  updateActionStates();
}

function copyText(text, message) {
  if (!navigator.clipboard || !navigator.clipboard.writeText) {
    setStatus("Copy unavailable", "is-error");
    return;
  }

  navigator.clipboard
    .writeText(text)
    .then(() => setStatus(message, "is-saved"))
    .catch(() => setStatus("Copy failed", "is-error"));
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
    colors: getGeneratedSchemeColors()
  });
  setStatus("Palette saved", "is-saved");
  render();
}

function loadSavedPalette(id) {
  const palette = state.savedPalettes.find((item) => item.id === id);
  if (!palette) return;
  const rgb = hexToRgb(palette.base);
  if (!rgb) return;
  state.colorScheme = palette.scheme;
  setBaseColor(rgb);
}

function deleteSavedPalette(id) {
  state.savedPalettes = state.savedPalettes.filter((item) => item.id !== id);
  setStatus("Palette deleted");
  render();
}

function renderOptionCards(stepId) {
  const selectedId = selectedIdForStep(stepId);
  const cards = Object.values(optionCollectionForStep(stepId)).map((option) => {
    const isSelected = option.id === selectedId;
    const button = document.createElement("button");
    button.type = "button";
    button.className = isSelected ? "option-card is-selected" : "option-card";
    button.dataset.optionId = option.id;
    button.setAttribute("aria-pressed", String(isSelected));

    const title = document.createElement("span");
    title.className = "option-title";
    title.textContent = option.label || option.id;

    const meta = document.createElement("span");
    meta.className = "option-meta";
    meta.textContent = option.description || option.mode || option.id;

    button.append(title, meta);

    if (stepId === "color") {
      button.appendChild(colorSwatches(option.colors));
    }

    if (stepId === "font") {
      const sample = document.createElement("span");
      sample.className = "font-sample";
      sample.style.fontFamily = option.cssFamily;
      sample.textContent = "A clear claim-driven slide";
      button.appendChild(sample);
    }

    if (stepId === "bullets") {
      const marker = document.createElement("span");
      marker.className = "bullet-sample";
      marker.style.setProperty("--bullet-marker", JSON.stringify(option.cssMarker || ">"));

      const markerText = document.createElement("span");
      markerText.textContent = `${option.cssMarker || ">"} Main claim`;
      marker.appendChild(markerText);
      button.appendChild(marker);
    }

    button.addEventListener("click", () => applyChoice(stepId, option.id));
    return button;
  });

  const grid = document.createElement("div");
  grid.className = "option-grid";
  replaceChildren(grid, cards);
  return grid;
}

function renderSummary() {
  const rows = state.statuses.map((status) => {
    const row = document.createElement("div");
    row.className = "summary-row";
    row.dataset.state = status.state;

    const text = document.createElement("div");
    text.className = "summary-row-text";

    const label = document.createElement("strong");
    label.textContent = status.label;

    const detail = document.createElement("span");
    if (status.messages.length > 0) {
      detail.textContent = status.messages.join("; ");
    } else {
      detail.textContent = status.selectedLabel || status.state;
    }

    text.append(label, detail);

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "secondary-button";
    edit.textContent = "Edit";
    edit.addEventListener("click", () => navigateToStep(status.id));

    row.append(text, edit);
    return row;
  });

  replaceChildren(elements.summaryList, rows);
}

function renderStartContent() {
  const fragment = document.createDocumentFragment();

  const intro = document.createElement("p");
  intro.textContent =
    "The default template is loaded first. Move through the steps to replace only the part you choose while preserving previous and later selections.";

  const name = document.createElement("p");
  name.textContent = `Template slug: ${state.theme.identity.name}`;

  fragment.append(intro, name);
  return fragment;
}

function renderReviewContent() {
  const fragment = document.createDocumentFragment();

  const ready = wizard.canGenerate(state.statuses);
  const message = document.createElement("p");
  message.textContent = ready
    ? "Every step is complete. Generate the template files or compile a PDF from the accumulated theme."
    : "Some steps still need review before generation.";
  fragment.appendChild(message);

  const issues = state.statuses.filter((status) => status.state !== "complete");
  if (issues.length > 0) {
    const list = document.createElement("ul");
    for (const status of issues) {
      const item = document.createElement("li");
      item.textContent = `${status.label}: ${status.messages.join("; ") || "Needs review"}`;
      list.appendChild(item);
    }
    fragment.appendChild(list);
  }

  return fragment;
}

function createFieldLabel(text) {
  const label = document.createElement("span");
  label.className = "field-label";
  label.textContent = text;
  return label;
}

function renderSliderRow(channel, labelText) {
  const value = state.baseColor[channel];
  const sliderIds = { r: "baseRgbSliderR", g: "baseRgbSliderG", b: "baseRgbSliderB" };
  const numberIds = { r: "baseRgbR", g: "baseRgbG", b: "baseRgbB" };
  const row = document.createElement("label");
  row.className = "slider-row";

  const label = document.createElement("span");
  label.className = `${channel}-label`;
  label.textContent = labelText;

  const slider = document.createElement("input");
  slider.id = sliderIds[channel];
  slider.type = "range";
  slider.min = "0";
  slider.max = "255";
  slider.value = String(value);
  slider.setAttribute("aria-label", `${labelText} color channel`);

  const number = document.createElement("input");
  number.id = numberIds[channel];
  number.type = "number";
  number.min = "0";
  number.max = "255";
  number.value = String(value);
  number.setAttribute("aria-label", `${labelText} color value`);

  function update(nextValue) {
    setBaseColor({ ...state.baseColor, [channel]: nextValue }, { render: false });
    refreshColorEditorOutputs();
  }

  slider.addEventListener("input", (event) => update(event.target.value));
  number.addEventListener("input", (event) => update(event.target.value));

  row.append(label, slider, number);
  return row;
}

function renderBaseColorControls() {
  const section = document.createElement("section");
  section.className = "custom-color-section";
  section.setAttribute("aria-label", "Base color controls");

  const preview = document.createElement("div");
  preview.id = "baseColorPreview";
  preview.className = "color-preview-box";
  preview.style.backgroundColor = currentHex();

  const colorInput = document.createElement("input");
  colorInput.id = "baseColorPicker";
  colorInput.type = "color";
  colorInput.value = currentHex();
  colorInput.setAttribute("aria-label", "Base color");
  colorInput.addEventListener("input", (event) => {
    const rgb = hexToRgb(event.target.value);
    if (rgb) {
      setBaseColor(rgb, { render: false });
      refreshColorEditorOutputs();
    }
  });

  const colorLabel = document.createElement("span");
  colorLabel.id = "previewColorLabel";
  colorLabel.className = "color-label";
  colorLabel.textContent = currentHex();

  preview.append(colorInput, colorLabel);

  const hexRow = document.createElement("label");
  hexRow.className = "hex-input-row";
  hexRow.appendChild(createFieldLabel("HEX"));

  const hexInput = document.createElement("input");
  hexInput.id = "baseHexInput";
  hexInput.value = currentHex();
  hexInput.setAttribute("aria-label", "Base HEX color");
  hexInput.addEventListener("input", (event) => {
    const rgb = hexToRgb(event.target.value);
    if (rgb) {
      setBaseColor(rgb, { render: false });
      refreshColorEditorOutputs();
    }
  });
  hexInput.addEventListener("change", (event) => {
    if (!hexToRgb(event.target.value)) {
      setStatus("Invalid HEX", "is-error");
      render();
    }
  });
  hexRow.appendChild(hexInput);

  const sliders = document.createElement("div");
  sliders.className = "slider-group";
  sliders.append(renderSliderRow("r", "R"), renderSliderRow("g", "G"), renderSliderRow("b", "B"));

  const inlineActions = document.createElement("div");
  inlineActions.className = "inline-actions";

  const copyHex = document.createElement("button");
  copyHex.id = "copyHexColor";
  copyHex.type = "button";
  copyHex.className = "secondary-button";
  copyHex.textContent = "Copy HEX";
  copyHex.addEventListener("click", () => copyText(currentHex(), "HEX copied"));

  const copyRgb = document.createElement("button");
  copyRgb.id = "copyRgbColor";
  copyRgb.type = "button";
  copyRgb.className = "secondary-button";
  copyRgb.textContent = "Copy RGB";
  copyRgb.addEventListener("click", () => copyText(currentRgbString(), "RGB copied"));

  inlineActions.append(copyHex, copyRgb);
  section.append(preview, hexRow, sliders, inlineActions);
  return section;
}

function renderSchemeTabs() {
  const tabs = document.createElement("div");
  tabs.id = "schemeTabs";
  tabs.className = "scheme-tabs";
  tabs.setAttribute("aria-label", "Color combination tabs");

  for (const scheme of Object.values(COLOR_SCHEMES)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = scheme.id === state.colorScheme ? "tab-button is-active" : "tab-button";
    button.dataset.scheme = scheme.id;
    button.textContent = scheme.label;
    button.addEventListener("click", () => {
      state.colorScheme = scheme.id;
      applyGeneratedScheme();
    });
    tabs.appendChild(button);
  }

  return tabs;
}

function renderSchemeSwatches() {
  const swatches = document.createElement("div");
  swatches.id = "schemeSwatches";
  swatches.className = "scheme-swatches";
  swatches.setAttribute("aria-label", "Generated color scheme");

  for (const color of getGeneratedSchemeColors()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "scheme-swatch";
    button.title = `Use ${color.hex} as base color`;

    const chip = document.createElement("span");
    chip.className = "scheme-swatch-chip";
    chip.style.backgroundColor = color.hex;

    const label = document.createElement("span");
    label.className = "scheme-swatch-label";
    label.textContent = color.hex;

    button.append(chip, label);
    button.addEventListener("click", () => setBaseColor(color));
    swatches.appendChild(button);
  }

  return swatches;
}

function renderPaletteDisplay() {
  const display = document.createElement("div");
  display.id = "paletteDisplay";
  display.className = "palette-display";
  display.setAttribute("aria-label", "Generated palette display");

  for (const color of getGeneratedSchemeColors()) {
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
    card.addEventListener("click", () => copyText(`${color.hex}  rgb(${color.r}, ${color.g}, ${color.b})`, "Color copied"));
    display.appendChild(card);
  }

  return display;
}

function renderSavedPalettes() {
  const section = document.createElement("section");
  section.className = "saved-section";
  section.setAttribute("aria-label", "Saved palettes");

  const label = createFieldLabel("Saved Palettes");
  const list = document.createElement("div");
  list.id = "savedPalettes";
  list.className = "saved-palettes";

  if (state.savedPalettes.length === 0) {
    const empty = document.createElement("p");
    empty.className = "saved-empty";
    empty.textContent = "No saved palettes yet.";
    list.appendChild(empty);
  } else {
    for (const palette of state.savedPalettes.slice().reverse()) {
      const item = document.createElement("div");
      item.className = "saved-item";

      const main = document.createElement("div");
      main.className = "saved-item-main";

      const name = document.createElement("span");
      name.className = "saved-name";
      name.textContent = palette.name;

      const meta = document.createElement("span");
      meta.className = "saved-meta";
      meta.textContent = `${palette.base} | ${COLOR_SCHEMES[palette.scheme]?.label || palette.scheme}`;

      const mini = document.createElement("div");
      mini.className = "mini-swatches";
      for (const color of palette.colors) {
        const swatch = document.createElement("span");
        swatch.className = "mini-swatch";
        swatch.style.backgroundColor = color.hex;
        swatch.title = color.hex;
        mini.appendChild(swatch);
      }

      main.append(name, meta, mini);

      const actions = document.createElement("div");
      actions.className = "saved-actions";

      const load = document.createElement("button");
      load.type = "button";
      load.className = "secondary-button";
      load.textContent = "Load";
      load.addEventListener("click", () => loadSavedPalette(palette.id));

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "secondary-button";
      remove.textContent = "Delete";
      remove.addEventListener("click", () => deleteSavedPalette(palette.id));

      actions.append(load, remove);
      item.append(main, actions);
      list.appendChild(item);
    }
  }

  section.append(label, list);
  return section;
}

function renderColorStepContent() {
  const wrapper = document.createElement("div");
  wrapper.className = "color-step-workbench";

  const presets = document.createElement("section");
  presets.className = "color-presets";
  presets.setAttribute("aria-label", "Preset palettes");

  const presetsTitle = document.createElement("h3");
  presetsTitle.textContent = "Preset palettes";
  presets.append(presetsTitle, renderOptionCards("color"));

  const editor = document.createElement("section");
  editor.className = "color-editor";
  editor.setAttribute("aria-label", "Custom color picker");

  const header = document.createElement("div");
  header.className = "color-editor-header";

  const title = document.createElement("span");
  title.textContent = "Custom colors";

  const apply = document.createElement("button");
  apply.id = "applySchemeColors";
  apply.type = "button";
  apply.className = "secondary-button";
  apply.textContent = "Apply Scheme";
  apply.addEventListener("click", () => applyGeneratedScheme());
  header.append(title, apply);

  const scheme = COLOR_SCHEMES[state.colorScheme] || COLOR_SCHEMES.complementary;
  const schemeDescription = document.createElement("p");
  schemeDescription.id = "schemeDescription";
  schemeDescription.className = "scheme-description";
  schemeDescription.textContent = scheme.description;

  const actions = document.createElement("div");
  actions.className = "inline-actions";

  const copyAll = document.createElement("button");
  copyAll.id = "copyAllColors";
  copyAll.type = "button";
  copyAll.className = "secondary-button";
  copyAll.textContent = "Copy All";
  copyAll.addEventListener("click", () => copyAllColors());

  const save = document.createElement("button");
  save.id = "savePalette";
  save.type = "button";
  save.className = "secondary-button";
  save.textContent = "Save Palette";
  save.addEventListener("click", () => savePalette());

  actions.append(copyAll, save);

  editor.append(
    header,
    renderBaseColorControls(),
    renderSchemeTabs(),
    schemeDescription,
    renderSchemeSwatches(),
    renderPaletteDisplay(),
    actions,
    renderSavedPalettes()
  );

  wrapper.append(presets, editor);
  return wrapper;
}

function renderStepContent() {
  const step = currentStep();
  elements.stepTitle.textContent = step.label;
  elements.stepDescription.textContent = STEP_DESCRIPTIONS[step.id] || "";

  if (step.id === "start") {
    replaceChildren(elements.stepContent, [renderStartContent()]);
    return;
  }

  if (step.id === "review") {
    replaceChildren(elements.stepContent, [renderReviewContent()]);
    return;
  }

  if (step.id === "color") {
    replaceChildren(elements.stepContent, [renderColorStepContent()]);
    return;
  }

  replaceChildren(elements.stepContent, [renderOptionCards(step.id)]);
}

function textColorFor(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!match) return "#111827";
  const value = match[1];
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.56 ? "#111827" : "#FFFFFF";
}

function appendMiniHeader(parent, theme, navigation) {
  if (!navigation || !navigation.hasHeader) return;

  const header = document.createElement("div");
  header.className = "preview-header";
  header.style.borderColor = theme.colors.primary;
  header.textContent = "Section 1";
  parent.appendChild(header);
}

function appendPreviewTitle(parent, theme) {
  const title = document.createElement("h3");
  title.className = "preview-title";
  title.style.color = theme.colors.primary;
  title.textContent = theme.contentDefaults.sampleTitle;
  parent.appendChild(title);
}

function appendPreviewList(parent, theme, bullet) {
  const list = document.createElement("ul");
  list.className = "preview-list";
  list.style.setProperty("--bullet-marker", JSON.stringify(bullet ? bullet.cssMarker : ">"));
  for (const text of theme.contentDefaults.sampleBullets || []) {
    const item = document.createElement("li");
    item.textContent = text;
    list.appendChild(item);
  }
  parent.appendChild(list);
}

function appendPreviewBlock(parent, theme, block) {
  const wrapper = document.createElement("div");
  wrapper.className = "preview-block";
  wrapper.style.borderRadius = block ? block.cssRadius : "0";
  wrapper.style.boxShadow = block ? block.cssShadow : "none";

  const title = document.createElement("div");
  title.className = "preview-block-title";
  title.style.backgroundColor = theme.colors.primary;
  title.style.color = textColorFor(theme.colors.primary);
  title.textContent = "Takeaway";

  const body = document.createElement("div");
  body.className = "preview-block-body";
  body.style.backgroundColor = theme.colors.blockBody || theme.colors.background;
  body.textContent = "The HTML preview uses the same cumulative theme tokens.";

  wrapper.append(title, body);
  parent.appendChild(wrapper);
}

function appendFootline(parent, theme, navigation) {
  if (!navigation || !navigation.hasFootline) return;

  const footline = document.createElement("div");
  footline.className = "preview-footline";
  footline.style.color = theme.colors.primary;
  footline.textContent = `${theme.identity.name} | 1 / 3`;
  parent.appendChild(footline);
}

function renderPreview() {
  if (!state.theme || !state.registry) return;

  const theme = state.theme;
  const registry = state.registry;
  const font = registry.fonts[theme.fonts.body];
  const bullet = registry.bullets[theme.bullets.style];
  const block = registry.blocks[theme.blocks.style];
  const navigation = registry.navigation[theme.navigation.style];

  elements.slidePreview.style.backgroundColor = theme.colors.background;
  elements.slidePreview.style.color = theme.colors.text;
  elements.slidePreview.style.fontFamily = font ? font.cssFamily : "Arial, sans-serif";
  elements.slidePreview.style.setProperty("--accent-color", theme.colors.accent);
  elements.slidePreview.style.setProperty("--primary-color", theme.colors.primary);
  elements.slidePreview.style.setProperty("--bullet-marker", JSON.stringify(bullet ? bullet.cssMarker : ">"));

  const slide = document.createElement("div");
  slide.className = "preview-slide";
  appendMiniHeader(slide, theme, navigation);
  appendPreviewTitle(slide, theme);
  appendPreviewList(slide, theme, bullet);
  appendPreviewBlock(slide, theme, block);
  appendFootline(slide, theme, navigation);

  replaceChildren(elements.slidePreview, [slide]);
}

function reviewGate() {
  refreshStatuses();
  renderSummary();
  if (!wizard.canGenerate(state.statuses)) {
    setBuildStatus("Review required before generation.");
    navigateToStep("review");
    return false;
  }
  return true;
}

async function generateTheme() {
  if (!reviewGate()) return;

  try {
    setBusy(true);
    setStatus("Saving");
    await saveDraft();
    setStatus("Generating");
    const result = await api("/api/generate", { method: "POST" });
    setBuildStatus(result);
    setStatus("Saved", "is-saved");
  } catch (error) {
    setBuildStatus(error.details || error.message);
    setStatus("Error", "is-error");
  } finally {
    setBusy(false);
    render();
  }
}

async function compileTheme() {
  if (!reviewGate()) return;

  try {
    setBusy(true);
    setStatus("Saving");
    await saveDraft();
    setStatus("Compiling");
    const result = await api("/api/compile", { method: "POST" });
    setBuildStatus(result);
    setStatus("Saved", "is-saved");
  } catch (error) {
    setBuildStatus(error.details || error.message);
    setStatus("Error", "is-error");
  } finally {
    setBusy(false);
    render();
  }
}

function render() {
  refreshStatuses();
  renderStepList();
  renderStepContent();
  renderSummary();
  renderPreview();
  updateActionStates();
}

function bindControls() {
  elements.backStep.addEventListener("click", () => {
    navigateToStep(wizard.previousStepId(currentStep().id));
  });

  elements.nextStep.addEventListener("click", () => {
    navigateToStep(wizard.nextStepId(currentStep().id));
  });

  elements.reviewGenerate.addEventListener("click", () => {
    generateTheme();
  });

  elements.compileTheme.addEventListener("click", () => {
    compileTheme();
  });

  window.addEventListener("popstate", () => {
    render();
  });
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
  const style = document.createElement("style");
  style.id = "previewFontFaces";
  const rules = [];

  for (const font of Object.values(registry.fonts || {})) {
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
  document.head.appendChild(style);
}

async function boot() {
  setBuildStatus("Loading options and theme...");
  const [registry, themeResult] = await Promise.all([api("/api/options"), api("/api/theme?validated=1")]);
  state.registry = registry;
  state.theme = clone(themeResult.theme);
  state.validationErrors = Array.isArray(themeResult.errors) ? themeResult.errors : [];
  syncBaseFromTheme();
  registerFontFaces(registry);
  bindControls();
  if (window.location.pathname === "/") {
    navigateToStep("start", { replace: true });
  } else {
    render();
  }
  setStatus("Idle");
  setBuildStatus("No build yet.");
}

boot().catch((error) => {
  setBuildStatus(error.details || error.message);
  setStatus("Error", "is-error");
});
