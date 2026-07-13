"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createSuggestionCoordinator
} = require("../workbench/ai/suggestion-coordinator");

function binding(overrides = {}) {
  return {
    cycleId: "cycle-a",
    reviewRevision: "revision-a",
    manualThemeHash: "hash-a",
    ...overrides
  };
}

test("starting a second suggestion aborts the first and transfers ownership", () => {
  const coordinator = createSuggestionCoordinator();
  const first = coordinator.begin(binding());
  const second = coordinator.begin(binding({ reviewRevision: "revision-b" }));
  assert.equal(first.signal.aborted, true);
  assert.equal(second.signal.aborted, false);
  assert.equal(coordinator.isCurrent(first), false);
  assert.equal(coordinator.isCurrent(second), true);
});

test("ownership requires request ID and the complete reviewed binding", () => {
  const coordinator = createSuggestionCoordinator();
  const request = coordinator.begin(binding());
  assert.equal(coordinator.isCurrent({
    ...request,
    requestId: "different"
  }), false);
  for (const field of ["cycleId", "reviewRevision", "manualThemeHash"]) {
    assert.equal(coordinator.isCurrent({
      ...request,
      binding: { ...request.binding, [field]: "changed" }
    }), false);
  }
  assert.equal(coordinator.isCurrent(request), true);
});

test("cancel aborts and clears the active request", () => {
  const coordinator = createSuggestionCoordinator();
  const request = coordinator.begin(binding());
  assert.equal(coordinator.cancel(), true);
  assert.equal(request.signal.aborted, true);
  assert.equal(coordinator.isCurrent(request), false);
  assert.equal(coordinator.cancel(), false);
});

test("finish clears only the request that still owns the coordinator", () => {
  const coordinator = createSuggestionCoordinator();
  const stale = coordinator.begin(binding());
  const current = coordinator.begin(binding({ reviewRevision: "revision-b" }));
  coordinator.finish(stale);
  assert.equal(coordinator.isCurrent(current), true);
  coordinator.finish(current);
  assert.equal(coordinator.isCurrent(current), false);
});
