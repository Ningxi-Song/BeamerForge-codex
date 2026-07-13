(function init(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BeamerForgeAiRefinementState = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function factory() {
  "use strict";

  const BUSY_PHASES = new Set(["connecting", "preparing", "generating", "checking"]);
  const SUGGESTION_PHASES = new Set(["preparing", "generating", "checking"]);
  const ERROR_MESSAGES = Object.freeze({
    provider_unreachable: "We could not reach your AI provider. Check the connection and try again.",
    provider_key_rejected: "The provider did not accept this API key.",
    provider_quota: "The provider could not complete this request. Check your account usage or choose another provider.",
    provider_invalid_response: "The suggestion was not a valid BeamerForge design. Your original is unchanged. Try again or revise the request.",
    provider_invalid_theme: "The suggestion was not a valid BeamerForge design. Your original is unchanged. Try again or revise the request."
  });

  function initialState() {
    return {
      phase: "idle",
      requestToken: 0,
      activeToken: null,
      error: null,
      result: null
    };
  }

  function isCurrent(state, event) {
    return Number.isInteger(event?.token) && event.token === state.activeToken;
  }

  function transition(state, event) {
    const current = state || initialState();
    switch (event?.type) {
      case "connect_start":
        return { ...current, phase: "connecting", error: null };
      case "connect_success":
        return { ...current, phase: "ready", error: null };
      case "connect_failure":
        return { ...current, phase: "failed", error: event.error || null };
      case "suggest_start": {
        const requestToken = current.requestToken + 1;
        return {
          ...current,
          phase: "preparing",
          requestToken,
          activeToken: requestToken,
          error: null,
          result: null
        };
      }
      case "stage":
        if (!isCurrent(current, event) || !SUGGESTION_PHASES.has(event.phase)) return current;
        return { ...current, phase: event.phase };
      case "success":
        if (!isCurrent(current, event)) return current;
        return {
          ...current,
          phase: "ready",
          activeToken: null,
          error: null,
          result: event.result || null
        };
      case "failure":
        if (!isCurrent(current, event)) return current;
        return {
          ...current,
          phase: "failed",
          activeToken: null,
          error: event.error || null
        };
      case "cancel":
        if (!isCurrent(current, event)) return current;
        return {
          ...current,
          phase: "cancelled",
          activeToken: null,
          error: null
        };
      case "reset":
        return {
          ...current,
          phase: event.connected ? "ready" : "idle",
          activeToken: null,
          error: null,
          result: null
        };
      default:
        return current;
    }
  }

  function isBusy(state) {
    return BUSY_PHASES.has(state?.phase);
  }

  function messageForError(error) {
    if (ERROR_MESSAGES[error?.code]) return ERROR_MESSAGES[error.code];
    if (typeof error?.message === "string" && error.message.trim()) return error.message.trim();
    return "Something went wrong. Your original design is unchanged.";
  }

  return {
    ERROR_MESSAGES,
    initialState,
    transition,
    isBusy,
    messageForError
  };
});
