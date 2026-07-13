"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const aiState = require("../workbench/public/ai-refinement-state");

test("models connection and staged suggestion progress", () => {
  let state = aiState.initialState();
  assert.deepEqual(state, {
    phase: "idle",
    requestToken: 0,
    activeToken: null,
    error: null,
    result: null
  });

  state = aiState.transition(state, { type: "connect_start" });
  assert.equal(state.phase, "connecting");
  state = aiState.transition(state, { type: "connect_success" });
  assert.equal(state.phase, "ready");

  state = aiState.transition(state, { type: "suggest_start" });
  assert.equal(state.phase, "preparing");
  assert.equal(state.requestToken, 1);
  assert.equal(state.activeToken, 1);
  state = aiState.transition(state, { type: "stage", token: 1, phase: "generating" });
  assert.equal(state.phase, "generating");
  state = aiState.transition(state, { type: "stage", token: 1, phase: "checking" });
  assert.equal(state.phase, "checking");
  state = aiState.transition(state, { type: "success", token: 1, result: { ok: true } });
  assert.equal(state.phase, "ready");
  assert.equal(state.activeToken, null);
  assert.deepEqual(state.result, { ok: true });
});

test("busy states are explicit", () => {
  for (const phase of ["connecting", "preparing", "generating", "checking"]) {
    assert.equal(aiState.isBusy({ phase }), true, phase);
  }
  for (const phase of ["idle", "ready", "failed", "cancelled"]) {
    assert.equal(aiState.isBusy({ phase }), false, phase);
  }
});

test("request tokens ignore late stages, success, and failure", () => {
  let state = aiState.transition(aiState.initialState(), { type: "suggest_start" });
  state = aiState.transition(state, { type: "suggest_start" });
  assert.equal(state.activeToken, 2);
  const current = state;
  assert.strictEqual(
    aiState.transition(state, { type: "stage", token: 1, phase: "checking" }),
    current
  );
  assert.strictEqual(
    aiState.transition(state, { type: "success", token: 1, result: {} }),
    current
  );
  assert.strictEqual(
    aiState.transition(state, { type: "failure", token: 1, error: { code: "old" } }),
    current
  );
});

test("current failures and cancellation preserve deterministic terminal states", () => {
  let state = aiState.transition(aiState.initialState(), { type: "suggest_start" });
  state = aiState.transition(state, {
    type: "failure",
    token: 1,
    error: { code: "provider_quota" }
  });
  assert.equal(state.phase, "failed");
  assert.equal(state.activeToken, null);
  assert.deepEqual(state.error, { code: "provider_quota" });

  state = aiState.transition(state, { type: "suggest_start" });
  const activeToken = state.activeToken;
  state = aiState.transition(state, { type: "cancel", token: activeToken });
  assert.equal(state.phase, "cancelled");
  assert.equal(state.activeToken, null);
  const cancelled = state;
  assert.strictEqual(
    aiState.transition(state, { type: "success", token: activeToken, result: {} }),
    cancelled
  );
});

test("provider error codes map to plain-language messages", () => {
  assert.equal(
    aiState.messageForError({ code: "provider_unreachable" }),
    "We could not reach your AI provider. Check the connection and try again."
  );
  assert.equal(
    aiState.messageForError({ code: "provider_key_rejected" }),
    "The provider did not accept this API key."
  );
  assert.equal(
    aiState.messageForError({ code: "provider_quota" }),
    "The provider could not complete this request. Check your account usage or choose another provider."
  );
  for (const code of ["provider_invalid_response", "provider_invalid_theme"]) {
    assert.equal(
      aiState.messageForError({ code }),
      "The suggestion was not a valid BeamerForge design. Your original is unchanged. Try again or revise the request."
    );
  }
  assert.equal(
    aiState.messageForError({ message: "A safe message" }),
    "A safe message"
  );
  assert.equal(
    aiState.messageForError(null),
    "Something went wrong. Your original design is unchanged."
  );
});
