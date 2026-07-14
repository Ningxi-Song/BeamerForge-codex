"use strict";

const PROVIDERS = Object.freeze({
  openai: Object.freeze({
    baseUrl: "https://api.openai.com/v1",
    capabilities: Object.freeze({ modelList: true })
  }),
  deepseek: Object.freeze({
    baseUrl: "https://api.deepseek.com",
    capabilities: Object.freeze({ modelList: true })
  }),
  custom: Object.freeze({
    baseUrl: null,
    capabilities: Object.freeze({ modelList: true })
  })
});

function capabilitiesForModel(provider, model) {
  const id = String(model || "").trim().toLowerCase();
  if (provider === "deepseek") {
    return { jsonOutput: id === "deepseek-chat", imageInput: false };
  }
  if (provider === "openai") {
    const jsonOutput = /^gpt-(?!image(?:-|$)|audio(?:-|$)|realtime(?:-|$))/.test(id)
      || /^o[134](?:-|$)/.test(id);
    const imageInput = /^gpt-(?:4o|4\.1|5(?:\.\d+)?)(?:-|$)/.test(id);
    return { jsonOutput, imageInput };
  }
  return { jsonOutput: false, imageInput: false };
}

function automaticModel(provider, models = []) {
  const ids = new Set(models.map(({ id }) => id));
  if (provider === "deepseek") {
    return ids.has("deepseek-chat") ? "deepseek-chat" : null;
  }
  if (provider !== "openai") return null;
  const preferred = [
    "gpt-4.1-mini", "gpt-4o-mini", "gpt-4.1",
    "gpt-4o", "gpt-5-mini", "gpt-5"
  ];
  return preferred.find((id) => ids.has(id))
    || models.find(({ id }) => capabilitiesForModel(provider, id).jsonOutput)?.id
    || null;
}

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
    capabilities: {
      ...definition.capabilities,
      ...capabilitiesForModel(provider, model)
    }
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
  automaticModel,
  capabilitiesForModel,
  cleanBaseUrl,
  normalizeConnection,
  publicConnection
};
