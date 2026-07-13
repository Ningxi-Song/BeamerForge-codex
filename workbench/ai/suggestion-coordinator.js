"use strict";

const { randomUUID } = require("node:crypto");

function createSuggestionCoordinator() {
  let active = null;

  function begin(binding) {
    if (active) active.controller.abort();
    active = {
      requestId: randomUUID(),
      binding: { ...binding },
      controller: new AbortController()
    };
    return {
      requestId: active.requestId,
      signal: active.controller.signal,
      binding: { ...active.binding }
    };
  }

  function isCurrent(request) {
    return Boolean(active)
      && active.requestId === request.requestId
      && active.binding.cycleId === request.binding.cycleId
      && active.binding.reviewRevision === request.binding.reviewRevision
      && active.binding.manualThemeHash === request.binding.manualThemeHash;
  }

  function finish(request) {
    if (isCurrent(request)) active = null;
  }

  function cancel() {
    if (!active) return false;
    active.controller.abort();
    active = null;
    return true;
  }

  return { begin, isCurrent, finish, cancel };
}

module.exports = { createSuggestionCoordinator };
