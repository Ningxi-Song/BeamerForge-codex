const test = require("node:test");
const assert = require("node:assert/strict");
const onboarding = require("../workbench/public/onboarding-state");

test("welcome is shown only when explicitly routed or the session has not started", () => {
  assert.equal(onboarding.shouldShow({ pathname: "/welcome", started: true }), true);
  assert.equal(onboarding.shouldShow({ pathname: "/", started: false }), true);
  assert.equal(onboarding.shouldShow({ pathname: "/color", started: false }), false);
  assert.equal(onboarding.shouldShow({ pathname: "/", started: true }), false);
});

test("starting creates a direction navigation decision", () => {
  assert.deepEqual(onboarding.begin(), { started: true, nextPath: "/start" });
});
