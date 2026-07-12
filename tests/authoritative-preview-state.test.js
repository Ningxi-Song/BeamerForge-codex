const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const modulePath = path.resolve(__dirname, "..", "workbench", "public", "authoritative-preview-state.js");
const { createAuthoritativePreviewState, sourcesForRoute, trustedPdfUrl, displayPdfUrl } = require(modulePath);

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test("authoritative previews are gated to review routes", () => {
  assert.deepEqual(sourcesForRoute("manual-review"), ["manual"]);
  assert.deepEqual(sourcesForRoute("ai-compare"), ["manual", "ai"]);
  assert.deepEqual(sourcesForRoute("final-review"), ["selected"]);
  for (const route of ["start", "color", "ai-customize", "ai-handoff", "ai-import"]) assert.deepEqual(sourcesForRoute(route), []);
});

test("route synchronization dedupes ready and pending keys and ignores stale completions", async () => {
  const first = deferred();
  const second = deferred();
  const calls = [];
  const previews = createAuthoritativePreviewState({ request(source, force) { calls.push({ source, force }); return calls.length === 1 ? first.promise : second.promise; } });
  previews.sync("manual-review", { manual: "hash-a" });
  previews.sync("manual-review", { manual: "hash-a" });
  assert.equal(calls.length, 1);
  previews.sync("manual-review", { manual: "hash-b" });
  assert.equal(calls.length, 2);
  first.resolve({ status: "ready", pdfUrl: `/api/preview/${"a".repeat(64)}-v1/main.pdf`, cacheKey: `${"a".repeat(64)}-v1` });
  await first.promise; await Promise.resolve();
  assert.equal(previews.records.manual.status, "pending");
  second.resolve({ status: "ready", cached: true, pdfUrl: `/api/preview/${"b".repeat(64)}-v1/main.pdf`, cacheKey: `${"b".repeat(64)}-v1` });
  await second.promise; await Promise.resolve();
  assert.equal(previews.records.manual.status, "ready");
  previews.sync("manual-review", { manual: "hash-b" });
  assert.equal(calls.length, 2);
});

test("retry is non-forced, refresh is forced, and failure preserves the previous PDF", async () => {
  const calls = [];
  const key = `${"c".repeat(64)}-v1`;
  const results = [
    { status: "ready", pdfUrl: `/api/preview/${key}/main.pdf`, cacheKey: key },
    { status: "failed", message: "failed", excerpt: "bounded" },
    { status: "unavailable", message: "install compiler" }
  ];
  const previews = createAuthoritativePreviewState({ async request(source, force) { calls.push({ source, force }); return results.shift(); } });
  await previews.request("manual", { route: "manual-review", themeHash: "h", force: false });
  await previews.refresh("manual");
  assert.equal(previews.records.manual.status, "failed");
  assert.equal(previews.records.manual.pdfUrl, `/api/preview/${key}/main.pdf`);
  assert.equal(previews.records.manual.stale, true);
  previews.sync("manual-review", { manual: "h" });
  assert.equal(calls.length, 2, "ordinary re-render must not auto-retry a failed key");
  await previews.retry("manual");
  assert.deepEqual(calls.map((call) => call.force), [false, true, false]);
});

test("a route with an unresolved replacement hash invalidates the desired request", async () => {
  const pending = deferred();
  const previews = createAuthoritativePreviewState({ request() { return pending.promise; } });
  previews.sync("final-review", { selected: "old" });
  previews.sync("final-review", {});
  assert.equal(previews.records.selected.desiredKey, null);
  pending.resolve({ status: "ready", pdfUrl: `/api/preview/${"f".repeat(64)}-v1/main.pdf` });
  await pending.promise; await Promise.resolve();
  assert.notEqual(previews.records.selected.status, "ready");
});

test("comparison requests remain independent when one side fails", async () => {
  const previews = createAuthoritativePreviewState({ async request(source) {
    if (source === "ai") return { status: "failed", message: "AI compile failed" };
    const key = `${"d".repeat(64)}-v1`;
    return { status: "ready", pdfUrl: `/api/preview/${key}/main.pdf`, cacheKey: key };
  } });
  previews.sync("ai-compare", { manual: "m", ai: "a" });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(previews.records.manual.status, "ready");
  assert.equal(previews.records.ai.status, "failed");
  assert.ok(previews.records.manual.pdfUrl);
});

test("authoritative PDF URL guard requires the same origin and exact cache route", () => {
  const location = { href: "http://127.0.0.1:5177/manual-review", origin: "http://127.0.0.1:5177" };
  const pathUrl = `/api/preview/${"e".repeat(64)}-v1/main.pdf`;
  assert.equal(trustedPdfUrl(pathUrl, location), `http://127.0.0.1:5177${pathUrl}`);
  assert.equal(trustedPdfUrl("https://evil.example/api/preview/x/main.pdf", location), null);
  assert.equal(trustedPdfUrl("/api/preview/../secret/main.pdf", location), null);
  assert.equal(trustedPdfUrl(`/api/preview/${"e".repeat(64)}-v1/main.pdf/extra`, location), null);
  assert.equal(displayPdfUrl({ pdfUrl: pathUrl, revision: 3 }, location), `http://127.0.0.1:5177${pathUrl}?refresh=3`);
});
