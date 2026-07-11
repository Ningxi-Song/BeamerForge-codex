(function init(root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); return; }
  root.BeamerForgeWizard = factory();
})(typeof globalThis !== "undefined" ? globalThis : window, function wizardFactory() {
  "use strict";

  const STEPS = Object.freeze([
    { id: "start", path: "/start", label: "Default Template", section: null },
    { id: "color", path: "/color", label: "Color", section: "colors" },
    { id: "font", path: "/font", label: "Font", section: "fonts" },
    { id: "bullets", path: "/bullets", label: "Bullets", section: "bullets" },
    { id: "blocks", path: "/blocks", label: "Blocks", section: "blocks" },
    { id: "navigation", path: "/navigation", label: "Navigation", section: "navigation" },
    { id: "title-page", path: "/title-page", label: "Title Page", section: "titlePage" },
    { id: "review", path: "/review", label: "Review & Generate", section: null }
  ]);

  const BY_ID = Object.freeze(Object.fromEntries(STEPS.map((s) => [s.id, s])));
  const BY_PATH = Object.freeze(Object.fromEntries(STEPS.map((s) => [s.path, s])));

  const REQUIRED = Object.freeze({
    color: [["palettes", "colors.paletteId"]],
    font: [["fonts", "fonts.body"], ["fonts", "fonts.title"]],
    bullets: [["bullets", "bullets.style"]],
    blocks: [["blocks", "blocks.style"]],
    navigation: [["navigation", "navigation.style"]],
    "title-page": [["titlePages", "titlePage.layout"]]
  });

  const ERROR_MAP = Object.freeze([
    ["identity", "start"], ["foundation", "start"], ["colors", "color"],
    ["fonts", "font"], ["bullets", "bullets"], ["blocks", "blocks"],
    ["navigation", "navigation"], ["titlePage", "title-page"], ["contentDefaults", "review"]
  ]);

  function get(obj, p) { return p.split(".").reduce((v, k) => (v ? v[k] : undefined), obj); }

  function stepForPath(path) { return BY_PATH[path] || STEPS[0]; }
  function indexOf(id) { return Math.max(0, STEPS.findIndex((s) => s.id === id)); }
  function nextStepId(id) { return STEPS[Math.min(indexOf(id) + 1, STEPS.length - 1)].id; }
  function previousStepId(id) { return STEPS[Math.max(indexOf(id) - 1, 0)].id; }
  function sectionForStep(id) { return BY_ID[id] ? BY_ID[id].section : null; }

  function stepForError(errorPath) {
    const p = String(errorPath || "");
    const m = ERROR_MAP.find(([prefix]) => p === prefix || p.startsWith(`${prefix}.`));
    return m ? m[1] : "review";
  }

  function optionLabel(collection, id) {
    if (!collection || !id || !collection[id]) return "";
    return collection[id].label || id;
  }

  function labelForStep(stepId, theme, registry) {
    if (stepId === "start") return theme.identity?.name || "Default template";
    if (stepId === "review") return "Ready check";
    const req = REQUIRED[stepId];
    if (!req) return "";
    const [coll, field] = req[0];
    return optionLabel(registry[coll], get(theme, field));
  }

  function deriveStepStatuses(theme, registry, errors = []) {
    const errMap = new Map();
    for (const e of errors) {
      const sid = stepForError(e.path || "");
      if (!errMap.has(sid)) errMap.set(sid, []);
      errMap.get(sid).push(e.message || "Needs review");
    }

    return STEPS.map((step) => {
      const msgs = errMap.get(step.id) || [];
      const req = REQUIRED[step.id] || [];
      for (const [coll, field] of req) {
        const id = get(theme, field);
        if (!registry[coll] || !registry[coll][id]) msgs.push(`${step.label} selection needs review`);
      }
      return {
        id: step.id,
        path: step.path,
        label: step.label,
        selectedLabel: labelForStep(step.id, theme, registry),
        state: msgs.length > 0 ? "needs-review" : "complete",
        messages: msgs
      };
    });
  }

  function canGenerate(statuses) {
    if (!Array.isArray(statuses)) return false;
    const map = new Map(statuses.map((s) => [s && s.id, s]));
    return STEPS.every((step) => map.get(step.id)?.state === "complete");
  }

  return { STEPS, stepForPath, nextStepId, previousStepId, sectionForStep, deriveStepStatuses, canGenerate };
});
