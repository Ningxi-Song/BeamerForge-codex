const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_THEME, validateTheme } = require("../schema/theme-schema");
const { getRegistry } = require("../registry/options");
const { listDirections, applyDirection } = require("../workbench/design-directions");

test("curated directions are small, visual, and produce valid themes", () => {
  const registry = getRegistry();
  const directions = listDirections(registry);
  assert.deepEqual(directions.map((item) => item.id), ["quiet-academic", "clean-modern", "bold-editorial"]);
  for (const direction of directions) {
    assert.equal(typeof direction.label, "string");
    assert.equal(typeof direction.description, "string");
    assert.equal(direction.swatches.length, 5);
    assert.equal(validateTheme(applyDirection(DEFAULT_THEME, direction.id, registry), { registry }).ok, true);
  }
});

test("unknown directions are rejected instead of partially applying", () => {
  assert.throws(() => applyDirection(DEFAULT_THEME, "missing", getRegistry()), /Unknown design direction/);
});
