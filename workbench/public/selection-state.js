(function init(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BeamerForgeSelectionState = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function factory() {
  "use strict";
  const HASH = /^[a-f0-9]{64}$/;
  const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
  function canBuild(workflow) {
    return ["manual", "ai"].includes(workflow?.selectedVersion)
      && HASH.test(workflow?.selectedThemeHash || "")
      && UUID.test(workflow?.cycleId || "")
      && UUID.test(workflow?.reviewRevision || "");
  }
  function invalidateForManualMutation(workflow) {
    return { ...workflow, selectedVersion: null, selectedThemeHash: null, cycleId: null, reviewRevision: null, hasValidAiDraft: false };
  }
  function invalidateForReviewMutation(workflow, response) {
    return {
      ...workflow,
      selectedVersion: null,
      selectedThemeHash: null,
      cycleId: UUID.test(response?.cycleId || "") ? response.cycleId : null,
      reviewRevision: UUID.test(response?.reviewRevision || "") ? response.reviewRevision : null,
      hasValidAiDraft: false
    };
  }
  function applyServerSelection(workflow, response) {
    const selectedVersion = response?.selectedVersion;
    const selectedThemeHash = response?.themeHash;
    const cycleId = response?.cycleId;
    const reviewRevision = response?.reviewRevision;
    if (!["manual", "ai"].includes(selectedVersion) || !HASH.test(selectedThemeHash || "")
      || !UUID.test(cycleId || "") || !UUID.test(reviewRevision || "")) return invalidateForManualMutation(workflow);
    return { ...workflow, selectedVersion, selectedThemeHash, cycleId, reviewRevision };
  }
  function applyPersistedSelection(workflow, selection) {
    return applyServerSelection(workflow, {
      selectedVersion: selection?.version,
      themeHash: selection?.themeHash,
      cycleId: selection?.cycleId,
      reviewRevision: selection?.reviewRevision
    });
  }
  function buildRequest(workflow) {
    return canBuild(workflow) ? {
      selectedVersion: workflow.selectedVersion,
      expectedThemeHash: workflow.selectedThemeHash,
      cycleId: workflow.cycleId,
      reviewRevision: workflow.reviewRevision
    } : null;
  }
  function isComparisonCurrent(currentCycleId, _currentThemeHash, comparison) {
    return UUID.test(currentCycleId || "") && comparison?.cycleId === currentCycleId
      && UUID.test(comparison?.reviewRevision || "")
      && HASH.test(comparison?.manualThemeHash || "")
      && HASH.test(comparison?.draftThemeHash || "");
  }
  function reviewRequest(review) {
    if (!review || !HASH.test(review.manualThemeHash || "") || !HASH.test(review.draftThemeHash || "")
      || !UUID.test(review.cycleId || "") || !UUID.test(review.reviewRevision || "")) return null;
    return {
      expectedManualThemeHash: review.manualThemeHash,
      expectedDraftThemeHash: review.draftThemeHash,
      cycleId: review.cycleId,
      reviewRevision: review.reviewRevision
    };
  }
  return { canBuild, invalidateForManualMutation, invalidateForReviewMutation, applyServerSelection, applyPersistedSelection, buildRequest, isComparisonCurrent, reviewRequest };
});
