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

const state = {
  registry: null,
  theme: null,
  validationErrors: [],
  statuses: [],
  busy: false
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
  const canGenerate = wizard.canGenerate(state.statuses);
  elements.backStep.disabled = isBusy || currentStep().id === "start";
  elements.nextStep.disabled = isBusy || currentStep().id === "review";
  elements.reviewGenerate.disabled = isBusy || !canGenerate;
  elements.compileTheme.disabled = isBusy;
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

async function generateTheme() {
  refreshStatuses();
  renderSummary();
  if (!wizard.canGenerate(state.statuses)) {
    setBuildStatus("Review required before generation.");
    navigateToStep("review");
    return;
  }

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

  const step = currentStep();
  elements.backStep.disabled = state.busy || step.id === "start";
  elements.nextStep.disabled = state.busy || step.id === "review";
  elements.reviewGenerate.disabled = state.busy || !wizard.canGenerate(state.statuses);
  elements.compileTheme.disabled = state.busy;
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
  const [registry, theme] = await Promise.all([api("/api/options"), api("/api/theme")]);
  state.registry = registry;
  state.theme = clone(theme);
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
