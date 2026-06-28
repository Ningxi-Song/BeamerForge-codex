(function initWizardState(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  root.BeamerForgeWizard = factory();
})(typeof globalThis !== "undefined" ? globalThis : window, function wizardFactory() {
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

  const STEP_BY_ID = Object.freeze(Object.fromEntries(STEPS.map((step) => [step.id, step])));
  const STEP_BY_PATH = Object.freeze(Object.fromEntries(STEPS.map((step) => [step.path, step])));

  const REQUIRED_OPTION_PATHS = Object.freeze({
    color: ["palettes", "colors.paletteId"],
    font: ["fonts", "fonts.body"],
    bullets: ["bullets", "bullets.style"],
    blocks: ["blocks", "blocks.style"],
    navigation: ["navigation", "navigation.style"],
    "title-page": ["titlePages", "titlePage.layout"]
  });

  const ERROR_STEP_PREFIXES = Object.freeze([
    ["identity.", "start"],
    ["foundation.", "start"],
    ["colors.", "color"],
    ["fonts.", "font"],
    ["bullets.", "bullets"],
    ["blocks.", "blocks"],
    ["navigation.", "navigation"],
    ["titlePage.", "title-page"],
    ["contentDefaults.", "review"]
  ]);

  function stepForPath(pathname) {
    return STEP_BY_PATH[pathname] || STEP_BY_PATH["/start"];
  }

  function indexForStep(stepId) {
    return Math.max(0, STEPS.findIndex((step) => step.id === stepId));
  }

  function nextStepId(stepId) {
    const index = indexForStep(stepId);
    return STEPS[Math.min(index + 1, STEPS.length - 1)].id;
  }

  function previousStepId(stepId) {
    const index = indexForStep(stepId);
    return STEPS[Math.max(index - 1, 0)].id;
  }

  function sectionForStep(stepId) {
    return STEP_BY_ID[stepId] ? STEP_BY_ID[stepId].section : null;
  }

  function getPathValue(object, path) {
    return path.split(".").reduce((value, part) => (value ? value[part] : undefined), object);
  }

  function stepForErrorPath(path) {
    const match = ERROR_STEP_PREFIXES.find(([prefix]) => path.startsWith(prefix));
    return match ? match[1] : "review";
  }

  function optionLabel(collection, id) {
    if (!collection || !id || !collection[id]) return "";
    return collection[id].label || id;
  }

  function labelForStep(stepId, theme, registry) {
    if (stepId === "start") return theme.identity?.name || "Default template";
    if (stepId === "review") return "Ready check";
    const requirement = REQUIRED_OPTION_PATHS[stepId];
    if (!requirement) return "";
    const [collectionName, fieldPath] = requirement;
    return optionLabel(registry[collectionName], getPathValue(theme, fieldPath));
  }

  function deriveStepStatuses(theme, registry, validationErrors = []) {
    const errorMap = new Map();
    for (const error of validationErrors) {
      const stepId = stepForErrorPath(error.path || "");
      if (!errorMap.has(stepId)) errorMap.set(stepId, []);
      errorMap.get(stepId).push(error.message || "Needs review");
    }

    return STEPS.map((step) => {
      const messages = errorMap.get(step.id) || [];
      const requirement = REQUIRED_OPTION_PATHS[step.id];
      if (requirement) {
        const [collectionName, fieldPath] = requirement;
        const id = getPathValue(theme, fieldPath);
        if (!registry[collectionName] || !registry[collectionName][id]) {
          messages.push(`${step.label} selection needs review`);
        }
      }

      return {
        id: step.id,
        path: step.path,
        label: step.label,
        selectedLabel: labelForStep(step.id, theme, registry),
        state: messages.length > 0 ? "needs-review" : "complete",
        messages
      };
    });
  }

  function canGenerate(statuses) {
    return statuses.every((status) => status.state === "complete");
  }

  return {
    STEPS,
    stepForPath,
    nextStepId,
    previousStepId,
    sectionForStep,
    deriveStepStatuses,
    canGenerate
  };
});
