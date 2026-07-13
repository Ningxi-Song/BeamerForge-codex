"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createProviderService } = require("../workbench/ai/provider-service");

test("connect lists models, chooses an available model, and redacts the key", async () => {
  const calls = [];
  const service = createProviderService({
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({
        data: [{ id: "model-a" }, { id: "model-b" }]
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });

  const status = await service.connect({
    provider: "deepseek",
    apiKey: "secret",
    model: "model-b"
  });
  assert.equal(status.model, "model-b");
  assert.deepEqual(status.models, [{ id: "model-a" }, { id: "model-b" }]);
  assert.equal(JSON.stringify(status).includes("secret"), false);
  assert.equal(calls[0].url, "https://api.deepseek.com/models");
  assert.equal(calls[0].init.headers.authorization, "Bearer secret");
  assert.equal(JSON.stringify(service.status()).includes("secret"), false);
});

test("connect can use an environment key and falls back to the first model", async () => {
  const service = createProviderService({
    env: { OPENAI_API_KEY: "environment-secret" },
    fetchImpl: async (_url, init) => {
      assert.equal(init.headers.authorization, "Bearer environment-secret");
      return new Response(JSON.stringify({ data: [{ id: "first-model" }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });

  const status = await service.connect({ provider: "openai" });
  assert.equal(status.model, "first-model");
  assert.equal(JSON.stringify(status).includes("environment-secret"), false);
});

test("provider failures become stable error codes", async () => {
  const cases = [
    [401, "provider_key_rejected"],
    [403, "provider_key_rejected"],
    [429, "provider_quota"],
    [500, "provider_failure"]
  ];
  for (const [status, code] of cases) {
    const service = createProviderService({
      fetchImpl: async () => new Response("{}", { status })
    });
    await assert.rejects(
      () => service.connect({ provider: "openai", apiKey: "bad", model: "m" }),
      (error) => error.code === code
    );
  }
});

test("network failures are stable and do not retain the failed connection", async () => {
  const service = createProviderService({
    fetchImpl: async () => { throw new TypeError("socket details must not escape"); }
  });
  await assert.rejects(
    () => service.connect({ provider: "deepseek", apiKey: "secret", model: "m" }),
    (error) => error.code === "provider_unreachable"
      && error.statusCode === 502
      && !error.message.includes("socket")
      && !JSON.stringify(error).includes("secret")
  );
  assert.deepEqual(service.status(), { connected: false });
});

test("disconnect clears status and completion requires a connection", async () => {
  const service = createProviderService({
    fetchImpl: async () => new Response(JSON.stringify({ data: [{ id: "m" }] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    })
  });
  await service.connect({ provider: "openai", apiKey: "secret", model: "m" });
  assert.equal(service.disconnect(), true);
  assert.deepEqual(service.status(), { connected: false });
  assert.equal(service.disconnect(), false);
  await assert.rejects(
    () => service.complete({ messages: [] }),
    (error) => error.code === "provider_not_connected" && error.statusCode === 409
  );
});

test("complete sends a non-streaming JSON request and returns text content", async () => {
  const calls = [];
  const service = createProviderService({
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith("/models")) {
        return new Response(JSON.stringify({ data: [{ id: "m" }] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response(JSON.stringify({
        choices: [{ message: { content: "{\"version\":1}" } }]
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });
  await service.connect({ provider: "openai", apiKey: "secret", model: "m" });
  const content = await service.complete({ messages: [{ role: "user", content: "hi" }] });
  assert.equal(content, "{\"version\":1}");
  assert.equal(calls[1].url, "https://api.openai.com/v1/chat/completions");
  assert.equal(calls[1].init.headers.authorization, "Bearer secret");
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    model: "m",
    messages: [{ role: "user", content: "hi" }],
    stream: false,
    response_format: { type: "json_object" }
  });
});

test("complete rejects empty provider content with a stable error", async () => {
  const service = createProviderService({
    fetchImpl: async (url) => url.endsWith("/models")
      ? new Response(JSON.stringify({ data: [{ id: "m" }] }), { status: 200 })
      : new Response(JSON.stringify({ choices: [{ message: { content: "  " } }] }), { status: 200 })
  });
  await service.connect({ provider: "openai", apiKey: "secret", model: "m" });
  await assert.rejects(
    () => service.complete({ messages: [] }),
    (error) => error.code === "provider_invalid_response" && error.statusCode === 502
  );
});
