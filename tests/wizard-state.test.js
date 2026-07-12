const test = require("node:test");
const assert = require("node:assert/strict");
const wizard = require("../workbench/public/wizard-state");
const { DEFAULT_THEME } = require("../schema/theme-schema");
const { getRegistry } = require("../registry/options");

test("defines the cumulative wizard route order", () => {
  assert.deepEqual(
    wizard.STEPS.map((step) => step.path),
    [
      "/start", "/color", "/font", "/bullets", "/blocks", "/navigation", "/title-page",
      "/manual-review", "/ai-customize", "/ai-handoff", "/ai-import", "/ai-compare", "/final-review"
    ]
  );
  assert.equal(wizard.stepForPath("/font").id, "font");
  assert.equal(wizard.nextStepId("font"), "bullets");
  assert.equal(wizard.previousStepId("font"), "color");
});

test("maps each decision step to one theme section", () => {
  assert.equal(wizard.sectionForStep("color"), "colors");
  assert.equal(wizard.sectionForStep("font"), "fonts");
  assert.equal(wizard.sectionForStep("bullets"), "bullets");
  assert.equal(wizard.sectionForStep("blocks"), "blocks");
  assert.equal(wizard.sectionForStep("navigation"), "navigation");
  assert.equal(wizard.sectionForStep("title-page"), "titlePage");
  assert.equal(wizard.sectionForStep("manual-review"), null);
});

test("marks default theme steps complete", () => {
  const statuses = wizard.deriveStepStatuses(DEFAULT_THEME, getRegistry());
  assert.equal(statuses.every((status) => status.state === "complete"), true);
});

test("flags invalid later choices without clearing them", () => {
  const theme = JSON.parse(JSON.stringify(DEFAULT_THEME));
  theme.bullets.style = "missing-bullet";
  const statuses = wizard.deriveStepStatuses(theme, getRegistry());
  assert.equal(theme.bullets.style, "missing-bullet");
  assert.equal(statuses.find((status) => status.id === "bullets").state, "needs-review");
  assert.equal(wizard.canGenerate(statuses), false);
});

test("flags invalid title font choices without clearing them", () => {
  const theme = JSON.parse(JSON.stringify(DEFAULT_THEME));
  theme.fonts.title = "missing-title-font";
  const statuses = wizard.deriveStepStatuses(theme, getRegistry());
  assert.equal(theme.fonts.title, "missing-title-font");
  assert.equal(statuses.find((status) => status.id === "font").state, "needs-review");
  assert.equal(wizard.canGenerate(statuses), false);
});

test("blocks generation when statuses are empty", () => {
  assert.equal(wizard.canGenerate([]), false);
});

test("blocks generation when statuses are partial", () => {
  const statuses = wizard.deriveStepStatuses(DEFAULT_THEME, getRegistry()).filter((status) => status.id !== "title-page");
  assert.equal(wizard.canGenerate(statuses), false);
});

test("maps root validation error paths to their wizard steps", () => {
  const statuses = wizard.deriveStepStatuses(DEFAULT_THEME, getRegistry(), [
    { path: "colors", message: "colors must be an object" },
    { path: "identity", message: "identity must be an object" }
  ]);
  assert.equal(statuses.find((status) => status.id === "color").state, "needs-review");
  assert.equal(statuses.find((status) => status.id === "start").state, "needs-review");
});

test("maps unknown validation error paths to review", () => {
  const statuses = wizard.deriveStepStatuses(DEFAULT_THEME, getRegistry(), [
    { path: "unknown.section", message: "unknown issue" }
  ]);
  assert.equal(statuses.find((status) => status.id === "manual-review").state, "needs-review");
});

test("gates AI and final routes by workflow prerequisites", () => {
  assert.equal(wizard.canEnterStep("ai-customize", {}), false);
  assert.equal(wizard.canEnterStep("ai-customize", { hasManualBaseline: true }), true);
  assert.equal(wizard.canEnterStep("ai-import", { hasHandoff: true }), true);
  assert.equal(wizard.canEnterStep("ai-compare", { hasValidAiDraft: true }), true);
  assert.equal(wizard.canEnterStep("final-review", { selectedVersion: "manual" }), true);
  assert.equal(wizard.canEnterStep("final-review", { selectedVersion: "ai" }), true);
  assert.equal(wizard.canEnterStep("final-review", { selectedVersion: null }), false);
});

test("canFinalize requires an explicit manual or AI selection", () => {
  assert.equal(wizard.canFinalize({ selectedVersion: "manual" }), true);
  assert.equal(wizard.canFinalize({ selectedVersion: "ai" }), true);
  assert.equal(wizard.canFinalize({}), false);
});
