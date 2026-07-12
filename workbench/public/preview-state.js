(function initPreviewState(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BeamerForgePreviewState = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function previewStateFactory() {
  "use strict";

  function createPreviewLifecycle(options) {
    const resolve = options.resolve;
    const onSuccess = options.onSuccess || (() => {});
    const onError = options.onError || (() => {});
    const setTimeoutFn = options.setTimeoutFn || setTimeout;
    const clearTimeoutFn = options.clearTimeoutFn || clearTimeout;
    const debounceMs = options.debounceMs === undefined ? 50 : options.debounceMs;
    const state = { sequence: 0, desiredKey: null, successfulKey: null, pendingKey: null, timer: null };

    async function perform(input, key, sequence, context) {
      try {
        const design = await resolve(input);
        if (sequence !== state.sequence || key !== state.pendingKey || key !== state.desiredKey) return null;
        state.successfulKey = key;
        state.pendingKey = null;
        onSuccess(design, { key, context });
        return design;
      } catch (error) {
        if (sequence !== state.sequence || key !== state.pendingKey || key !== state.desiredKey) return null;
        state.pendingKey = null;
        onError(error, { key, context });
        return null;
      }
    }

    function begin(input, key, context, delayed) {
      const previousDesiredKey = state.desiredKey;
      state.desiredKey = key;
      if (key === state.successfulKey) {
        const reused = previousDesiredKey !== null && previousDesiredKey !== key;
        if (state.pendingKey !== null && state.pendingKey !== key) {
          if (state.timer !== null) clearTimeoutFn(state.timer);
          state.timer = null;
          state.pendingKey = null;
          state.sequence++;
        }
        return delayed ? (reused ? "reuse" : false) : Promise.resolve(null);
      }
      if (key === state.pendingKey) return delayed ? false : Promise.resolve(null);
      if (state.timer !== null) clearTimeoutFn(state.timer);
      const sequence = ++state.sequence;
      state.pendingKey = key;
      if (!delayed) {
        state.timer = null;
        return perform(input, key, sequence, context);
      }
      state.timer = setTimeoutFn(() => {
        state.timer = null;
        return perform(input, key, sequence, context);
      }, debounceMs);
      return true;
    }

    return {
      state,
      schedule(input, key, context) { return begin(input, key, context, true); },
      resolveNow(input, key, context) { return begin(input, key, context, false); }
    };
  }

  function applyResolvedCanvas(container, design) {
    container.style.aspectRatio = `${design.canvas.widthUnits} / ${design.canvas.heightUnits}`;
  }

  function applyPreviewFailure(state, error, currentBuildStatus) {
    if (Array.isArray(error?.errors) && error.errors.length > 0) state.previewValidationErrors = error.errors;
    if (!state.previewErrorActive) state.previewBuildStatusBeforeError = currentBuildStatus;
    state.previewErrorActive = true;
    return state.resolvedDesign;
  }

  function applyPreviewSuccess(state, design) {
    const recovery = {
      recovered: state.previewErrorActive === true,
      restoreBuildStatus: state.previewBuildStatusBeforeError
    };
    state.resolvedDesign = design;
    state.previewValidationErrors = [];
    state.previewErrorActive = false;
    state.previewBuildStatusBeforeError = null;
    return recovery;
  }

  function applyCachedReuse(state) {
    const recovery = {
      recovered: state.previewErrorActive === true,
      restoreBuildStatus: state.previewBuildStatusBeforeError
    };
    state.previewValidationErrors = [];
    state.previewErrorActive = false;
    state.previewBuildStatusBeforeError = null;
    return recovery;
  }

  function trustedPreviewUrl(value, locationLike) {
    if (!value || !locationLike?.href || !locationLike?.origin) return null;
    try {
      const url = new URL(value, locationLike.href);
      if (url.origin !== locationLike.origin || !url.pathname.startsWith("/assets/")) return null;
      return url.href;
    } catch {
      return null;
    }
  }

  return { createPreviewLifecycle, applyResolvedCanvas, applyPreviewFailure, applyPreviewSuccess, applyCachedReuse, trustedPreviewUrl };
});
