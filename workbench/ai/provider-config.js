"use strict";

const PROVIDERS = Object.freeze({
  openai: Object.freeze({
    baseUrl: "https://api.openai.com/v1",
    capabilities: Object.freeze({ modelList: true, jsonOutput: true, imageInput: true })
  }),
  deepseek: Object.freeze({
    baseUrl: "https://api.deepseek.com",
    capabilities: Object.freeze({ modelList: true, jsonOutput: true, imageInput: false })
  }),
  custom: Object.freeze({
    baseUrl: null,
    capabilities: Object.freeze({ modelList: true, jsonOutput: true, imageInput: false })
  })
});

function clientError(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function cleanBaseUrl(value) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    throw clientError("Enter a valid compatible provider URL");
  }

  const loopback = ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw clientError("Custom providers must use HTTPS unless they run on this computer");
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function normalizeConnection(input) {
  const provider = String(input?.provider || "").toLowerCase();
  const definition = PROVIDERS[provider];
  if (!definition) {
    throw clientError("Choose OpenAI, DeepSeek, or a compatible provider");
  }

  const apiKey = String(input?.apiKey || "").trim();
  if (!apiKey) throw clientError("Enter an API key");

  const model = String(input?.model || "").trim() || null;
  const baseUrl = provider === "custom"
    ? cleanBaseUrl(input?.baseUrl)
    : definition.baseUrl;
  return {
    provider,
    apiKey,
    baseUrl,
    model,
    capabilities: { ...definition.capabilities }
  };
}

function publicConnection(connection) {
  if (!connection) return { connected: false };
  return {
    connected: true,
    provider: connection.provider,
    baseUrl: connection.baseUrl,
    model: connection.model,
    capabilities: { ...connection.capabilities }
  };
}

module.exports = {
  PROVIDERS,
  cleanBaseUrl,
  normalizeConnection,
  publicConnection
};
