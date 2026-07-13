"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeConnection,
  publicConnection
} = require("../workbench/ai/provider-config");

test("normalizes supported providers without exposing secrets", () => {
  const openai = normalizeConnection({
    provider: "openai",
    apiKey: "sk-test",
    model: "model-a"
  });
  assert.equal(openai.baseUrl, "https://api.openai.com/v1");

  const deepseek = normalizeConnection({
    provider: "deepseek",
    apiKey: "ds-test",
    model: "model-b"
  });
  assert.equal(deepseek.baseUrl, "https://api.deepseek.com");
  assert.deepEqual(publicConnection(deepseek), {
    connected: true,
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com",
    model: "model-b",
    capabilities: { modelList: true, jsonOutput: true, imageInput: false }
  });
  assert.equal(JSON.stringify(publicConnection(openai)).includes("sk-test"), false);
});

test("custom endpoints require HTTPS except loopback local models", () => {
  assert.throws(
    () => normalizeConnection({
      provider: "custom",
      apiKey: "x",
      model: "m",
      baseUrl: "http://example.com"
    }),
    /HTTPS/
  );
  assert.equal(
    normalizeConnection({
      provider: "custom",
      apiKey: "x",
      model: "m",
      baseUrl: "http://127.0.0.1:11434/v1"
    }).baseUrl,
    "http://127.0.0.1:11434/v1"
  );
});

test("rejects missing keys and unknown providers with client-safe errors", () => {
  assert.throws(
    () => normalizeConnection({ provider: "openai", model: "model-a" }),
    (error) => error.statusCode === 400 && /API key/.test(error.message)
  );
  assert.throws(
    () => normalizeConnection({ provider: "other", apiKey: "x", model: "m" }),
    (error) => error.statusCode === 400 && /OpenAI/.test(error.message)
  );
});
