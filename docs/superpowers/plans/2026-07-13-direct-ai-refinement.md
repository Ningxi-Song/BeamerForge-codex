# Direct Provider-Neutral AI Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users connect OpenAI, DeepSeek, or a compatible endpoint inside BeamerForge, request a schema-safe theme change, compare it with the protected manual design, and explicitly choose the result without using the handoff workflow.

**Architecture:** Add a server-memory provider service behind a narrow adapter contract, a safe reference-context builder, and a snapshot-bound suggestion coordinator. The browser receives only redacted connection state and ordinary workflow responses. Existing draft validation, semantic comparison, explicit acceptance, renderer parity, and selected-theme build gates remain authoritative.

**Tech Stack:** Node.js 20 built-in `fetch`, CommonJS, browser JavaScript UMD state module, multipart `FormData`, `node:test`, existing theme schema and snapshot infrastructure.

---

## File Structure

- Create `workbench/ai/provider-config.js`: provider defaults, URL policy, model selection, public/redacted configuration.
- Create `workbench/ai/provider-service.js`: in-memory credentials, connection test, model listing, and chat completion calls.
- Create `workbench/ai/reference-context.js`: validated source excerpts and provider-capability-gated image blocks.
- Create `workbench/ai/suggestion-prompt.js`: deterministic schema-constrained model messages and response parsing.
- Create `workbench/ai/suggestion-coordinator.js`: latest-request ownership, cancellation, and stale-result rejection.
- Create `workbench/public/ai-refinement-state.js`: pure browser state transitions and user-facing error mapping.
- Create focused tests for every new module under `tests/`.
- Modify `workbench/ai-handoff.js`: export its existing reference validator for shared use.
- Modify `workbench/server.js`: inject the provider service and expose connect, status, disconnect, suggest, and cancel routes.
- Modify `workbench/public/index.html`: load the AI state module and add the connection sheet container.
- Modify `workbench/public/app.js`: render direct refinement, connection, loading, cancellation, comparison, and revise flow.
- Modify `workbench/public/styles.css`: connection sheet, progress stages, plain errors, comparison action hierarchy, and narrow-screen toggle.
- Modify `workbench/public/wizard-state.js`: remove handoff/import from the normal next-step sequence while retaining their Advanced routes.
- Modify `tests/server.test.js`, `tests/public-ui.test.js`, `tests/wizard-state.test.js`, and selection tests: cover the integrated path.
- Modify `package.json`: syntax-check new modules.

### Task 1: Define provider configuration and secret boundaries

**Files:**
- Create: `workbench/ai/provider-config.js`
- Create: `tests/provider-config.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write failing configuration tests**

Create `tests/provider-config.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeConnection, publicConnection } = require("../workbench/ai/provider-config");

test("normalizes supported providers without exposing secrets", () => {
  const openai = normalizeConnection({ provider: "openai", apiKey: "sk-test", model: "model-a" });
  assert.equal(openai.baseUrl, "https://api.openai.com/v1");
  const deepseek = normalizeConnection({ provider: "deepseek", apiKey: "ds-test", model: "model-b" });
  assert.equal(deepseek.baseUrl, "https://api.deepseek.com");
  assert.deepEqual(publicConnection(deepseek), {
    connected: true, provider: "deepseek", baseUrl: "https://api.deepseek.com", model: "model-b",
    capabilities: { modelList: true, jsonOutput: true, imageInput: false }
  });
  assert.equal(JSON.stringify(publicConnection(openai)).includes("sk-test"), false);
});

test("custom endpoints require HTTPS except loopback local models", () => {
  assert.throws(() => normalizeConnection({ provider: "custom", apiKey: "x", model: "m", baseUrl: "http://example.com" }), /HTTPS/);
  assert.equal(normalizeConnection({ provider: "custom", apiKey: "x", model: "m", baseUrl: "http://127.0.0.1:11434/v1" }).baseUrl, "http://127.0.0.1:11434/v1");
});
```

- [ ] **Step 2: Run the test and verify the module is absent**

Run: `node --test tests/provider-config.test.js`

Expected: FAIL with a missing-module error.

- [ ] **Step 3: Implement the complete configuration module**

Create `workbench/ai/provider-config.js`:

```js
"use strict";

const PROVIDERS = Object.freeze({
  openai: Object.freeze({ baseUrl: "https://api.openai.com/v1", capabilities: Object.freeze({ modelList: true, jsonOutput: true, imageInput: true }) }),
  deepseek: Object.freeze({ baseUrl: "https://api.deepseek.com", capabilities: Object.freeze({ modelList: true, jsonOutput: true, imageInput: false }) }),
  custom: Object.freeze({ baseUrl: null, capabilities: Object.freeze({ modelList: true, jsonOutput: true, imageInput: false }) })
});

function cleanBaseUrl(value) {
  const url = new URL(String(value || ""));
  const loopback = ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) throw Object.assign(new Error("Custom providers must use HTTPS unless they run on this computer"), { statusCode: 400 });
  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function normalizeConnection(input) {
  const provider = String(input?.provider || "").toLowerCase();
  const definition = PROVIDERS[provider];
  if (!definition) throw Object.assign(new Error("Choose OpenAI, DeepSeek, or a compatible provider"), { statusCode: 400 });
  const apiKey = String(input?.apiKey || "").trim();
  if (!apiKey) throw Object.assign(new Error("Enter an API key"), { statusCode: 400 });
  const model = String(input?.model || "").trim() || null;
  const baseUrl = provider === "custom" ? cleanBaseUrl(input?.baseUrl) : definition.baseUrl;
  return { provider, apiKey, baseUrl, model, capabilities: { ...definition.capabilities } };
}

function publicConnection(connection) {
  if (!connection) return { connected: false };
  return { connected: true, provider: connection.provider, baseUrl: connection.baseUrl, model: connection.model, capabilities: { ...connection.capabilities } };
}

module.exports = { PROVIDERS, normalizeConnection, publicConnection };
```

- [ ] **Step 4: Add syntax checking and run tests**

Add `node --check workbench/ai/provider-config.js` to `npm run check`.

Run: `node --test tests/provider-config.test.js && npm run check`

Expected: PASS.

- [ ] **Step 5: Commit provider configuration**

```bash
git add workbench/ai/provider-config.js tests/provider-config.test.js package.json
git commit -m "feat: define provider-neutral AI configuration"
```

### Task 2: Implement the in-memory provider service

**Files:**
- Create: `workbench/ai/provider-service.js`
- Create: `tests/provider-service.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write failing service tests with a fetch stub**

Cover these cases in `tests/provider-service.test.js`:

```js
test("connect lists models, chooses an available model, and redacts the key", async () => {
  const calls = [];
  const service = createProviderService({ fetchImpl: async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ data: [{ id: "model-a" }, { id: "model-b" }] }), { status: 200, headers: { "content-type": "application/json" } });
  }});
  const status = await service.connect({ provider: "deepseek", apiKey: "secret", model: "model-b" });
  assert.equal(status.model, "model-b");
  assert.equal(JSON.stringify(status).includes("secret"), false);
  assert.equal(calls[0].init.headers.authorization, "Bearer secret");
  assert.equal(JSON.stringify(service.status()).includes("secret"), false);
});

test("provider failures become stable error codes", async () => {
  const service = createProviderService({ fetchImpl: async () => new Response("{}", { status: 401 }) });
  await assert.rejects(() => service.connect({ provider: "openai", apiKey: "bad", model: "m" }), (error) => error.code === "provider_key_rejected");
});
```

Also test 429 → `provider_quota`, network failure → `provider_unreachable`, disconnect clears status, and status never serializes the API key.

- [ ] **Step 2: Run tests and verify failure**

Run: `node --test tests/provider-service.test.js`

Expected: FAIL because the service module does not exist.

- [ ] **Step 3: Implement connection, status, and model listing**

Create `workbench/ai/provider-service.js` with `createProviderService({ fetchImpl = fetch, env = process.env })`. Keep `connection` in the closure. Before testing a new connection, clear the old connection. Resolve an omitted key from `OPENAI_API_KEY` or `DEEPSEEK_API_KEY` for those providers, then use `normalizeConnection`, GET `${baseUrl}/models`, `Authorization: Bearer`, `Accept: application/json`, and an `AbortSignal.timeout(15000)` signal. Select the requested model only when returned; otherwise choose the first model and reject an empty list. Return `publicConnection(connection)` plus `models`.

```js
function keyFromEnvironment(provider, env) {
  if (provider === "openai") return env.OPENAI_API_KEY || "";
  if (provider === "deepseek") return env.DEEPSEEK_API_KEY || "";
  return "";
}

async function connect(input) {
  connection = null;
  const requested = { ...input, apiKey: String(input?.apiKey || "").trim() || keyFromEnvironment(input?.provider, env) };
  const candidate = normalizeConnection(requested);
  const models = await listModels(candidate);
  const selected = candidate.model || models[0]?.id;
  if (!selected || !models.some(({ id }) => id === selected)) throw Object.assign(new Error("Choose an available model"), { code: "provider_model_unavailable", statusCode: 400 });
  connection = { ...candidate, model: selected };
  return { ...publicConnection(connection), models };
}
```

Map errors with:

```js
function providerError(status, cause) {
  const table = {
    401: ["provider_key_rejected", "The provider did not accept this API key"],
    403: ["provider_key_rejected", "The provider did not allow this API key"],
    429: ["provider_quota", "The provider could not complete this request because of account limits"]
  };
  const [code, message] = table[status] || ["provider_failure", "The AI provider could not complete this request"];
  return Object.assign(new Error(message), { code, statusCode: status === 429 ? 402 : 502, cause });
}
```

Network and timeout errors use `provider_unreachable` and status 502. Never attach request headers, response bodies, or the connection object to an error.

- [ ] **Step 4: Add the chat completion operation**

Implement:

```js
async function complete({ messages, signal }) {
  if (!connection) throw Object.assign(new Error("Connect an AI provider first"), { code: "provider_not_connected", statusCode: 409 });
  const response = await fetchImpl(`${connection.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${connection.apiKey}`, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ model: connection.model, messages, stream: false, response_format: connection.capabilities.jsonOutput ? { type: "json_object" } : undefined }),
    signal
  });
  if (!response.ok) throw providerError(response.status);
  const body = await response.json();
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw Object.assign(new Error("The provider returned an empty suggestion"), { code: "provider_invalid_response", statusCode: 502 });
  return content;
}
```

Export `{ connect, disconnect, status, complete }` from the factory.

- [ ] **Step 5: Run provider tests and syntax checks**

Run: `node --test tests/provider-service.test.js && npm run check`

Expected: PASS.

- [ ] **Step 6: Commit the provider service**

```bash
git add workbench/ai/provider-service.js tests/provider-service.test.js package.json
git commit -m "feat: connect AI providers in server memory"
```

### Task 3: Build safe text and image reference context

**Files:**
- Modify: `workbench/ai-handoff.js`
- Create: `workbench/ai/reference-context.js`
- Create: `tests/reference-context.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write failing reference-context tests**

Test that `.tex`, `.sty`, `.cls`, and `.bib` become bounded labeled text; PNG/JPEG/WebP become `data:` image blocks only when `imageInput` is true; unsupported direct PDFs/SVGs and images on text-only providers produce status-400 errors; duplicate paths, traversal, and aggregate limits still use the existing validator.

- [ ] **Step 2: Export the existing validator and verify current handoff tests**

Add `validateReferences` to `module.exports` in `workbench/ai-handoff.js`.

Run: `node --test tests/ai-handoff.test.js`

Expected: PASS with no behavior change.

- [ ] **Step 3: Implement reference conversion**

Create `workbench/ai/reference-context.js`:

```js
"use strict";
const path = require("node:path");
const { validateReferences } = require("../ai-handoff");

const TEXT_EXTENSIONS = new Set([".tex", ".sty", ".cls", ".bib"]);
const IMAGE_TYPES = Object.freeze({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" });
const MAX_TEXT_CHARS = 200000;

function buildReferenceContext(references, capabilities) {
  const validated = validateReferences(references);
  let textChars = 0;
  const text = [];
  const images = [];
  for (const reference of validated) {
    const extension = path.extname(reference.relativePath).toLowerCase();
    if (TEXT_EXTENSIONS.has(extension)) {
      const value = reference.bytes.toString("utf8").replaceAll("\u0000", "");
      if (textChars + value.length > MAX_TEXT_CHARS) throw Object.assign(new Error("Beamer source references are too large for one AI request"), { statusCode: 413 });
      textChars += value.length;
      text.push(`--- ${reference.relativePath} ---\n${value}`);
      continue;
    }
    if (IMAGE_TYPES[extension]) {
      if (!capabilities?.imageInput) throw Object.assign(new Error("The selected provider or model does not accept image references"), { statusCode: 400, code: "image_not_supported" });
      images.push({ type: "image_url", image_url: { url: `data:${IMAGE_TYPES[extension]};base64,${reference.bytes.toString("base64")}` } });
      continue;
    }
    throw Object.assign(new Error(`Reference type '${extension}' is available only in Advanced handoff`), { statusCode: 400 });
  }
  return { text: text.join("\n\n"), images };
}

module.exports = { MAX_TEXT_CHARS, buildReferenceContext };
```

- [ ] **Step 4: Run reference and handoff tests**

Run: `node --test tests/reference-context.test.js tests/ai-handoff.test.js`

Expected: PASS.

- [ ] **Step 5: Commit shared safe references**

```bash
git add workbench/ai-handoff.js workbench/ai/reference-context.js tests/reference-context.test.js package.json
git commit -m "feat: build safe AI reference context"
```

### Task 4: Create deterministic suggestion messages and strict parsing

**Files:**
- Create: `workbench/ai/suggestion-prompt.js`
- Create: `tests/suggestion-prompt.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write failing prompt and parser tests**

Assert that the prompt includes the complete baseline, allowed theme shape, explicit prohibition on raw LaTeX/TikZ/packages/paths, the word JSON, user brief, bounded text references, and optional image blocks. Assert the parser accepts a plain JSON object and fenced JSON, rejects arrays, prose, unknown fields, and invalid registry IDs through `validateTheme`.

- [ ] **Step 2: Run tests and verify module absence**

Run: `node --test tests/suggestion-prompt.test.js`

Expected: FAIL with a missing-module error.

- [ ] **Step 3: Implement message creation and parsing**

Create `workbench/ai/suggestion-prompt.js` exporting:

```js
function createMessages({ baseline, brief, referenceContext }) {
  const system = [
    "You customize BeamerForge themes.",
    "Return one complete JSON object with exactly the same supported theme shape as the baseline.",
    "Do not return Markdown, raw LaTeX, TikZ, packages, commands, executable code, or arbitrary asset paths.",
    "Keep fields unchanged unless the user request requires a change."
  ].join(" ");
  const request = `User request:\n${String(brief).trim()}\n\nProtected baseline JSON:\n${JSON.stringify(baseline)}${referenceContext.text ? `\n\nRead-only Beamer source references:\n${referenceContext.text}` : ""}`;
  const content = [{ type: "text", text: request }, ...referenceContext.images];
  return [{ role: "system", content: system }, { role: "user", content: content.length === 1 ? request : content }];
}

function parseCandidate(content, { registry, validateTheme }) {
  const clean = String(content).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let value;
  try { value = JSON.parse(clean); } catch { throw Object.assign(new Error("The suggestion was not valid JSON"), { code: "provider_invalid_response", statusCode: 502 }); }
  if (!value || Array.isArray(value) || typeof value !== "object") throw Object.assign(new Error("The suggestion was not a complete BeamerForge design"), { code: "provider_invalid_response", statusCode: 502 });
  const result = validateTheme(value, { registry });
  if (!result.ok) throw Object.assign(new Error("The suggestion was not a valid BeamerForge design"), { code: "provider_invalid_theme", statusCode: 422, errors: result.errors });
  return result.value;
}
```

Reject an empty brief before creating messages with status 400.

- [ ] **Step 4: Run prompt tests and syntax checks**

Run: `node --test tests/suggestion-prompt.test.js && npm run check`

Expected: PASS.

- [ ] **Step 5: Commit prompt boundary**

```bash
git add workbench/ai/suggestion-prompt.js tests/suggestion-prompt.test.js package.json
git commit -m "feat: constrain AI theme suggestions"
```

### Task 5: Bind live suggestions to the reviewed baseline

**Files:**
- Create: `workbench/ai/suggestion-coordinator.js`
- Create: `tests/suggestion-coordinator.test.js`
- Modify: `workbench/server.js`
- Modify: `tests/server.test.js`
- Modify: `tests/selection-server.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write failing coordinator tests**

Cover: starting a second request aborts the first; `isCurrent` requires request ID plus cycle/revision/manual hash; cancel aborts and clears; a completed stale request cannot claim ownership.

- [ ] **Step 2: Implement the coordinator**

Create `workbench/ai/suggestion-coordinator.js`:

```js
"use strict";
const { randomUUID } = require("node:crypto");

function createSuggestionCoordinator() {
  let active = null;
  function begin(binding) {
    if (active) active.controller.abort();
    active = { requestId: randomUUID(), binding: { ...binding }, controller: new AbortController() };
    return { requestId: active.requestId, signal: active.controller.signal, binding: { ...active.binding } };
  }
  function isCurrent(request) {
    return Boolean(active) && active.requestId === request.requestId
      && active.binding.cycleId === request.binding.cycleId
      && active.binding.reviewRevision === request.binding.reviewRevision
      && active.binding.manualThemeHash === request.binding.manualThemeHash;
  }
  function finish(request) { if (isCurrent(request)) active = null; }
  function cancel() { if (!active) return false; active.controller.abort(); active = null; return true; }
  return { begin, isCurrent, finish, cancel };
}

module.exports = { createSuggestionCoordinator };
```

- [ ] **Step 3: Inject provider and coordinator services into the server**

In `createWorkbenchServer`, create or accept:

```js
const providerService = options.providerService || createProviderService({ fetchImpl: options.providerFetch || fetch });
const suggestionCoordinator = options.suggestionCoordinator || createSuggestionCoordinator();
```

Add connection routes:

```text
GET  /api/ai/connection
POST /api/ai/connect
POST /api/ai/disconnect
POST /api/ai/cancel
```

Return only `providerService.status()`. Connect accepts JSON and returns the redacted result. Disconnect and cancel return `{ ok: true }` plus whether anything was cancelled.

- [ ] **Step 4: Add the snapshot-bound suggestion endpoint**

Add `POST /api/ai/suggest` as multipart. Parse `brief`, `cycleId`, `reviewRevision`, `expectedManualThemeHash`, reference files, and relative paths. Require exact equality with `currentBaseline`. Build reference context from the provider's public capabilities, start a coordinator request, call `providerService.complete`, parse and validate the candidate, then re-read the baseline and verify both coordinator ownership and the same binding before calling `saveAiDraft` and writing comparison markers.

If ownership or baseline changed, return 409 **Your reviewed design changed while AI was working. Review it and try again.** Never save the late candidate. In `finally`, call `finish(request)`. Extend the server error JSON boundary so stable error codes reach the browser without leaking provider details:

```js
const body = { ok: false, error: error.message };
if (typeof error.code === "string") body.code = error.code;
if (Array.isArray(error.errors)) body.errors = error.errors;
sendJson(res, error.statusCode || 500, body);
```

- [ ] **Step 5: Add integration tests**

Inject a fake provider service into `createWorkbenchServer`. Test successful generation creates `ai-draft-theme.json` and comparison markers; invalid candidates do not replace an existing draft; missing/mismatched baseline metadata returns 409 before provider invocation; a delayed response after a new manual cycle cannot save; cancellation does not alter baseline, accepted theme, selection, or draft.

- [ ] **Step 6: Run server and selection tests**

Run: `node --test tests/suggestion-coordinator.test.js tests/server.test.js tests/selection-server.test.js`

Expected: PASS.

- [ ] **Step 7: Commit snapshot-bound AI generation**

```bash
git add workbench/ai/suggestion-coordinator.js workbench/server.js tests/suggestion-coordinator.test.js tests/server.test.js tests/selection-server.test.js package.json
git commit -m "feat: bind AI suggestions to reviewed snapshots"
```

### Task 6: Add pure browser AI refinement state

**Files:**
- Create: `workbench/public/ai-refinement-state.js`
- Create: `tests/ai-refinement-state.test.js`
- Modify: `workbench/public/index.html`
- Modify: `package.json`

- [ ] **Step 1: Write failing browser-state tests**

Test states `idle`, `connecting`, `ready`, `preparing`, `generating`, `checking`, `failed`, and `cancelled`; ensure request tokens reject late success; ensure error codes map to the exact plain-language messages from the specification.

- [ ] **Step 2: Implement the UMD state module**

Expose `initialState()`, `transition(state, event)`, `isBusy(state)`, and `messageForError(error)`. Use monotonically increasing `requestToken` values and ignore `success`/`failure` events whose token does not equal the active token. Map:

```js
const ERROR_MESSAGES = Object.freeze({
  provider_unreachable: "We could not reach your AI provider. Check the connection and try again.",
  provider_key_rejected: "The provider did not accept this API key.",
  provider_quota: "The provider could not complete this request. Check your account usage or choose another provider.",
  provider_invalid_response: "The suggestion was not a valid BeamerForge design. Your original is unchanged. Try again or revise the request.",
  provider_invalid_theme: "The suggestion was not a valid BeamerForge design. Your original is unchanged. Try again or revise the request."
});
```

- [ ] **Step 3: Load the module before app.js and syntax-check it**

Add `<script src="/ai-refinement-state.js"></script>` after `selection-state.js` and before `app.js`. Add its `node --check` command.

- [ ] **Step 4: Run focused tests**

Run: `node --test tests/ai-refinement-state.test.js tests/public-ui.test.js && npm run check`

Expected: PASS.

- [ ] **Step 5: Commit browser AI state**

```bash
git add workbench/public/ai-refinement-state.js workbench/public/index.html tests/ai-refinement-state.test.js package.json
git commit -m "feat: model direct AI refinement states"
```

### Task 7: Replace the normal handoff interaction with direct generation

**Files:**
- Modify: `workbench/public/index.html`
- Modify: `workbench/public/app.js`
- Modify: `workbench/public/styles.css`
- Modify: `workbench/public/wizard-state.js`
- Modify: `tests/public-ui.test.js`
- Modify: `tests/wizard-state.test.js`

- [ ] **Step 1: Write failing normal-flow UI tests**

Assert the AI page contains prompt, optional files, **Create AI suggestion**, and a connection sheet with provider/key/Test connection. Assert the normal next path goes from `ai-customize` to `ai-compare`, never `ai-handoff` or `ai-import`. Assert raw JSON and handoff controls exist only in the Advanced region.

- [ ] **Step 2: Run UI and route tests and verify failure**

Run: `node --test tests/public-ui.test.js tests/wizard-state.test.js`

Expected: FAIL because the current action exports a handoff.

- [ ] **Step 3: Render the provider connection sheet**

Add a native `<dialog id="providerDialog">` with provider select, API key password field, Advanced disclosure for base URL/model, status text, Cancel, and Test connection. Never set the key from state or response. On success close the dialog and resume the queued `createAiSuggestion()` call.

- [ ] **Step 4: Submit direct suggestions with cancellation**

Replace `exportAiHandoff` as the normal action. Build multipart data with brief, baseline `cycleId`, `reviewRevision`, and `manualThemeHash`, plus validated files/relative paths. Use a browser `AbortController`; show the staged status panel; Cancel aborts the browser request and posts `/api/ai/cancel`. On success call `selectionState.invalidateForReviewMutation`, `loadAiComparison(result)`, and navigate to `ai-compare`.

- [ ] **Step 5: Keep the prompt and original state on every error**

Store the brief in browser state and do not clear file inputs, baseline, accepted theme, or comparison on connection/provider/validation errors. Render `messageForError` and a single **Try again** action. Put structured diagnostics under a Details disclosure, excluding keys, headers, request bodies, and provider response bodies.

- [ ] **Step 6: Update comparison labels and actions**

Change labels to **Your design** and **AI suggestion**. Actions are **Use AI suggestion**, **Keep my design**, and **Revise request**. Revise returns to `ai-customize` with the brief intact. On narrow screens, render a two-button before/after toggle while keeping both DOM previews labeled for accessibility.

- [ ] **Step 7: Run UI, state, and comparison tests**

Run: `node --test tests/public-ui.test.js tests/wizard-state.test.js tests/ai-refinement-state.test.js tests/selection-state.test.js tests/theme-diff.test.js`

Expected: PASS.

- [ ] **Step 8: Commit direct in-app refinement**

```bash
git add workbench/public/index.html workbench/public/app.js workbench/public/styles.css workbench/public/wizard-state.js tests/public-ui.test.js tests/wizard-state.test.js
git commit -m "feat: generate and compare AI suggestions in app"
```

### Task 8: Verify provider safety, duck removal, and the complete journey

**Files:**
- Modify: `tests/server.test.js`
- Modify: `tests/public-ui.test.js`
- Modify: `tests/resolved-design.test.js`
- Modify: `README.md`

- [ ] **Step 1: Add final regression tests**

Add tests that keys never appear in status JSON or captured application logs; switching providers clears the prior in-memory connection before testing the new one; a suggestion that changes `decorations.cornerLogo.id` from `duck` to `none` removes the active HTML and generated LaTeX logo while the manual baseline remains restorable; an invalid suggestion cannot change `theme.json`; the Advanced handoff import still passes the same comparison/acceptance gates.

- [ ] **Step 2: Run focused security and decoration tests**

Run: `node --test tests/provider-config.test.js tests/provider-service.test.js tests/server.test.js tests/selection-server.test.js tests/resolved-design.test.js tests/generator.test.js tests/project-writer.test.js`

Expected: PASS.

- [ ] **Step 3: Update user-facing repository documentation**

Document environment-variable alternatives (`OPENAI_API_KEY`, `DEEPSEEK_API_KEY`), state that keys otherwise live only for the server process, and keep Custom compatible endpoint details in an Advanced section. Explain that manual design and compilation require no AI provider.

- [ ] **Step 4: Run complete automated verification**

Run: `npm run check`

Expected: PASS.

Run: `npm test`

Expected: PASS with no failures.

Run: `npm run parity`

Expected: PASS for all registered renderer fixtures.

- [ ] **Step 5: Manually verify with mocked and real-provider-safe paths**

Using the injected fake provider, verify:

1. Manual review → Refine with AI.
2. No connection → connection sheet → successful test → automatic continuation.
3. Prompt remains visible during Preparing, Creating, and Checking.
4. Compare → Keep my design → build uses manual hash.
5. Revise → new suggestion → Use AI suggestion → build uses AI hash.
6. Cancel and simulated 401/429/network/invalid JSON preserve the original.
7. DeepSeek provider uses its official base URL and model list without exposing model IDs in the creative workflow.
8. Advanced handoff remains functional but absent from normal progress.

For a real provider smoke test, use a temporary low-quota key supplied through an environment variable; do not record the key or provider response body.

- [ ] **Step 6: Commit final verification and docs**

```bash
git add tests/server.test.js tests/public-ui.test.js tests/resolved-design.test.js README.md
git commit -m "test: verify safe provider-neutral AI workflow"
```
