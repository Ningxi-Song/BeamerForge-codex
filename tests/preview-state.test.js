const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const modulePath = path.resolve(__dirname, "..", "workbench", "public", "preview-state.js");
const {
  createPreviewLifecycle,
  applyResolvedCanvas,
  applyPreviewFailure,
  applyPreviewSuccess,
  applyCachedReuse,
  trustedPreviewUrl
} = require(modulePath);

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function fakeTimers() {
  let nextId = 0;
  const tasks = new Map();
  return {
    set(fn) { const id = ++nextId; tasks.set(id, fn); return id; },
    clear(id) { tasks.delete(id); },
    get size() { return tasks.size; },
    runNext() {
      const entry = tasks.entries().next().value;
      assert.ok(entry, "expected a queued timer");
      const [id, fn] = entry;
      tasks.delete(id);
      return fn();
    }
  };
}

function lifecycleHarness(resolver) {
  const timers = fakeTimers();
  const successes = [];
  const errors = [];
  const lifecycle = createPreviewLifecycle({
    resolve: resolver,
    setTimeoutFn: timers.set,
    clearTimeoutFn: timers.clear,
    onSuccess: (design, meta) => successes.push({ design, meta }),
    onError: (error, meta) => errors.push({ error, meta })
  });
  return { lifecycle, timers, successes, errors };
}

test("resolved canvas applies exact 4:3 aspect ratio", () => {
  const container = { style: {} };
  applyResolvedCanvas(container, { canvas: { widthUnits: 4, heightUnits: 3 } });
  assert.equal(container.style.aspectRatio, "4 / 3");
});

test("trusted preview URLs must stay on the current origin under assets", () => {
  const location = { href: "http://127.0.0.1:5177/color", origin: "http://127.0.0.1:5177" };
  assert.equal(
    trustedPreviewUrl("/assets/elements/decorations/logos/duck.svg", location),
    "http://127.0.0.1:5177/assets/elements/decorations/logos/duck.svg"
  );
  assert.equal(trustedPreviewUrl("/api/theme", location), null);
  assert.equal(trustedPreviewUrl("https://evil.example/assets/duck.svg", location), null);
  assert.equal(trustedPreviewUrl("//evil.example/assets/duck.svg", location), null);
});

test("structured preview failures update field errors and preserve the last design", () => {
  const lastDesign = { source: { themeHash: "last-valid" } };
  const state = { resolvedDesign: lastDesign, previewValidationErrors: [{ path: "old" }] };
  const error = Object.assign(new Error("invalid"), {
    errors: [{ path: "identity.title", message: "must be a string" }]
  });

  applyPreviewFailure(state, error);

  assert.equal(state.resolvedDesign, lastDesign);
  assert.deepEqual(state.previewValidationErrors, error.errors);
});

test("unstructured preview failures preserve existing field errors", () => {
  const existing = [{ path: "colors.primary", message: "must be a color" }];
  const state = { resolvedDesign: {}, previewValidationErrors: existing };
  applyPreviewFailure(state, Object.assign(new Error("offline"), { errors: [] }));
  assert.equal(state.previewValidationErrors, existing);
});

test("same-key retry success clears preview error presentation and restores build status", async () => {
  let attempts = 0;
  const timers = fakeTimers();
  const state = {
    resolvedDesign: { source: { themeHash: "last" } },
    previewValidationErrors: [],
    previewErrorActive: false,
    previewBuildStatusBeforeError: null
  };
  const display = { status: "Saved", statusClass: "is-saved", buildStatus: "Compiled successfully" };
  const lifecycle = createPreviewLifecycle({
    setTimeoutFn: timers.set,
    clearTimeoutFn: timers.clear,
    async resolve() {
      attempts++;
      if (attempts === 1) throw Object.assign(new Error("invalid"), { errors: [{ path: "colors.primary" }] });
      return { source: { themeHash: "current" } };
    },
    onError(error) {
      applyPreviewFailure(state, error, display.buildStatus);
      display.status = "Preview error";
      display.statusClass = "is-error";
      display.buildStatus = error.message;
    },
    onSuccess(design) {
      const recovery = applyPreviewSuccess(state, design);
      if (recovery.recovered) {
        display.status = "Preview current";
        display.statusClass = "";
        display.buildStatus = recovery.restoreBuildStatus;
      }
    }
  });

  lifecycle.schedule({}, "same");
  await timers.runNext();
  assert.equal(lifecycle.schedule({}, "same"), true);
  await timers.runNext();

  assert.equal(attempts, 2);
  assert.equal(state.resolvedDesign.source.themeHash, "current");
  assert.deepEqual(state.previewValidationErrors, []);
  assert.equal(display.status, "Preview current");
  assert.equal(display.statusClass, "");
  assert.equal(display.buildStatus, "Compiled successfully");
});

test("cached reuse clears only preview-owned errors and preserves the resolved design", () => {
  const design = { source: { themeHash: "A" } };
  const serverErrors = [{ path: "identity.title" }];
  const state = {
    resolvedDesign: design,
    validationErrors: serverErrors,
    previewValidationErrors: [{ path: "colors.primary" }]
  };

  applyCachedReuse(state);

  assert.equal(state.resolvedDesign, design);
  assert.equal(state.validationErrors, serverErrors);
  assert.deepEqual(state.previewValidationErrors, []);
});

test("same key dedupes while pending and after success", async () => {
  let calls = 0;
  const h = lifecycleHarness(async () => ({ id: ++calls }));
  assert.equal(h.lifecycle.schedule({ value: "A" }, "A"), true);
  assert.equal(h.lifecycle.schedule({ value: "A" }, "A"), false);
  assert.equal(h.timers.size, 1);
  await h.timers.runNext();
  assert.equal(h.successes.length, 1);
  assert.equal(h.lifecycle.state.successfulKey, "A");
  assert.equal(h.lifecycle.state.desiredKey, "A");
  assert.equal(h.lifecycle.state.pendingKey, null);
  assert.equal(h.lifecycle.schedule({ value: "A" }, "A"), false);
  assert.equal(calls, 1);
});

test("reverting A to B to A cancels B before its timer runs", async () => {
  const calls = [];
  const h = lifecycleHarness(async (input) => { calls.push(input.id); return input; });
  h.lifecycle.schedule({ id: "A" }, "A");
  await h.timers.runNext();
  h.lifecycle.schedule({ id: "B" }, "B");

  assert.equal(h.timers.size, 1);
  assert.equal(h.lifecycle.schedule({ id: "A" }, "A"), "reuse");
  assert.equal(h.timers.size, 0);
  assert.equal(h.lifecycle.state.desiredKey, "A");
  assert.equal(h.lifecycle.state.pendingKey, null);
  assert.equal(h.lifecycle.state.successfulKey, "A");
  assert.deepEqual(calls, ["A"]);
});

for (const outcome of ["success", "failure"]) {
  test(`reverting A to B to A ignores late in-flight B ${outcome}`, async () => {
    const b = deferred();
    const h = lifecycleHarness((input) => input.id === "A" ? Promise.resolve(input) : b.promise);
    h.lifecycle.schedule({ id: "A" }, "A");
    await h.timers.runNext();
    h.lifecycle.schedule({ id: "B" }, "B");
    const bRun = h.timers.runNext();

    assert.equal(h.lifecycle.schedule({ id: "A" }, "A"), "reuse");
    assert.equal(h.lifecycle.state.desiredKey, "A");
    assert.equal(h.lifecycle.state.pendingKey, null);
    if (outcome === "success") b.resolve({ id: "B" });
    else b.reject(new Error("late B"));
    await bRun;

    assert.equal(h.lifecycle.state.successfulKey, "A");
    assert.equal(h.lifecycle.state.desiredKey, "A");
    assert.equal(h.lifecycle.state.pendingKey, null);
    assert.deepEqual(h.successes.map((item) => item.design.id), ["A"]);
    assert.equal(h.errors.length, 0);
  });
}

test("failed B transitions once to cached A reuse without requesting A again", async () => {
  const calls = [];
  const h = lifecycleHarness(async (input) => {
    calls.push(input.id);
    if (input.id === "B") throw Object.assign(new Error("invalid B"), { errors: [{ path: "colors.primary" }] });
    return input;
  });
  h.lifecycle.schedule({ id: "A" }, "A");
  await h.timers.runNext();
  h.lifecycle.schedule({ id: "B" }, "B");
  await h.timers.runNext();

  assert.equal(h.lifecycle.schedule({ id: "A" }, "A"), "reuse");
  assert.equal(h.lifecycle.schedule({ id: "A" }, "A"), false);
  assert.deepEqual(calls, ["A", "B"]);
  assert.equal(h.lifecycle.state.successfulKey, "A");
  assert.equal(h.lifecycle.state.desiredKey, "A");
  assert.equal(h.lifecycle.state.pendingKey, null);
  assert.equal(h.lifecycle.schedule({ id: "B" }, "B"), true);
});

test("current failure clears pending and permits an identical retry", async () => {
  let calls = 0;
  const h = lifecycleHarness(async () => {
    calls++;
    if (calls === 1) throw Object.assign(new Error("invalid"), { errors: [{ path: "colors.primary" }] });
    return { id: "recovered" };
  });
  assert.equal(h.lifecycle.schedule({}, "same"), true);
  await h.timers.runNext();
  assert.equal(h.errors.length, 1);
  assert.deepEqual(h.errors[0].error.errors, [{ path: "colors.primary" }]);
  assert.equal(h.lifecycle.state.pendingKey, null);
  assert.equal(h.lifecycle.schedule({}, "same"), true);
  await h.timers.runNext();
  assert.equal(h.successes.at(-1).design.id, "recovered");
});

test("stale failure cannot clear or overwrite newer pending success", async () => {
  const a = deferred();
  const b = deferred();
  const h = lifecycleHarness((input) => input.id === "A" ? a.promise : b.promise);
  h.lifecycle.schedule({ id: "A" }, "A");
  const aRun = h.timers.runNext();
  h.lifecycle.schedule({ id: "B" }, "B");
  const bRun = h.timers.runNext();
  a.reject(new Error("stale A"));
  await aRun;
  assert.equal(h.lifecycle.state.pendingKey, "B");
  assert.equal(h.errors.length, 0);
  b.resolve({ id: "B" });
  await bRun;
  assert.equal(h.lifecycle.state.successfulKey, "B");
  assert.equal(h.successes.at(-1).design.id, "B");
});

test("stale success cannot overwrite a newer success", async () => {
  const a = deferred();
  const b = deferred();
  const h = lifecycleHarness((input) => input.id === "A" ? a.promise : b.promise);
  h.lifecycle.schedule({ id: "A" }, "A");
  const aRun = h.timers.runNext();
  h.lifecycle.schedule({ id: "B" }, "B");
  const bRun = h.timers.runNext();
  b.resolve({ id: "B" });
  await bRun;
  a.resolve({ id: "A" });
  await aRun;
  assert.equal(h.lifecycle.state.successfulKey, "B");
  assert.deepEqual(h.successes.map((item) => item.design.id), ["B"]);
});

test("rapid A to B scheduling resolves only B", async () => {
  const calls = [];
  const h = lifecycleHarness(async (input) => { calls.push(input.id); return input; });
  h.lifecycle.schedule({ id: "A" }, "A");
  h.lifecycle.schedule({ id: "B" }, "B");
  assert.equal(h.timers.size, 1);
  await h.timers.runNext();
  assert.deepEqual(calls, ["B"]);
  assert.equal(h.successes.at(-1).design.id, "B");
});
