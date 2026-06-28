const test = require("node:test");
const assert = require("node:assert/strict");
const wizard = require("../workbench/public/wizard-state");
const { DEFAULT_THEME } = require("../schema/theme-schema");
const { getRegistry } = require("../registry/options");

test("defines the cumulative wizard route order", () => {
  assert.deepEqual(
    wizard.STEPS.map((step) => step.path),
    ["/start", "/color", "/font", "/bullets", "/blocks", "/navigation", "/title-page", "/review"]
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
  assert.equal(wizard.sectionForStep("review"), null);
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
