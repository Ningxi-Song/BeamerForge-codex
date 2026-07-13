"use strict";

const wizard = window.BeamerForgeWizard;
const previewState = window.BeamerForgePreviewState;
const authoritativeState = window.BeamerForgeAuthoritativePreviewState;
const selectionState = window.BeamerForgeSelectionState;
const onboarding = window.BeamerForgeOnboarding;

const STEP_DESC = Object.freeze({
  welcome: "See how BeamerForge turns simple visual choices into a complete Beamer project.",
  start: "Start from the default BeamerForge template, then make one cumulative design decision per step.",
  color: "Choose the color palette that sets the slide surface, structure, accent, text, and alert colors.",
  font: "Choose the type family used for body text and titles.",
  bullets: "Choose the bullet marker style used in itemized content.",
  blocks: "Choose how Beamer blocks frame emphasized content.",
  navigation: "Choose whether slides use headers, footlines, and page numbers.",
  "title-page": "Choose the title slide layout.",
  "manual-review": "Review your design, then build it now or ask AI for an optional refinement.",
  "ai-customize": "Describe what you want changed. Your current design stays safe for comparison.",
  "ai-handoff": "The optional technical workflow is available under Advanced.",
  "ai-import": "Theme transfer is available under Advanced.",
  "ai-compare": "Compare the protected manual baseline with the validated AI draft.",
  "final-review": "Generate or compile the explicitly selected version."
});

const COLOR_SCHEMES = Object.freeze({
  complementary: { id: "complementary", label: "Complementary", desc: "Two colors 180° apart. Useful when the accent needs to stand out." },
  analogous: { id: "analogous", label: "Analogous", desc: "Neighboring colors on the wheel. Cohesive and calm for academic talks." },
  triadic: { id: "triadic", label: "Triadic", desc: "Three balanced colors. Good when sections need distinct identities." },
  split: { id: "split", label: "Split-Comp.", desc: "A base color plus two softened complements. High contrast with less tension." },
  monochrome: { id: "monochrome", label: "Monochrome", desc: "One hue with lightness changes. Restrained and formal." },
  tetradic: { id: "tetradic", label: "Tetradic", desc: "Four colors in two complementary pairs. Works for richer visual systems." }
});

const CUBE_GRID = 14;
const CUBE_HALF = 1;

const state = {
  registry: null, theme: null, resolvedDesign: null, validationErrors: [], previewValidationErrors: [], statuses: [], busy: false,
  vibe: "", directions: [], directionId: null,
  previewResolution: null, previewErrorActive: false, previewBuildStatusBeforeError: null, previewBuildErrorPresentation: null,
  baseColor: { r: 69, g: 105, b: 144 }, scheme: "complementary",
  savedPalettes: [], paletteCounter: 0,
  workflow: { hasManualBaseline: false, hasHandoff: false, hasValidAiDraft: false, selectedVersion: null, selectedThemeHash: null, cycleId: null, reviewRevision: null },
  aiBrief: "", manualReview: null, comparison: null, authoritativePreviews: { manual: null, ai: null, selected: null },
  manualPreviewSave: { savedInputKey: null, themeHash: null, pendingInputKey: null, promise: null },
  cube: { yaw: -0.72, pitch: -0.42, dragging: false, dragMoved: false, lx: 0, ly: 0 }
};

let cubeCells = [];
let cubeResizeBound = false;

const elements = {
  app: document.getElementById("wizardApp"),
  welcomeScreen: document.getElementById("welcomeScreen"),
  startDesigning: document.getElementById("startDesigning"),
  advancedToggle: document.getElementById("advancedToggle"),
  advancedPanel: document.getElementById("advancedPanel"),
  advancedAiTools: document.getElementById("advancedAiTools"),
  phaseProgress: document.getElementById("phaseProgress"),
  stepList: document.getElementById("stepList"),
  stepTitle: document.getElementById("stepTitle"),
  stepDesc: document.getElementById("stepDescription"),
  stepContent: document.getElementById("stepContent"),
  summaryList: document.getElementById("summaryList"),
  deliveryActions: document.getElementById("deliveryActions"),
  downloadProject: document.getElementById("downloadProject"),
  downloadPdf: document.getElementById("downloadPdf"),
  slidePreview: document.getElementById("slidePreview"),
  saveStatus: document.getElementById("saveStatus"),
  back: document.getElementById("backStep"),
  next: document.getElementById("nextStep"),
  reviewGenerate: document.getElementById("reviewGenerate"),
  compileTheme: document.getElementById("compileTheme"),
  buildStatus: document.getElementById("buildStatus"),
  authoritativePreview: document.getElementById("authoritativePreview"),
  authoritativeStatus: document.getElementById("authoritativeStatus"),
  retryPreview: document.getElementById("retryPreview"),
  refreshPreview: document.getElementById("refreshPreview")
};

async function sendAuthoritativeRequest(source, force, { themeHash }) {
  const result = await api("/api/preview/compile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source, force, expectedThemeHash: themeHash })
  });
  return authoritativeState.validateSnapshotResult(result, themeHash);
}

async function prepareAuthoritativeRequest(source, { route, themeHash }) {
  if (source !== "manual" || route !== "manual-review") return { themeHash };
  const inputKey = JSON.stringify(state.theme);
  const gate = state.manualPreviewSave;
  if (gate.savedInputKey === inputKey && gate.themeHash) return { themeHash: gate.themeHash };
  if (gate.pendingInputKey === inputKey && gate.promise) return gate.promise;
  gate.pendingInputKey = inputKey;
  gate.promise = (async () => {
    try {
      const saved = await api("/api/theme", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(state.theme)
      });
      state.workflow = selectionState.invalidateForManualMutation(state.workflow);
      state.comparison = null;
      const design = await requestResolvedDesign(saved.theme);
      const savedInputKey = JSON.stringify(saved.theme);
      if (JSON.stringify(state.theme) === inputKey) {
        state.theme = clone(saved.theme);
        state.resolvedDesign = design;
        state.validationErrors = [];
        state.previewValidationErrors = [];
      }
      gate.savedInputKey = savedInputKey;
      gate.themeHash = design.source.themeHash;
      return { themeHash: design.source.themeHash };
    } catch (error) {
      if (JSON.stringify(state.theme) === inputKey && Array.isArray(error.errors)) {
        state.validationErrors = error.errors;
        refreshStatuses();
      }
      throw error;
    } finally {
      if (gate.pendingInputKey === inputKey) {
        gate.pendingInputKey = null;
        gate.promise = null;
      }
    }
  })();
  return gate.promise;
}

const authoritativeController = authoritativeState.createAuthoritativePreviewState({
  beforeRequest: prepareAuthoritativeRequest,
  request: sendAuthoritativeRequest,
  onChange() { renderAuthoritativePreviews(); }
});
state.authoritativePreviews = authoritativeController.records;

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function replaceChildren(p, c) { p.replaceChildren(...c); }
function currentStep() { return wizard.stepForPath(window.location.pathname); }
function stepById(id) { return wizard.STEPS.find((s) => s.id === id) || wizard.STEPS[0]; }

function onboardingStarted() {
  return window.sessionStorage.getItem("beamerforge:onboarding-started") === "1";
}

function renderAppSurface() {
  const showWelcome = onboarding.shouldShow({ pathname: window.location.pathname, started: onboardingStarted() });
  elements.welcomeScreen.hidden = !showWelcome;
  elements.app.hidden = showWelcome;
  return showWelcome;
}

function beginDesigning() {
  const decision = onboarding.begin();
  window.sessionStorage.setItem("beamerforge:onboarding-started", decision.started ? "1" : "0");
  window.history.pushState({ stepId: "start" }, "", decision.nextPath);
  render();
}

function toggleAdvancedPanel() {
  const opening = elements.advancedPanel.hidden;
  elements.advancedPanel.hidden = !opening;
  elements.advancedToggle.setAttribute("aria-expanded", opening ? "true" : "false");
  elements.advancedToggle.textContent = opening ? "Close advanced" : "Advanced";
}

function navigateToStep(id, opts = {}) {
  const s = stepById(id);
  if (!wizard.canEnterStep(s.id, state.workflow)) return;
  if (opts.replace) window.history.replaceState({ stepId: s.id }, "", s.path);
  else window.history.pushState({ stepId: s.id }, "", s.path);
  render({ schedulePreview: opts.schedulePreview });
}

function selectedId(stepId) {
  const t = state.theme; if (!t) return "";
  const map = { color: () => t.colors.paletteId, font: () => t.fonts.body, bullets: () => t.bullets.style,
    blocks: () => t.blocks.style, navigation: () => t.navigation.style, "title-page": () => t.titlePage.layout };
  return (map[stepId] || (() => ""))();
}

function collectionFor(stepId) {
  const r = state.registry; if (!r) return {};
  const map = { color: "palettes", font: "fonts", bullets: "bullets", blocks: "blocks", navigation: "navigation", "title-page": "titlePages" };
  return r[map[stepId]] || {};
}

function errorStep(err) {
  const p = err?.path ? String(err.path) : "";
  if (p === "identity" || p.startsWith("identity.") || p === "foundation" || p.startsWith("foundation.")) return "start";
  if (p === "colors" || p.startsWith("colors.")) return "color";
  if (p === "fonts" || p.startsWith("fonts.")) return "font";
  if (p === "bullets" || p.startsWith("bullets.")) return "bullets";
  if (p === "blocks" || p.startsWith("blocks.")) return "blocks";
  if (p === "navigation" || p.startsWith("navigation.")) return "navigation";
  if (p === "titlePage" || p.startsWith("titlePage.")) return "title-page";
  return "manual-review";
}

function markManualMutation() {
  state.workflow = selectionState.invalidateForManualMutation(state.workflow);
  state.comparison = null;
  setBuildStatus("Design changed. Review the manual design and select a version again before generating.");
  if (currentStep().id === "final-review") window.history.replaceState({ stepId: "manual-review" }, "", "/manual-review");
}

function applyChoice(stepId, optId) {
  const coll = collectionFor(stepId);
  const opt = coll[optId]; if (!state.theme || !opt) return;
  const t = state.theme;
  if (stepId === "color") { t.colors.paletteId = opt.id; Object.assign(t.colors, opt.colors); syncBase(); }
  if (stepId === "font") { t.fonts.body = opt.id; t.fonts.title = opt.id; t.fonts.mode = opt.mode; }
  if (stepId === "bullets") t.bullets.style = opt.id;
  if (stepId === "blocks") t.blocks.style = opt.id;
  if (stepId === "navigation") t.navigation.style = opt.id;
  if (stepId === "title-page") t.titlePage.layout = opt.id;
  markManualMutation();
  state.validationErrors = state.validationErrors.filter((e) => errorStep(e) !== stepId);
  state.previewValidationErrors = state.previewValidationErrors.filter((e) => errorStep(e) !== stepId);
  setStatus("Unsaved"); render();
}

function refreshStatuses() {
  if (!state.theme || !state.registry) { state.statuses = []; return; }
  state.statuses = wizard.deriveStepStatuses(state.theme, state.registry, [...state.validationErrors, ...state.previewValidationErrors]);
}

async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok || body.ok === false) {
    const err = new Error(body.error || body.message || `Request failed: ${res.status}`);
    err.details = body; err.errors = Array.isArray(body.errors) ? body.errors : [];
    throw err;
  }
  return body;
}

async function requestResolvedDesign(theme) {
  return api("/api/design/resolve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(theme)
  });
}

function initializePreviewResolution() {
  state.previewResolution = previewState.createPreviewLifecycle({
    resolve: requestResolvedDesign,
    onSuccess(design, meta) {
      const recovery = previewState.applyPreviewSuccess(state, design, elements.buildStatus.textContent);
      if (recovery.recovered) {
        if (recovery.restoreBuildStatus !== null) setBuildStatus(recovery.restoreBuildStatus);
        setStatus("Preview current");
      }
      if (meta.context?.render !== false) render({ schedulePreview: false });
    },
    onError(error, meta) {
      const previewError = error.details || error.message;
      const previewErrorPresentation = buildStatusText(previewError);
      previewState.applyPreviewFailure(state, error, elements.buildStatus.textContent, previewErrorPresentation);
      setBuildStatus(previewError);
      setStatus("Preview error", "is-error");
      if (meta.context?.render !== false) render({ schedulePreview: false });
    }
  });
}

async function resolvePreviewDesign(theme, { render: shouldRender = true, inputKey = JSON.stringify(theme) } = {}) {
  return state.previewResolution.resolveNow(theme, inputKey, { render: shouldRender });
}

function schedulePreviewResolution() {
  if (!state.theme || !state.previewResolution) return;
  const inputKey = JSON.stringify(state.theme);
  const transition = state.previewResolution.schedule(clone(state.theme), inputKey, { render: true });
  if (transition === "reuse") {
    const recovery = previewState.applyCachedReuse(state, elements.buildStatus.textContent);
    if (recovery.restoreBuildStatus !== null) setBuildStatus(recovery.restoreBuildStatus);
    setStatus("Preview current");
  }
  return transition;
}

function setStatus(text, cls = "") {
  elements.saveStatus.className = cls ? `status ${cls}` : "status";
  elements.saveStatus.textContent = text;
}

function buildStatusText(v) { return typeof v === "string" ? v : JSON.stringify(v, null, 2); }
function setBuildStatus(v) {
  elements.buildStatus.textContent = buildStatusText(v);
  const status = v && typeof v === "object" ? v.status : null;
  const current = v && typeof v === "object"
    && v.selectedVersion === state.workflow.selectedVersion
    && v.themeHash === state.workflow.selectedThemeHash
    && v.cycleId === state.workflow.cycleId
    && v.reviewRevision === state.workflow.reviewRevision;
  const projectReady = current && v.ok === true && (status === "generated" || status === "compiled");
  const pdfReady = current && v.ok === true && status === "compiled";
  elements.deliveryActions.hidden = !projectReady;
  elements.downloadProject.hidden = !projectReady;
  elements.downloadPdf.hidden = !pdfReady;
}
function setBusy(b) { state.busy = b; updateActions(); }

function updateActions() {
  elements.back.disabled = state.busy || currentStep().id === "start";
  const step = currentStep();
  const nextId = wizard.nextStepId(step.id);
  elements.next.disabled = state.busy || (step.id === "start" && !state.directionId) || step.id === "final-review" || !wizard.canEnterStep(nextId, state.workflow);
  elements.reviewGenerate.disabled = state.busy || !selectionState.canBuild(state.workflow);
  elements.compileTheme.disabled = state.busy || !selectionState.canBuild(state.workflow);
}

async function saveDraft() {
  try {
    const r = await api("/api/theme", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(state.theme) });
    state.workflow = selectionState.invalidateForManualMutation(state.workflow);
    state.comparison = null;
    state.theme = clone(r.theme); state.validationErrors = []; state.previewValidationErrors = []; refreshStatuses();
    setStatus("Saved", "is-saved"); return r;
  } catch (err) {
    if (Array.isArray(err.errors) && err.errors.length > 0) { state.validationErrors = err.errors; refreshStatuses(); render(); }
    setStatus("Error", "is-error"); throw err;
  }
}

function optLabel(stepId, optId) {
  const opt = collectionFor(stepId)[optId]; return opt ? opt.label || opt.id : optId || "Not selected";
}

function renderStepList() {
  const active = currentStep();
  const byId = new Map(state.statuses.map((s) => [s.id, s]));
  const btns = wizard.STEPS.map((step) => {
    const st = byId.get(step.id);
    const btn = document.createElement("button"); btn.type = "button";
    btn.className = step.id === active.id ? "step-button is-active" : "step-button";
    btn.dataset.stepId = step.id; btn.dataset.state = st ? st.state : "pending";
    btn.setAttribute("aria-current", step.id === active.id ? "step" : "false");
    const title = document.createElement("span"); title.className = "step-button-title"; title.textContent = step.label;
    const meta = document.createElement("span"); meta.className = "step-button-meta";
    meta.textContent = st?.selectedLabel || st?.state || "";
    btn.append(title, meta); btn.addEventListener("click", () => navigateToStep(step.id));
    return btn;
  });
  replaceChildren(elements.stepList, btns);
}

function swatches(colors) {
  const wrap = document.createElement("span"); wrap.className = "color-swatches";
  for (const c of Object.values(colors || {})) {
    const s = document.createElement("span"); s.className = "swatch"; s.style.backgroundColor = c; s.title = c;
    wrap.appendChild(s);
  }
  return wrap;
}

function clampByte(v) { const n = Number.parseInt(v, 10); return Number.isNaN(n) ? 0 : Math.max(0, Math.min(255, n)); }
function rgbToHex(r, g, b) { return `#${[r, g, b].map((c) => clampByte(c).toString(16).padStart(2, "0")).join("").toUpperCase()}`; }

function normalizeHex(v) {
  let h = String(v || "").trim(); if (!h) return null;
  if (!h.startsWith("#")) h = `#${h}`;
  if (/^#[0-9A-Fa-f]{3}$/.test(h)) h = `#${h.slice(1).split("").map((c) => c + c).join("")}`;
  return /^#[0-9A-Fa-f]{6}$/.test(h) ? h.toUpperCase() : null;
}

function hexToRgb(hex) {
  const n = normalizeHex(hex); if (!n) return null;
  return { r: Number.parseInt(n.slice(1, 3), 16), g: Number.parseInt(n.slice(3, 5), 16), b: Number.parseInt(n.slice(5, 7), 16) };
}

function rgbToHsl(r, g, b) {
  const nr = clampByte(r) / 255, ng = clampByte(g) / 255, nb = clampByte(b) / 255;
  const max = Math.max(nr, ng, nb), min = Math.min(nr, ng, nb), l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === nr) h = (ng - nb) / d + (ng < nb ? 6 : 0);
  else if (max === ng) h = (nb - nr) / d + 2;
  else h = (nr - ng) / d + 4;
  return { h: h * 60, s: s * 100, l: l * 100 };
}

function hslToRgb(h, s, l) {
  const hue = ((h % 360) + 360) % 360, sat = Math.max(0, Math.min(100, s)) / 100, lit = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * lit - 1)) * sat, x = c * (1 - Math.abs((hue / 60) % 2 - 1)), m = lit - c / 2;
  let r = 0, g = 0, b = 0;
  if (hue < 60) { r = c; g = x; } else if (hue < 120) { r = x; g = c; }
  else if (hue < 180) { g = c; b = x; } else if (hue < 240) { g = x; b = c; }
  else if (hue < 300) { r = x; b = c; } else { r = c; b = x; }
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}

function genScheme(scheme, r, g, b) {
  const hsl = rgbToHsl(r, g, b);
  const colors = [{ hex: rgbToHex(r, g, b), r: clampByte(r), g: clampByte(g), b: clampByte(b) }];
  function add(h, s, l) { const rgb = hslToRgb(h, s, l); colors.push({ hex: rgbToHex(rgb.r, rgb.g, rgb.b), r: rgb.r, g: rgb.g, b: rgb.b }); }
  switch (scheme) {
    case "analogous": add(hsl.h - 30, hsl.s, hsl.l); add(hsl.h + 30, hsl.s, hsl.l); break;
    case "triadic": add(hsl.h + 120, hsl.s, hsl.l); add(hsl.h + 240, hsl.s, hsl.l); break;
    case "split": add(hsl.h + 150, hsl.s, hsl.l); add(hsl.h + 210, hsl.s, hsl.l); break;
    case "monochrome": add(hsl.h, hsl.s, Math.max(hsl.l - 24, 8)); add(hsl.h, hsl.s * 0.72, Math.min(hsl.l + 16, 88)); add(hsl.h, hsl.s * 0.36, Math.min(hsl.l + 34, 94)); break;
    case "tetradic": add(hsl.h + 90, hsl.s, hsl.l); add(hsl.h + 180, hsl.s, hsl.l); add(hsl.h + 270, hsl.s, hsl.l); break;
    default: add(hsl.h + 180, hsl.s, hsl.l);
  }
  return colors;
}

function lightenForBlock(c) { return rgbToHex(Math.round(c.r * 0.16 + 255 * 0.84), Math.round(c.g * 0.16 + 255 * 0.84), Math.round(c.b * 0.16 + 255 * 0.84)); }
function tintForSurface(c) { return rgbToHex(Math.round(c.r * 0.04 + 255 * 0.96), Math.round(c.g * 0.04 + 255 * 0.96), Math.round(c.b * 0.04 + 255 * 0.96)); }
function curHex() { return rgbToHex(state.baseColor.r, state.baseColor.g, state.baseColor.b); }
function curRgb() { return `rgb(${state.baseColor.r}, ${state.baseColor.g}, ${state.baseColor.b})`; }
function getSchemeColors() { return genScheme(state.scheme, state.baseColor.r, state.baseColor.g, state.baseColor.b); }
function syncBase() { const p = hexToRgb(state.theme?.colors?.primary); if (p) state.baseColor = p; }

function setBaseColor(rgb, opts = {}) {
  state.baseColor = { r: clampByte(rgb.r), g: clampByte(rgb.g), b: clampByte(rgb.b) };
  if (opts.apply === false) { if (opts.render !== false) render(); return; }
  applyGeneratedScheme({ render: opts.render });
}

function applyGeneratedScheme(opts = {}) {
  const colors = getSchemeColors();
  const primary = colors[0], accent = colors[1] || primary, alert = colors[2] || accent;
  const bg = tintForSurface(primary);
  Object.assign(state.theme.colors, { paletteId: "custom", background: bg, primary: primary.hex, accent: accent.hex, text: textColorFor(bg), blockBody: lightenForBlock(primary), alert: alert.hex });
  markManualMutation();
  state.validationErrors = state.validationErrors.filter((e) => errorStep(e) !== "color");
  state.previewValidationErrors = state.previewValidationErrors.filter((e) => errorStep(e) !== "color");
  setStatus("Unsaved");
  if (opts.render !== false) render();
}

function refreshColorEditorOutputs() {
  const preview = document.getElementById("baseColorPreview");
  if (preview) preview.style.backgroundColor = curHex();
  const picker = document.getElementById("baseColorPicker");
  if (picker && document.activeElement !== picker) picker.value = curHex();
  const hexIn = document.getElementById("baseHexInput");
  if (hexIn && document.activeElement !== hexIn) hexIn.value = curHex();
  const label = document.getElementById("previewColorLabel");
  if (label) label.textContent = curHex();
  for (const [ch, suf] of [["r", "R"], ["g", "G"], ["b", "B"]]) {
    const slider = document.getElementById(`baseRgbSlider${suf}`);
    const num = document.getElementById(`baseRgb${suf}`);
    if (slider && document.activeElement !== slider) slider.value = String(state.baseColor[ch]);
    if (num && document.activeElement !== num) num.value = String(state.baseColor[ch]);
  }
  const selId = selectedId("color");
  for (const btn of document.querySelectorAll(".option-card[data-option-id]")) {
    const sel = btn.getAttribute("data-option-id") === selId;
    btn.classList.toggle("is-selected", sel);
    btn.setAttribute("aria-pressed", String(sel));
  }
  const desc = document.getElementById("schemeDescription");
  if (desc) desc.textContent = (COLOR_SCHEMES[state.scheme] || COLOR_SCHEMES.complementary).desc;
  const schemeSw = document.getElementById("schemeSwatches");
  if (schemeSw) replaceChildren(schemeSw, Array.from(renderSchemeSwatches().childNodes));
  const palDisp = document.getElementById("paletteDisplay");
  if (palDisp) replaceChildren(palDisp, Array.from(renderPaletteDisplay().childNodes));
  syncCubeColor(); renderCube(); schedulePreviewResolution(); refreshStatuses(); renderStepList(); renderSummary(); renderPreview(); updateActions();
}

function copyText(text, msg) {
  if (!navigator.clipboard?.writeText) { setStatus("Copy unavailable", "is-error"); return; }
  navigator.clipboard.writeText(text).then(() => setStatus(msg, "is-saved")).catch(() => setStatus("Copy failed", "is-error"));
}

function copyAllColors() { copyText(getSchemeColors().map((c) => `${c.hex}  rgb(${c.r}, ${c.g}, ${c.b})`).join("\n"), "Palette copied"); }

function savePalette() {
  state.paletteCounter++;
  state.savedPalettes.push({ id: state.paletteCounter, name: `Palette ${state.paletteCounter}`, scheme: state.scheme, base: curHex(), colors: getSchemeColors() });
  setStatus("Palette saved", "is-saved"); render();
}

function loadPalette(id) { const p = state.savedPalettes.find((x) => x.id === id); if (!p) return; const rgb = hexToRgb(p.base); if (!rgb) return; state.scheme = p.scheme; setBaseColor(rgb); }
function deletePalette(id) { state.savedPalettes = state.savedPalettes.filter((x) => x.id !== id); setStatus("Palette deleted"); render(); }

function renderOptionCards(stepId) {
  const selId = selectedId(stepId);
  const cards = Object.values(collectionFor(stepId)).map((opt) => {
    const sel = opt.id === selId;
    const btn = document.createElement("button"); btn.type = "button";
    btn.className = sel ? "option-card is-selected" : "option-card";
    btn.dataset.optionId = opt.id; btn.setAttribute("aria-pressed", String(sel));
    const title = document.createElement("span"); title.className = "option-title"; title.textContent = opt.label || opt.id;
    const meta = document.createElement("span"); meta.className = "option-meta"; meta.textContent = opt.description || opt.mode || opt.id;
    btn.append(title, meta);
    if (stepId === "color") btn.appendChild(swatches(opt.colors));
    if (stepId === "font") { const sample = document.createElement("span"); sample.className = "font-sample"; sample.style.fontFamily = opt.cssFamily; sample.textContent = "A clear claim-driven slide"; btn.appendChild(sample); }
    if (stepId === "bullets") { const marker = document.createElement("span"); marker.className = "bullet-sample"; marker.style.setProperty("--bullet-marker", JSON.stringify(opt.cssMarker || ">")); const txt = document.createElement("span"); txt.textContent = `${opt.cssMarker || ">"} Main claim`; marker.appendChild(txt); btn.appendChild(marker); }
    btn.addEventListener("click", () => applyChoice(stepId, opt.id));
    return btn;
  });
  const grid = document.createElement("div"); grid.className = "option-grid"; replaceChildren(grid, cards); return grid;
}

function renderSummary() {
  const activeStepId = currentStep().id;
  const rows = state.statuses.map((status) => {
    const row = document.createElement("div"); row.className = "summary-row"; row.dataset.state = status.state;
    const text = document.createElement("div"); text.className = "summary-row-text";
    const label = document.createElement("strong"); label.textContent = status.label;
    const detail = document.createElement("span"); detail.textContent = status.messages.length > 0 ? status.messages.join("; ") : (status.selectedLabel || status.state);
    text.append(label, detail);
    const edit = document.createElement("button"); edit.type = "button"; edit.className = "secondary-button";
    edit.disabled = status.id === activeStepId;
    edit.textContent = status.id === activeStepId ? "Current" : "Edit";
    edit.setAttribute("aria-label", `Edit ${status.label}`);
    if (status.id !== activeStepId) {
      edit.addEventListener("click", () => navigateToStep(status.id));
    }
    row.append(text, edit); return row;
  });
  replaceChildren(elements.summaryList, rows);
}

function applyDirectionChoice(direction) {
  const palette = state.registry.palettes[direction.paletteId];
  const font = state.registry.fonts[direction.fontId];
  if (!palette || !font) return;
  state.theme.colors.paletteId = palette.id;
  Object.assign(state.theme.colors, clone(palette.colors));
  state.theme.fonts.body = font.id;
  state.theme.fonts.title = font.id;
  state.theme.fonts.mode = font.mode;
  state.directionId = direction.id;
  window.sessionStorage.setItem("beamerforge:direction", direction.id);
  markManualMutation();
  state.validationErrors = state.validationErrors.filter((error) => !["color", "font"].includes(errorStep(error)));
  state.previewValidationErrors = state.previewValidationErrors.filter((error) => !["color", "font"].includes(errorStep(error)));
  setStatus("Unsaved");
  render();
}

function renderStart() {
  const frag = document.createDocumentFragment();
  const intro = document.createElement("p");
  intro.textContent = "What should your presentation feel like? Describe it briefly, then choose the closest visual direction.";

  const vibeLabel = document.createElement("label");
  vibeLabel.className = "vibe-form";
  vibeLabel.htmlFor = "vibeInput";
  vibeLabel.textContent = "Your presentation vibe";
  const vibeInput = document.createElement("input");
  vibeInput.id = "vibeInput";
  vibeInput.type = "text";
  vibeInput.value = state.vibe;
  vibeInput.placeholder = "For example: calm, credible, and modern";
  vibeInput.addEventListener("input", () => {
    state.vibe = vibeInput.value;
    window.sessionStorage.setItem("beamerforge:vibe", state.vibe);
  });
  vibeLabel.appendChild(vibeInput);

  const prompt = document.createElement("h3");
  prompt.textContent = "Choose a starting direction";
  const grid = document.createElement("div");
  grid.className = "direction-grid";
  for (const direction of state.directions) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = direction.id === state.directionId ? "direction-card is-selected" : "direction-card";
    card.setAttribute("aria-pressed", direction.id === state.directionId ? "true" : "false");

    const label = document.createElement("strong");
    label.textContent = direction.label;
    const description = document.createElement("span");
    description.textContent = direction.description;
    const colors = document.createElement("span");
    colors.className = "direction-swatches";
    for (const color of direction.swatches) {
      const swatch = document.createElement("span");
      swatch.style.backgroundColor = color;
      swatch.setAttribute("aria-hidden", "true");
      colors.appendChild(swatch);
    }
    const fontSample = document.createElement("span");
    fontSample.className = "direction-font-sample";
    fontSample.textContent = state.registry.fonts[direction.fontId]?.label || direction.fontId;
    card.append(label, description, colors, fontSample);
    card.addEventListener("click", () => applyDirectionChoice(direction));
    grid.appendChild(card);
  }

  frag.append(intro, vibeLabel, prompt, grid);
  return frag;
}

function actionButton(label, handler, { secondary = false } = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  if (secondary) button.className = "secondary-button";
  button.addEventListener("click", () => { Promise.resolve(handler()).catch(() => {}); });
  return button;
}

function renderReview() {
  const frag = document.createDocumentFragment();
  const ready = wizard.canGenerate(state.statuses);
  const msg = document.createElement("p");
  msg.textContent = ready ? "Your design is ready. Build it now, or ask AI for an optional refinement first." : "Some design choices still need review.";
  frag.appendChild(msg);
  const issues = state.statuses.filter((s) => s.state !== "complete");
  if (issues.length > 0) {
    const list = document.createElement("ul");
    for (const s of issues) { const li = document.createElement("li"); li.textContent = `${s.label}: ${s.messages.join("; ") || "Needs review"}`; list.appendChild(li); }
    frag.appendChild(list);
  }
  if (ready) {
    const actions = document.createElement("div"); actions.className = "inline-actions";
    const refine = actionButton("Refine with AI", () => freezeManualBaseline());
    const build = actionButton("Build this design", buildManualDesign, { secondary: true });
    actions.append(refine, build); frag.appendChild(actions);
  }
  return frag;
}

async function buildManualDesign() {
  await freezeManualBaseline({ navigate: false });
  await selectFinalVersion("manual");
}

function renderPhaseProgress() {
  const stageFirstStep = {
    welcome: "welcome", direction: "start", style: "color", details: "bullets",
    review: "manual-review", ai: "ai-customize", build: "final-review"
  };
  const activeStage = wizard.visibleStageForStep(currentStep().id);
  const activeIndex = wizard.VISIBLE_STAGES.findIndex((stage) => stage.id === activeStage.id);
  const buttons = wizard.VISIBLE_STAGES.map((stage, index) => {
    const targetId = stageFirstStep[stage.id];
    const button = document.createElement("button");
    button.type = "button";
    button.className = index === activeIndex ? "stage-button is-active" : index < activeIndex ? "stage-button is-complete" : "stage-button";
    button.textContent = `${index + 1}. ${stage.label}`;
    button.setAttribute("aria-current", index === activeIndex ? "step" : "false");
    button.disabled = state.busy || !wizard.canEnterStep(targetId, state.workflow);
    button.addEventListener("click", () => navigateToStep(targetId));
    return button;
  });
  replaceChildren(elements.phaseProgress, buttons);
}

async function freezeManualBaseline(options = {}) {
  try {
    setBusy(true); await saveDraft();
    const result = await api("/api/manual-baseline", { method: "POST" });
    state.workflow.hasManualBaseline = true;
    state.workflow = selectionState.invalidateForManualMutation(state.workflow);
    state.manualReview = result;
    state.comparison = null;
    state.theme = clone(result.theme);
    if (options.navigate !== false) navigateToStep("ai-customize"); else render();
    return result;
  } catch (error) { setBuildStatus(error.details || error.message); throw error; }
  finally { setBusy(false); }
}

function renderAiCustomize() {
  const wrap = document.createElement("div"); wrap.className = "ai-form"; wrap.dataset.region = "ai-customize";
  const help = document.createElement("p"); help.textContent = "Describe the change you want. Your current design remains the protected baseline for comparison.";
  const brief = document.createElement("textarea"); brief.id = "ai-brief"; brief.rows = 7; brief.placeholder = "Example: Make this warmer, more editorial, and slightly more spacious."; brief.value = state.aiBrief;
  brief.addEventListener("input", () => { state.aiBrief = brief.value; });
  const note = document.createElement("p"); note.className = "step-description"; note.textContent = "Direct refinement will use this brief and keep the comparison inside BeamerForge.";
  wrap.append(help, fieldLabel("What should change?"), brief, note);
  return wrap;
}

function renderAdvancedAiTools() {
  const wrap = document.createElement("div"); wrap.className = "advanced-ai-form";
  const status = document.createElement("p"); status.id = "handoff-status";
  status.textContent = state.workflow.hasValidAiDraft ? "A validated draft is ready to compare." : state.workflow.hasHandoff ? "A handoff folder has been exported. You can import the completed theme below." : "Use this fallback when you want another agent to edit the theme outside BeamerForge.";
  const brief = document.createElement("textarea"); brief.id = "handoff-brief"; brief.rows = 5; brief.placeholder = "Describe the requested design change"; brief.value = state.aiBrief;
  brief.addEventListener("input", () => { state.aiBrief = brief.value; });
  const images = document.createElement("input"); images.id = "image-references"; images.type = "file"; images.accept = "image/*,.pdf,.svg"; images.multiple = true;
  const beamer = document.createElement("input"); beamer.id = "beamer-references"; beamer.type = "file"; beamer.multiple = true; beamer.setAttribute("webkitdirectory", "");
  const exportButton = document.createElement("button"); exportButton.type = "button"; exportButton.textContent = "Export handoff folder"; exportButton.addEventListener("click", exportAiHandoff);
  const draft = document.createElement("textarea"); draft.id = "aiDraftJson"; draft.rows = 9; draft.placeholder = "Paste the complete theme JSON returned by the other agent";
  const importButton = document.createElement("button"); importButton.type = "button"; importButton.className = "secondary-button"; importButton.textContent = "Import theme JSON"; importButton.addEventListener("click", importAiDraft);
  wrap.append(status, fieldLabel("Handoff brief"), brief, fieldLabel("Images or slide references"), images, fieldLabel("Beamer project folder"), beamer, exportButton, fieldLabel("Completed theme"), draft, importButton);
  return wrap;
}

async function exportAiHandoff() {
  try {
    setBusy(true);
    const form = new FormData(); form.set("brief", state.aiBrief);
    const files = [...(document.getElementById("image-references")?.files || []), ...(document.getElementById("beamer-references")?.files || [])];
    const relativePaths = [];
    for (const file of files) { form.append("references", file, file.name); relativePaths.push(file.webkitRelativePath || file.name); }
    form.set("relativePaths", JSON.stringify(relativePaths));
    const result = await api("/api/ai/handoff", { method: "POST", body: form });
    state.workflow.hasHandoff = true; setBuildStatus(result); navigateToStep("ai-handoff");
  } catch (error) { setBuildStatus(error.details || error.message); }
  finally { setBusy(false); }
}

function renderAiHandoff() {
  const wrap = document.createElement("div"); wrap.dataset.region = "ai-handoff";
  const text = document.createElement("p"); text.textContent = state.workflow.hasValidAiDraft ? "The validated draft is ready for comparison." : "The optional technical workflow is available in Advanced tools.";
  const next = actionButton(state.workflow.hasValidAiDraft ? "View comparison" : "Open Advanced", () => state.workflow.hasValidAiDraft ? navigateToStep("ai-compare") : toggleAdvancedPanel(), { secondary: true });
  wrap.append(text, next); return wrap;
}

function renderAiImport() {
  const wrap = document.createElement("div"); wrap.dataset.region = "ai-import";
  const text = document.createElement("p"); text.textContent = "Theme transfer is now grouped with the other technical controls.";
  const open = actionButton("Open Advanced", toggleAdvancedPanel, { secondary: true });
  wrap.append(text, open); return wrap;
}

async function importAiDraft() {
  try {
    setBusy(true); const raw = document.getElementById("aiDraftJson")?.value || "";
    let draft; try { draft = JSON.parse(raw); } catch { throw new Error("AI draft is not valid JSON"); }
    state.workflow = selectionState.invalidateForManualMutation(state.workflow);
    state.comparison = null;
    renderSummary();
    const result = await api("/api/ai/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) });
    state.workflow = selectionState.invalidateForReviewMutation(state.workflow, result);
    state.comparison = null;
    renderSummary();
    await loadAiComparison(); navigateToStep("ai-compare");
  } catch (error) { setBuildStatus(error.details || error.message); }
  finally { setBusy(false); }
}

async function loadAiComparison(rawComparison = null) {
  const comparison = rawComparison || await api("/api/ai/comparison");
  state.comparison = { ...comparison, manualDesign: null, draftDesign: null };
  try {
    const [manualDesign, draftDesign] = await Promise.all([
      requestResolvedDesign(comparison.manual),
      requestResolvedDesign(comparison.draft)
    ]);
    state.comparison = { ...comparison, manualDesign, draftDesign };
    state.workflow.hasValidAiDraft = true;
    return state.comparison;
  } catch (error) {
    state.workflow.hasValidAiDraft = false;
    setBuildStatus(error.details || error.message);
    throw error;
  }
}

function renderThemeChanges(changes) {
  const list = document.createElement("ul"); list.id = "ai-change-list"; list.className = "change-list";
  if (changes.length === 0) { const item = document.createElement("li"); item.textContent = "No effective design changes found."; list.appendChild(item); }
  for (const change of changes) { const item = document.createElement("li"); item.textContent = `${change.label}: ${change.before} → ${change.after}`; list.appendChild(item); }
  return list;
}

function requestAuthoritative(source, { force = false } = {}) {
  return force ? authoritativeController.refresh(source) : authoritativeController.retry(source);
}

function authoritativeSourceForStep() {
  if (currentStep().id === "manual-review") return "manual";
  if (currentStep().id === "final-review") return "selected";
  return null;
}

function setAuthoritativeStatus(element, record) {
  const status = record?.status || "idle";
  element.className = `preview-state is-${status}${record?.stale ? " is-stale" : ""}`;
  let text = "Waiting for a review route.";
  if (status === "pending") text = "Compiling authoritative preview…";
  if (status === "ready") text = `${record.cached ? "Cached" : "Fresh"} LaTeX preview.`;
  if (status === "failed") text = `LaTeX preview failed. ${record.message || "Compilation failed."}${record.excerpt ? ` ${record.excerpt}` : ""}`;
  if (status === "unavailable") text = `LaTeX compiler unavailable. ${record.message || "Install XeLaTeX or another supported compiler."}`;
  if (record?.stale) text += " Showing the last successful preview (stale).";
  element.textContent = text.slice(0, 4200);
}

function renderAuthoritativeRecord(container, statusElement, record, design) {
  setAuthoritativeStatus(statusElement, record);
  const url = authoritativeState.displayPdfUrl(record, window.location);
  const children = [];
  if (url) {
    const object = document.createElement("object");
    object.type = "application/pdf";
    object.data = url;
    authoritativeState.applyPdfAspectRatio(object, design);
    object.setAttribute("aria-label", "Authoritative compiled PDF preview");
    const fallback = document.createElement("p"); fallback.textContent = "The compiled PDF preview cannot be embedded in this browser. ";
    const link = document.createElement("a"); link.href = url; link.textContent = "Open the authoritative PDF."; fallback.appendChild(link);
    object.appendChild(fallback); children.push(object);
  }
  replaceChildren(container, children);
}

function renderAuthoritativePreview() {
  const source = authoritativeSourceForStep();
  elements.authoritativePreview.hidden = source === null || currentStep().id === "ai-compare";
  if (!source) return;
  const record = state.authoritativePreviews[source];
  const media = elements.authoritativePreview.querySelector(".authoritative-media");
  renderAuthoritativeRecord(media, elements.authoritativeStatus, record, state.resolvedDesign);
  elements.retryPreview.hidden = !["failed", "unavailable"].includes(record.status);
  elements.refreshPreview.hidden = record.status === "idle";
  elements.retryPreview.disabled = record.status === "pending";
  elements.refreshPreview.disabled = record.status === "pending";
}

function createComparisonLatexPreview(source, id) {
  const slot = document.createElement("section"); slot.id = id; slot.className = "authoritative-preview comparison-latex-preview";
  const title = document.createElement("h4"); title.textContent = "Authoritative LaTeX preview";
  const status = document.createElement("p"); status.className = "preview-state"; status.setAttribute("aria-live", "polite");
  const actions = document.createElement("div"); actions.className = "preview-actions";
  const retry = document.createElement("button"); retry.type = "button"; retry.className = "secondary-button"; retry.textContent = "Retry"; retry.addEventListener("click", () => requestAuthoritative(source));
  const refresh = document.createElement("button"); refresh.type = "button"; refresh.className = "secondary-button"; refresh.textContent = "Refresh"; refresh.addEventListener("click", () => requestAuthoritative(source, { force: true }));
  const media = document.createElement("div"); media.className = "authoritative-media";
  actions.append(retry, refresh); slot.append(title, status, actions, media); return slot;
}

function renderComparisonAuthoritative(source, id, design) {
  const slot = document.getElementById(id); if (!slot) return;
  const record = state.authoritativePreviews[source];
  renderAuthoritativeRecord(slot.querySelector(".authoritative-media"), slot.querySelector(".preview-state"), record, design);
  const [retry, refresh] = slot.querySelectorAll("button");
  retry.hidden = !["failed", "unavailable"].includes(record.status);
  retry.disabled = record.status === "pending";
  refresh.disabled = record.status === "pending";
}

function renderAuthoritativePreviews() {
  renderAuthoritativePreview();
  renderComparisonAuthoritative("manual", "manualLatexPreview", state.comparison?.manualDesign);
  renderComparisonAuthoritative("ai", "aiLatexPreview", state.comparison?.draftDesign);
}

function maybeRequestAuthoritativePreviews() {
  const step = currentStep().id;
  const hashes = {};
  if (step === "manual-review" && state.previewResolution?.state.successfulKey === JSON.stringify(state.theme)) hashes.manual = state.resolvedDesign?.source?.themeHash;
  if (step === "ai-compare") {
    hashes.manual = state.comparison?.manualDesign?.source?.themeHash;
    hashes.ai = state.comparison?.draftDesign?.source?.themeHash;
  }
  if (step === "final-review" && state.previewResolution?.state.successfulKey === JSON.stringify(state.theme)) hashes.selected = state.resolvedDesign?.source?.themeHash;
  authoritativeController.sync(step, hashes);
}

function renderAiCompare() {
  const wrap = document.createElement("div"); wrap.dataset.region = "ai-compare";
  if (!state.comparison) { const p = document.createElement("p"); p.textContent = "Loading comparison…"; wrap.appendChild(p); loadAiComparison().then(render).catch((error) => setBuildStatus(error.message)); return wrap; }
  if (!state.comparison.manualDesign || !state.comparison.draftDesign) { const p = document.createElement("p"); p.textContent = "Comparison previews could not be resolved."; wrap.appendChild(p); return wrap; }
  const grid = document.createElement("div"); grid.className = "comparison-grid";
  const manualCard = document.createElement("section"); const manualTitle = document.createElement("h3"); manualTitle.textContent = "Manual baseline"; const manualPreview = document.createElement("article"); manualPreview.id = "manual-comparison-preview"; manualPreview.className = "slide-preview compact-preview"; renderThemeInto(manualPreview, state.comparison.manualDesign); const manualLatexPreview = createComparisonLatexPreview("manual", "manualLatexPreview"); manualCard.append(manualTitle, manualPreview, manualLatexPreview);
  const aiCard = document.createElement("section"); const aiTitle = document.createElement("h3"); aiTitle.textContent = "AI customized draft"; const aiPreview = document.createElement("article"); aiPreview.id = "ai-comparison-preview"; aiPreview.className = "slide-preview compact-preview"; renderThemeInto(aiPreview, state.comparison.draftDesign); const aiLatexPreview = createComparisonLatexPreview("ai", "aiLatexPreview"); aiCard.append(aiTitle, aiPreview, aiLatexPreview);
  grid.append(manualCard, aiCard);
  const actions = document.createElement("div"); actions.className = "inline-actions";
  const accept = document.createElement("button"); accept.type = "button"; accept.textContent = "Accept AI Version"; accept.addEventListener("click", () => selectFinalVersion("ai"));
  const revise = document.createElement("button"); revise.type = "button"; revise.className = "secondary-button"; revise.textContent = "Continue Revising"; revise.addEventListener("click", () => navigateToStep("ai-handoff"));
  const manual = document.createElement("button"); manual.type = "button"; manual.className = "secondary-button"; manual.textContent = "Keep Manual Version"; manual.addEventListener("click", () => selectFinalVersion("manual"));
  actions.append(accept, revise, manual); wrap.append(grid, renderThemeChanges(state.comparison.changes), actions); return wrap;
}

async function selectFinalVersion(version) {
  try {
    setBusy(true); const endpoint = version === "ai" ? "/api/ai/accept" : "/api/ai/restore";
    const reviewed = version === "ai" ? state.comparison : (state.comparison || state.manualReview);
    const request = selectionState.reviewRequest(reviewed);
    if (!request) throw new Error("Review the current manual and AI versions again before selecting one.");
    const result = await api(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) });
    state.workflow = selectionState.applyServerSelection(state.workflow, result);
    state.theme = clone(result.theme); navigateToStep("final-review");
  } catch (error) { setBuildStatus(error.details || error.message); }
  finally { setBusy(false); }
}

function renderFinalReview() {
  const wrap = document.createElement("div"); wrap.dataset.region = "final-review";
  const p = document.createElement("p"); p.textContent = `Selected version: ${state.workflow.selectedVersion || "none"}. Use Generate Template or Compile PDF in the summary panel.`;
  const restore = document.createElement("button"); restore.type = "button"; restore.className = "secondary-button"; restore.textContent = "Restore Manual Baseline"; restore.addEventListener("click", () => selectFinalVersion("manual"));
  wrap.append(p, restore); return wrap;
}

function fieldLabel(text) { const l = document.createElement("span"); l.className = "field-label"; l.textContent = text; return l; }

function sliderRow(channel, labelText) {
  const val = state.baseColor[channel];
  const ids = { r: ["baseRgbSliderR", "baseRgbR"], g: ["baseRgbSliderG", "baseRgbG"], b: ["baseRgbSliderB", "baseRgbB"] };
  const [sliderId, numId] = ids[channel];
  const row = document.createElement("label"); row.className = "slider-row";
  const label = document.createElement("span"); label.className = `${channel}-label`; label.textContent = labelText;
  const slider = document.createElement("input"); slider.id = sliderId; slider.type = "range"; slider.min = "0"; slider.max = "255"; slider.value = String(val); slider.setAttribute("aria-label", `${labelText} color channel`);
  const num = document.createElement("input"); num.id = numId; num.type = "number"; num.min = "0"; num.max = "255"; num.value = String(val); num.setAttribute("aria-label", `${labelText} color value`);
  function update(v) {
    const nextValue = Number.parseInt(v, 10);
    if (Number.isNaN(nextValue)) return;
    setBaseColor({ ...state.baseColor, [channel]: nextValue }, { render: false });
    refreshColorEditorOutputs();
  }
  slider.addEventListener("input", (e) => update(e.target.value));
  num.addEventListener("input", (e) => update(e.target.value));
  row.append(label, slider, num); return row;
}

function renderBaseControls() {
  const sec = document.createElement("section"); sec.className = "custom-color-section"; sec.setAttribute("aria-label", "Base color controls");
  const preview = document.createElement("div"); preview.id = "baseColorPreview"; preview.className = "color-preview-box"; preview.style.backgroundColor = curHex();
  const picker = document.createElement("input"); picker.id = "baseColorPicker"; picker.type = "color"; picker.value = curHex(); picker.setAttribute("aria-label", "Base color");
  picker.addEventListener("input", (e) => { const rgb = hexToRgb(e.target.value); if (rgb) { setBaseColor(rgb, { render: false }); refreshColorEditorOutputs(); } });
  const label = document.createElement("span"); label.id = "previewColorLabel"; label.className = "color-label"; label.textContent = curHex();
  preview.append(picker, label);
  const hexRow = document.createElement("label"); hexRow.className = "hex-input-row"; hexRow.appendChild(fieldLabel("HEX"));
  const hexIn = document.createElement("input"); hexIn.id = "baseHexInput"; hexIn.value = curHex(); hexIn.setAttribute("aria-label", "Base HEX color");
  hexIn.addEventListener("input", (e) => { const rgb = hexToRgb(e.target.value); if (rgb) { setBaseColor(rgb, { render: false }); refreshColorEditorOutputs(); } });
  hexIn.addEventListener("change", (e) => { if (!hexToRgb(e.target.value)) { setStatus("Invalid HEX", "is-error"); render(); } });
  hexRow.appendChild(hexIn);
  const sliders = document.createElement("div"); sliders.className = "slider-group";
  sliders.append(sliderRow("r", "R"), sliderRow("g", "G"), sliderRow("b", "B"));
  const actions = document.createElement("div"); actions.className = "inline-actions";
  const copyHex = document.createElement("button"); copyHex.id = "copyHexColor"; copyHex.type = "button"; copyHex.className = "secondary-button"; copyHex.textContent = "Copy HEX";
  copyHex.addEventListener("click", () => copyText(curHex(), "HEX copied"));
  const copyRgb = document.createElement("button"); copyRgb.id = "copyRgbColor"; copyRgb.type = "button"; copyRgb.className = "secondary-button"; copyRgb.textContent = "Copy RGB";
  copyRgb.addEventListener("click", () => copyText(curRgb(), "RGB copied"));
  actions.append(copyHex, copyRgb);
  sec.append(preview, hexRow, sliders, actions); return sec;
}

function renderSchemeTabs() {
  const tabs = document.createElement("div"); tabs.id = "schemeTabs"; tabs.className = "scheme-tabs"; tabs.setAttribute("aria-label", "Color combination tabs");
  for (const s of Object.values(COLOR_SCHEMES)) {
    const btn = document.createElement("button"); btn.type = "button";
    btn.className = s.id === state.scheme ? "tab-button is-active" : "tab-button";
    btn.dataset.scheme = s.id; btn.textContent = s.label;
    btn.addEventListener("click", () => { state.scheme = s.id; applyGeneratedScheme(); });
    tabs.appendChild(btn);
  }
  return tabs;
}

function renderSchemeSwatches() {
  const wrap = document.createElement("div"); wrap.id = "schemeSwatches"; wrap.className = "scheme-swatches"; wrap.setAttribute("aria-label", "Generated color scheme");
  for (const c of getSchemeColors()) {
    const btn = document.createElement("button"); btn.type = "button"; btn.className = "scheme-swatch"; btn.title = `Use ${c.hex} as base color`;
    const chip = document.createElement("span"); chip.className = "scheme-swatch-chip"; chip.style.backgroundColor = c.hex;
    const lbl = document.createElement("span"); lbl.className = "scheme-swatch-label"; lbl.textContent = c.hex;
    btn.append(chip, lbl); btn.addEventListener("click", () => setBaseColor(c)); wrap.appendChild(btn);
  }
  return wrap;
}

function renderPaletteDisplay() {
  const disp = document.createElement("div"); disp.id = "paletteDisplay"; disp.className = "palette-display"; disp.setAttribute("aria-label", "Generated palette display");
  for (const c of getSchemeColors()) {
    const card = document.createElement("button"); card.type = "button"; card.className = "palette-color"; card.title = `Copy ${c.hex}`;
    const chip = document.createElement("span"); chip.className = "palette-color-chip"; chip.style.backgroundColor = c.hex;
    const info = document.createElement("span"); info.className = "palette-color-info";
    const hex = document.createElement("span"); hex.textContent = c.hex;
    const rgb = document.createElement("span"); rgb.textContent = `rgb(${c.r}, ${c.g}, ${c.b})`;
    info.append(hex, rgb); card.append(chip, info);
    card.addEventListener("click", () => copyText(`${c.hex}  rgb(${c.r}, ${c.g}, ${c.b})`, "Color copied"));
    disp.appendChild(card);
  }
  return disp;
}

function renderCubePanel() {
  const sec = document.createElement("section"); sec.className = "cube-panel"; sec.setAttribute("aria-label", "3D color picker");
  const stage = document.createElement("div"); stage.className = "cube-stage";
  const canvas = document.createElement("canvas"); canvas.id = "colorCubeCanvas"; canvas.setAttribute("aria-label", "3D RGB color cube"); canvas.setAttribute("role", "img"); canvas.tabIndex = 0;
  stage.appendChild(canvas);
  const sel = document.createElement("div"); sel.className = "cube-selected-info";
  const swatch = document.createElement("span"); swatch.id = "cubeSelectedSwatch"; swatch.className = "cube-selected-swatch";
  const vals = document.createElement("span"); vals.id = "cubeSelectedValues"; vals.className = "cube-selected-values";
  sel.append(swatch, vals); sec.append(stage, sel); return sec;
}

function cubeMetrics() {
  const canvas = document.getElementById("colorCubeCanvas"); if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(220, Math.round(rect.width || canvas.clientWidth || 260));
  const h = Math.max(220, Math.round(rect.height || canvas.clientHeight || 230));
  return { width: w, height: h, cx: w / 2, cy: h / 2, scale: Math.min(w, h) * 0.34, cam: 3.6 };
}

function rotateCube(pt) {
  const cy = Math.cos(state.cube.yaw), sy = Math.sin(state.cube.yaw);
  const cp = Math.cos(state.cube.pitch), sp = Math.sin(state.cube.pitch);
  const x1 = pt.x * cy - pt.z * sy, z1 = pt.x * sy + pt.z * cy;
  const y1 = pt.y * cp - z1 * sp, z2 = pt.y * sp + z1 * cp;
  return { x: x1, y: y1, z: z2 };
}

function projectCube(pt, m) {
  const r = rotateCube(pt);
  const p = m.cam / (m.cam - r.z);
  return { x: m.cx + r.x * m.scale * p, y: m.cy - r.y * m.scale * p, z: r.z };
}

function rgbForCubePt(pt) {
  return { r: clampByte(Math.round(((pt.x + CUBE_HALF) / 2) * 255)), g: clampByte(Math.round(((pt.y + CUBE_HALF) / 2) * 255)), b: clampByte(Math.round(((pt.z + CUBE_HALF) / 2) * 255)) };
}

function ptForColor(c) { return { x: (clampByte(c.r) / 255) * 2 - CUBE_HALF, y: (clampByte(c.g) / 255) * 2 - CUBE_HALF, z: (clampByte(c.b) / 255) * 2 - CUBE_HALF }; }
function facePt(face, u, v) { return face.axis === "x" ? { x: face.side, y: u, z: v } : face.axis === "y" ? { x: u, y: face.side, z: v } : { x: u, y: v, z: face.side }; }

function cubeCell(face, u0, u1, v0, v1, m) {
  const corners = [facePt(face, u0, v0), facePt(face, u1, v0), facePt(face, u1, v1), facePt(face, u0, v1)];
  const center = facePt(face, (u0 + u1) / 2, (v0 + v1) / 2);
  const proj = corners.map((pt) => projectCube(pt, m));
  const color = rgbForCubePt(center);
  return { polygon: proj.map((p) => ({ x: p.x, y: p.y })), depth: proj.reduce((t, p) => t + p.z, 0) / proj.length, color, hex: rgbToHex(color.r, color.g, color.b) };
}

function drawCell(ctx, cell) {
  const [first, ...rest] = cell.polygon;
  ctx.beginPath(); ctx.moveTo(first.x, first.y);
  for (const p of rest) ctx.lineTo(p.x, p.y);
  ctx.closePath(); ctx.fillStyle = cell.hex; ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.06)"; ctx.lineWidth = 0.45; ctx.stroke();
}

function drawEdges(ctx, m) {
  const verts = [{ x: -1, y: -1, z: -1 }, { x: 1, y: -1, z: -1 }, { x: 1, y: 1, z: -1 }, { x: -1, y: 1, z: -1 },
    { x: -1, y: -1, z: 1 }, { x: 1, y: -1, z: 1 }, { x: 1, y: 1, z: 1 }, { x: -1, y: 1, z: 1 }].map((pt) => projectCube(pt, m));
  const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  ctx.save(); ctx.strokeStyle = "rgba(255, 255, 255, 0.58)"; ctx.lineWidth = 1.2;
  for (const [a, b] of edges) { ctx.beginPath(); ctx.moveTo(verts[a].x, verts[a].y); ctx.lineTo(verts[b].x, verts[b].y); ctx.stroke(); }
  ctx.restore();
}

function rgbLum(c) { return (0.2126 * clampByte(c.r) + 0.7152 * clampByte(c.g) + 0.0722 * clampByte(c.b)) / 255; }

function drawMarker(ctx, m) {
  const marker = projectCube(ptForColor(state.baseColor), m);
  const light = rgbLum(state.baseColor) < 0.42;
  ctx.save(); ctx.beginPath(); ctx.arc(marker.x, marker.y, 7, 0, Math.PI * 2);
  ctx.fillStyle = curHex(); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = light ? "#FFFFFF" : "#111827"; ctx.stroke();
  ctx.beginPath(); ctx.arc(marker.x, marker.y, 11, 0, Math.PI * 2);
  ctx.lineWidth = 1; ctx.strokeStyle = light ? "rgba(255, 255, 255, 0.7)" : "rgba(17, 24, 39, 0.65)"; ctx.stroke();
  ctx.restore();
}

function renderCube() {
  const canvas = document.getElementById("colorCubeCanvas"); if (!canvas) return;
  const m = cubeMetrics(); if (!m) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(m.width * dpr); canvas.height = Math.round(m.height * dpr);
  const ctx = canvas.getContext("2d"); if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, m.width, m.height);
  const bg = ctx.createLinearGradient(0, 0, m.width, m.height);
  bg.addColorStop(0, "#111827"); bg.addColorStop(1, "#05070b");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, m.width, m.height);
  const faces = [{ axis: "x", side: -1 }, { axis: "x", side: 1 }, { axis: "y", side: -1 }, { axis: "y", side: 1 }, { axis: "z", side: -1 }, { axis: "z", side: 1 }];
  const cells = [];
  for (const face of faces) {
    for (let r = 0; r < CUBE_GRID; r++) {
      for (let c = 0; c < CUBE_GRID; c++) {
        const u0 = -CUBE_HALF + (c / CUBE_GRID) * 2, u1 = -CUBE_HALF + ((c + 1) / CUBE_GRID) * 2;
        const v0 = -CUBE_HALF + (r / CUBE_GRID) * 2, v1 = -CUBE_HALF + ((r + 1) / CUBE_GRID) * 2;
        cells.push(cubeCell(face, u0, u1, v0, v1, m));
      }
    }
  }
  cubeCells = cells.sort((a, b) => a.depth - b.depth);
  for (const cell of cubeCells) drawCell(ctx, cell);
  drawEdges(ctx, m); drawMarker(ctx, m);
}

function syncCubeColor() {
  const sw = document.getElementById("cubeSelectedSwatch"), vals = document.getElementById("cubeSelectedValues");
  if (!sw || !vals) return; sw.style.backgroundColor = curHex(); vals.textContent = `${curHex()} | ${curRgb()}`;
}

function polyContains(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i++) {
    const ci = poly[i], cj = poly[j];
    if ((ci.y > y !== cj.y > y) && (x < ((cj.x - ci.x) * (y - ci.y)) / (cj.y - ci.y) + ci.x)) inside = !inside;
  }
  return inside;
}

function selectCubeColor(x, y) {
  for (let i = cubeCells.length - 1; i >= 0; i--) {
    const cell = cubeCells[i];
    if (polyContains(cell.polygon, x, y)) { setBaseColor(cell.color, { render: false }); refreshColorEditorOutputs(); return true; }
  }
  return false;
}

function cubePos(e) { const canvas = document.getElementById("colorCubeCanvas"); const rect = canvas.getBoundingClientRect(); return { x: e.clientX - rect.left, y: e.clientY - rect.top }; }

function bindCube() {
  const canvas = document.getElementById("colorCubeCanvas"); if (!canvas || canvas.dataset.cubeBound === "true") return;
  canvas.dataset.cubeBound = "true";
  canvas.addEventListener("pointerdown", (e) => { const p = cubePos(e); state.cube.dragging = true; state.cube.dragMoved = false; state.cube.lx = p.x; state.cube.ly = p.y; canvas.setPointerCapture?.(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => {
    if (!state.cube.dragging) return;
    const p = cubePos(e), dx = p.x - state.cube.lx, dy = p.y - state.cube.ly;
    if (Math.abs(dx) + Math.abs(dy) > 2) state.cube.dragMoved = true;
    state.cube.yaw += dx * 0.012; state.cube.pitch = Math.max(-1.2, Math.min(1.2, state.cube.pitch - dy * 0.012));
    state.cube.lx = p.x; state.cube.ly = p.y; renderCube();
  });
  function finish(e) {
    if (!state.cube.dragging) return;
    const p = cubePos(e); state.cube.dragging = false; canvas.releasePointerCapture?.(e.pointerId);
    if (!state.cube.dragMoved) selectCubeColor(p.x, p.y);
  }
  canvas.addEventListener("pointerup", finish);
  canvas.addEventListener("pointercancel", () => { state.cube.dragging = false; });
}

function initCube() { bindCube(); syncCubeColor(); renderCube(); if (!cubeResizeBound) { cubeResizeBound = true; window.addEventListener("resize", renderCube); } }

function renderSavedPalettes() {
  const sec = document.createElement("section"); sec.className = "saved-section"; sec.setAttribute("aria-label", "Saved palettes");
  sec.appendChild(fieldLabel("Saved Palettes"));
  const list = document.createElement("div"); list.id = "savedPalettes"; list.className = "saved-palettes";
  if (state.savedPalettes.length === 0) { const empty = document.createElement("p"); empty.className = "saved-empty"; empty.textContent = "No saved palettes yet."; list.appendChild(empty); }
  else {
    for (const pal of state.savedPalettes.slice().reverse()) {
      const item = document.createElement("div"); item.className = "saved-item";
      const main = document.createElement("div"); main.className = "saved-item-main";
      const name = document.createElement("span"); name.className = "saved-name"; name.textContent = pal.name;
      const meta = document.createElement("span"); meta.className = "saved-meta"; meta.textContent = `${pal.base} | ${COLOR_SCHEMES[pal.scheme]?.label || pal.scheme}`;
      const mini = document.createElement("div"); mini.className = "mini-swatches";
      for (const c of pal.colors) { const sw = document.createElement("span"); sw.className = "mini-swatch"; sw.style.backgroundColor = c.hex; sw.title = c.hex; mini.appendChild(sw); }
      main.append(name, meta, mini);
      const actions = document.createElement("div"); actions.className = "saved-actions";
      const load = document.createElement("button"); load.type = "button"; load.className = "secondary-button"; load.textContent = "Load"; load.addEventListener("click", () => loadPalette(pal.id));
      const del = document.createElement("button"); del.type = "button"; del.className = "secondary-button"; del.textContent = "Delete"; del.addEventListener("click", () => deletePalette(pal.id));
      actions.append(load, del); item.append(main, actions); list.appendChild(item);
    }
  }
  sec.appendChild(list); return sec;
}

function renderColorStepContent() {
  const wrap = document.createElement("div"); wrap.className = "color-step-workbench";
  const editor = document.createElement("section"); editor.className = "color-editor"; editor.setAttribute("aria-label", "Custom color picker");
  const header = document.createElement("div"); header.className = "color-editor-header";
  const title = document.createElement("span"); title.textContent = "Custom colors";
  const apply = document.createElement("button"); apply.id = "applySchemeColors"; apply.type = "button"; apply.className = "secondary-button"; apply.textContent = "Apply Scheme";
  apply.addEventListener("click", () => applyGeneratedScheme());
  header.append(title, apply);
  const scheme = COLOR_SCHEMES[state.scheme] || COLOR_SCHEMES.complementary;
  const desc = document.createElement("p"); desc.id = "schemeDescription"; desc.className = "scheme-description"; desc.textContent = scheme.desc;
  const actions = document.createElement("div"); actions.className = "inline-actions";
  const copyAll = document.createElement("button"); copyAll.id = "copyAllColors"; copyAll.type = "button"; copyAll.className = "secondary-button"; copyAll.textContent = "Copy All";
  copyAll.addEventListener("click", copyAllColors);
  const save = document.createElement("button"); save.id = "savePalette"; save.type = "button"; save.className = "secondary-button"; save.textContent = "Save Palette";
  save.addEventListener("click", savePalette);
  actions.append(copyAll, save);
  editor.append(header, renderBaseControls(), renderCubePanel(), renderSchemeTabs(), desc, renderSchemeSwatches(), renderPaletteDisplay(), actions, renderSavedPalettes());
  wrap.appendChild(editor); return wrap;
}

function renderStepContent() {
  const step = currentStep();
  elements.stepTitle.textContent = step.label;
  elements.stepDesc.textContent = STEP_DESC[step.id] || "";
  if (step.id === "start") { replaceChildren(elements.stepContent, [renderStart()]); return; }
  if (step.id === "manual-review") { replaceChildren(elements.stepContent, [renderReview()]); return; }
  if (step.id === "ai-customize") { replaceChildren(elements.stepContent, [renderAiCustomize()]); return; }
  if (step.id === "ai-handoff") { replaceChildren(elements.stepContent, [renderAiHandoff()]); return; }
  if (step.id === "ai-import") { replaceChildren(elements.stepContent, [renderAiImport()]); return; }
  if (step.id === "ai-compare") { replaceChildren(elements.stepContent, [renderAiCompare()]); return; }
  if (step.id === "final-review") { replaceChildren(elements.stepContent, [renderFinalReview()]); return; }
  if (step.id === "color") { replaceChildren(elements.stepContent, [renderColorStepContent()]); initCube(); return; }
  replaceChildren(elements.stepContent, [renderOptionCards(step.id)]);
}

function textColorFor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return "#111827";
  const v = m[1], r = Number.parseInt(v.slice(0, 2), 16), g = Number.parseInt(v.slice(2, 4), 16), b = Number.parseInt(v.slice(4, 6), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.56 ? "#111827" : "#FFFFFF";
}

function appendHeader(parent, design) {
  if (!design.components.navigation.header) return;
  const h = document.createElement("div"); h.className = "preview-header"; h.style.borderColor = design.colors.primary; h.textContent = "Section 1";
  parent.appendChild(h);
}

function appendTitle(parent, design) {
  const t = document.createElement("h3"); t.className = "preview-title"; t.style.color = design.colors.primary; t.style.fontFamily = design.typography.title.cssFamily; t.textContent = design.content.sampleTitle;
  parent.appendChild(t);
}

function appendList(parent, design) {
  const list = document.createElement("ul"); list.className = "preview-list"; list.style.setProperty("--bullet-marker", JSON.stringify(design.components.bullet.marker));
  for (const text of design.content.bullets) { const li = document.createElement("li"); li.textContent = text; list.appendChild(li); }
  parent.appendChild(list);
}

function appendBlock(parent, design) {
  const wrap = document.createElement("div"); wrap.className = "preview-block";
  wrap.style.borderRadius = design.components.block.cssRadius; wrap.style.boxShadow = design.components.block.cssShadow;
  const title = document.createElement("div"); title.className = "preview-block-title"; title.style.backgroundColor = design.colors.primary; title.style.color = design.colors.primaryText; title.textContent = design.content.blockTitle;
  const body = document.createElement("div"); body.className = "preview-block-body"; body.style.backgroundColor = design.colors.blockBody; body.textContent = design.content.blockBody;
  wrap.append(title, body); parent.appendChild(wrap);
}

function appendFootline(parent, design) {
  if (!design.components.navigation.footline) return;
  const fl = document.createElement("div"); fl.className = "preview-footline"; fl.style.color = design.colors.primary; fl.textContent = `${design.identity.name} | 1 / 3`;
  parent.appendChild(fl);
}

function appendCornerLogo(parent, design) {
  const logo = design.components.cornerLogo;
  const previewUrl = previewState.trustedPreviewUrl(logo.previewUrl, window.location);
  if (logo.vectorId == null || !previewUrl) return;
  const image = document.createElement("img");
  image.className = `preview-corner-logo is-${logo.position}`;
  image.src = previewUrl;
  image.alt = `${logo.label} corner logo`;
  image.style.width = `${logo.widthFraction * 100}%`;
  image.dataset.scope = logo.scope;
  parent.appendChild(image);
}

function renderThemeInto(container, design) {
  if (!design) return;
  previewState.applyResolvedCanvas(container, design);
  container.style.backgroundColor = design.colors.background; container.style.color = design.colors.text;
  container.style.fontFamily = design.typography.body.cssFamily;
  container.style.setProperty("--accent-color", design.colors.accent);
  container.style.setProperty("--primary-color", design.colors.primary);
  container.style.setProperty("--bullet-marker", JSON.stringify(design.components.bullet.marker));
  const slide = document.createElement("div"); slide.className = "preview-slide"; appendCornerLogo(slide, design);
  appendHeader(slide, design); appendTitle(slide, design); appendList(slide, design); appendBlock(slide, design); appendFootline(slide, design);
  replaceChildren(container, [slide]);
}

function previewDesignForStep() {
  if (currentStep().id === "ai-handoff" && state.workflow.hasValidAiDraft && state.comparison?.draftDesign) return state.comparison.draftDesign;
  return state.resolvedDesign;
}

function renderPreview() {
  renderThemeInto(elements.slidePreview, previewDesignForStep());
}

function reviewGate() {
  refreshStatuses(); renderSummary();
  if (!wizard.canGenerate(state.statuses)) { setBuildStatus("Review required before generation."); navigateToStep("manual-review"); return false; }
  if (!selectionState.canBuild(state.workflow)) { setBuildStatus("Choose the manual or AI version again before generation."); return false; }
  return true;
}

async function generateTheme() {
  if (!reviewGate()) return;
  try { setBusy(true); setStatus("Generating"); const r = await api("/api/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(selectionState.buildRequest(state.workflow)) }); setBuildStatus(r); setStatus("Saved", "is-saved"); }
  catch (err) { setBuildStatus(err.details || err.message); setStatus("Error", "is-error"); }
  finally { setBusy(false); render(); }
}

async function compileTheme() {
  if (!reviewGate()) return;
  try { setBusy(true); setStatus("Compiling"); const r = await api("/api/compile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(selectionState.buildRequest(state.workflow)) }); setBuildStatus(r); setStatus("Saved", "is-saved"); }
  catch (err) { setBuildStatus(err.details || err.message); setStatus("Error", "is-error"); }
  finally { setBusy(false); render(); }
}

function render({ schedulePreview = true } = {}) { if (renderAppSurface()) return; if (schedulePreview !== false) schedulePreviewResolution(); refreshStatuses(); renderPhaseProgress(); renderStepList(); replaceChildren(elements.advancedAiTools, [renderAdvancedAiTools()]); renderStepContent(); renderSummary(); renderPreview(); renderAuthoritativePreviews(); updateActions(); maybeRequestAuthoritativePreviews(); }

function bindControls() {
  elements.startDesigning.addEventListener("click", beginDesigning);
  elements.advancedToggle.addEventListener("click", toggleAdvancedPanel);
  elements.back.addEventListener("click", () => navigateToStep(wizard.previousStepId(currentStep().id)));
  elements.next.addEventListener("click", () => navigateToStep(wizard.nextStepId(currentStep().id)));
  elements.reviewGenerate.addEventListener("click", generateTheme);
  elements.compileTheme.addEventListener("click", compileTheme);
  elements.retryPreview.addEventListener("click", () => { const source = authoritativeSourceForStep(); if (source) requestAuthoritative(source); });
  elements.refreshPreview.addEventListener("click", () => { const source = authoritativeSourceForStep(); if (source) requestAuthoritative(source, { force: true }); });
  window.addEventListener("popstate", render);
}

function cssStr(v) { return String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"'); }
function assetUrl(a) { return `/assets/${String(a).split(/[\\/]+/).map(encodeURIComponent).join("/")}`; }

function registerFontFaces(reg) {
  const style = document.createElement("style"); style.id = "previewFontFaces"; const rules = [];
  for (const font of Object.values(reg.fonts || {})) {
    if (!Array.isArray(font.assets) || font.assets.length === 0) continue;
    const regAsset = font.assets[0], bold = font.assets.find((a) => /bold/i.test(a)) || regAsset;
    rules.push(`@font-face { font-family: "${cssStr(font.label)}"; src: url("${assetUrl(regAsset)}") format("truetype"); font-weight: 400; font-style: normal; font-display: swap; }`);
    rules.push(`@font-face { font-family: "${cssStr(font.label)}"; src: url("${assetUrl(bold)}") format("truetype"); font-weight: 700; font-style: normal; font-display: swap; }`);
  }
  style.textContent = rules.join("\n"); document.head.appendChild(style);
}

async function boot() {
  setBuildStatus("Loading options and theme...");
  let comparisonError = null;
  const [reg, themeResult, directionsResult] = await Promise.all([
    api("/api/options"),
    api("/api/theme?validated=1"),
    api("/api/directions")
  ]);
  state.registry = reg; state.theme = clone(themeResult.theme);
  state.directions = directionsResult.directions;
  state.vibe = window.sessionStorage.getItem("beamerforge:vibe") || "";
  state.directionId = window.sessionStorage.getItem("beamerforge:direction") || null;
  state.workflow = selectionState.applyPersistedSelection(state.workflow, themeResult.selection);
  state.validationErrors = Array.isArray(themeResult.errors) ? themeResult.errors : [];
  initializePreviewResolution();
  const baselineResponse = await fetch("/api/manual-baseline");
  state.workflow.hasManualBaseline = baselineResponse.ok;
  if (baselineResponse.ok) state.manualReview = await baselineResponse.json();
  const handoffResponse = await fetch("/api/ai/handoff");
  state.workflow.hasHandoff = handoffResponse.ok;
  const comparisonResponse = await fetch("/api/ai/comparison");
  if (comparisonResponse.ok) {
    const comparison = await comparisonResponse.json();
    if (selectionState.isComparisonCurrent(themeResult.cycleId, themeResult.themeHash, comparison)) {
      try { await loadAiComparison(comparison); }
      catch (error) { comparisonError = error; }
    }
  }
  const initialInputKey = JSON.stringify(state.theme);
  const initialDesign = await resolvePreviewDesign(clone(state.theme), { render: false, inputKey: initialInputKey });
  syncBase(); registerFontFaces(reg); bindControls();
  if (window.location.pathname === "/") navigateToStep(onboardingStarted() ? "start" : "welcome", { replace: true, schedulePreview: false });
  else if (window.location.pathname === "/final-review" && !selectionState.canBuild(state.workflow)) navigateToStep("manual-review", { replace: true, schedulePreview: false });
  else render({ schedulePreview: false });
  if (initialDesign) setStatus("Idle");
  if (initialDesign && !comparisonError) setBuildStatus("No build yet.");
}

boot().catch((err) => { setBuildStatus(err.details || err.message); setStatus("Error", "is-error"); });
