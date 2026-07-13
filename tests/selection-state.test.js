const test = require("node:test");
const assert = require("node:assert/strict");
const selectionState = require("../workbench/public/selection-state");

test("manual mutation clears explicit selection and current AI comparison state", () => {
  const workflow = {
    selectedVersion: "ai",
    selectedThemeHash: "a".repeat(64),
    cycleId: "11111111-1111-4111-8111-111111111111",
    reviewRevision: "22222222-2222-4222-8222-222222222222",
    hasValidAiDraft: true
  };
  const result = selectionState.invalidateForManualMutation(workflow);

  assert.deepEqual(result, {
    selectedVersion: null,
    selectedThemeHash: null,
    cycleId: null,
    reviewRevision: null,
    hasValidAiDraft: false
  });
  assert.equal(selectionState.canBuild(result), false);
});

test("only a complete server-issued selection enables a build", () => {
  const cycleId = "11111111-1111-4111-8111-111111111111";
  const reviewRevision = "22222222-2222-4222-8222-222222222222";
  assert.equal(selectionState.canBuild({ selectedVersion: "manual", selectedThemeHash: "b".repeat(64), cycleId, reviewRevision }), true);
  assert.equal(selectionState.canBuild({ selectedVersion: "ai", selectedThemeHash: "c".repeat(64), cycleId, reviewRevision }), true);
  assert.equal(selectionState.canBuild({ selectedVersion: "manual" }), false);
  assert.equal(selectionState.canBuild({ selectedVersion: "other", selectedThemeHash: "d".repeat(64) }), false);
});

test("accept AI then edit disables build until manual or AI is reselected", () => {
  const cycleId = "11111111-1111-4111-8111-111111111111";
  const reviewRevision = "22222222-2222-4222-8222-222222222222";
  let workflow = selectionState.applyServerSelection({}, { selectedVersion: "ai", themeHash: "e".repeat(64), cycleId, reviewRevision });
  assert.deepEqual(selectionState.buildRequest(workflow), { selectedVersion: "ai", expectedThemeHash: "e".repeat(64), cycleId, reviewRevision });
  workflow = selectionState.invalidateForManualMutation(workflow);
  assert.equal(selectionState.canBuild(workflow), false);
  assert.equal(selectionState.buildRequest(workflow), null);
  workflow = selectionState.applyServerSelection(workflow, { selectedVersion: "manual", themeHash: "f".repeat(64), cycleId, reviewRevision });
  assert.equal(selectionState.canBuild(workflow), true);
});

test("boot accepts only validated persisted selection metadata", () => {
  const cycleId = "11111111-1111-4111-8111-111111111111";
  const reviewRevision = "22222222-2222-4222-8222-222222222222";
  assert.equal(selectionState.applyPersistedSelection({}, { version: "manual", themeHash: "a".repeat(64), cycleId, reviewRevision }).selectedVersion, "manual");
  assert.equal(selectionState.applyPersistedSelection({ selectedVersion: "ai", selectedThemeHash: "b".repeat(64) }, null).selectedVersion, null);
  assert.equal(selectionState.applyPersistedSelection({}, { version: "manual", themeHash: "BAD" }).selectedVersion, null);
});

test("an old AI comparison does not become current for a new manual edit cycle", () => {
  const oldCycle = "11111111-1111-4111-8111-111111111111";
  const newCycle = "33333333-3333-4333-8333-333333333333";
  const comparison = { cycleId: oldCycle, reviewRevision: "22222222-2222-4222-8222-222222222222", manualThemeHash: "2".repeat(64), draftThemeHash: "3".repeat(64) };
  assert.equal(selectionState.isComparisonCurrent(newCycle, "2".repeat(64), comparison), false);
  assert.equal(selectionState.isComparisonCurrent(oldCycle, "2".repeat(64), comparison), true);
  assert.equal(selectionState.isComparisonCurrent(oldCycle, "4".repeat(64), comparison), true, "a newly imported comparison remains current when theme.json contains the previously accepted draft");
});

test("review and build requests preserve server-issued cycle identity", () => {
  const cycleId = "11111111-1111-4111-8111-111111111111";
  const reviewRevision = "22222222-2222-4222-8222-222222222222";
  const workflow = selectionState.applyServerSelection({}, { selectedVersion: "ai", themeHash: "a".repeat(64), cycleId, reviewRevision });
  assert.deepEqual(selectionState.buildRequest(workflow), { selectedVersion: "ai", expectedThemeHash: "a".repeat(64), cycleId, reviewRevision });
  assert.deepEqual(selectionState.reviewRequest({ manualThemeHash: "b".repeat(64), draftThemeHash: "c".repeat(64), cycleId, reviewRevision }), {
    expectedManualThemeHash: "b".repeat(64), expectedDraftThemeHash: "c".repeat(64), cycleId, reviewRevision
  });
});
