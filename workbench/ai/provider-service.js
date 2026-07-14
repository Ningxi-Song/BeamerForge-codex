"use strict";

const {
  automaticModel,
  capabilitiesForModel,
  normalizeConnection,
  publicConnection
} = require("./provider-config");

function codedError(message, code, statusCode, cause) {
  const error = Object.assign(new Error(message), { code, statusCode });
  if (cause) error.cause = cause;
  return error;
}

function providerError(status, cause) {
  const table = {
    401: ["provider_key_rejected", "The provider did not accept this API key"],
    403: ["provider_key_rejected", "The provider did not allow this API key"],
    429: ["provider_quota", "The provider could not complete this request because of account limits"]
  };
  const [code, message] = table[status]
    || ["provider_failure", "The AI provider could not complete this request"];
  return codedError(message, code, status === 429 ? 402 : 502, cause);
}

function unreachableError(cause) {
  return codedError(
    "We could not reach the AI provider",
    "provider_unreachable",
    502,
    cause
  );
}

function keyFromEnvironment(provider, env) {
  if (provider === "openai") return env.OPENAI_API_KEY || "";
  if (provider === "deepseek") return env.DEEPSEEK_API_KEY || "";
  return "";
}

function requestSignal() {
  return typeof AbortSignal?.timeout === "function"
    ? AbortSignal.timeout(15000)
    : undefined;
}

function createProviderService({ fetchImpl = fetch, env = process.env } = {}) {
  let connection = null;

  async function listModels(candidate) {
    let response;
    try {
      response = await fetchImpl(`${candidate.baseUrl}/models`, {
        method: "GET",
        headers: {
          authorization: `Bearer ${candidate.apiKey}`,
          accept: "application/json"
        },
        signal: requestSignal()
      });
    } catch (error) {
      throw unreachableError(error);
    }

    if (!response.ok) throw providerError(response.status);

    let body;
    try {
      body = await response.json();
    } catch (error) {
      throw codedError(
        "The provider returned an invalid model list",
        "provider_invalid_response",
        502,
        error
      );
    }
    return Array.isArray(body?.data)
      ? body.data
        .filter((model) => typeof model?.id === "string" && model.id.trim())
        .map((model) => ({ id: model.id }))
      : [];
  }

  async function connect(input) {
    connection = null;
    const provider = String(input?.provider || "").toLowerCase();
    const requested = {
      ...input,
      provider,
      apiKey: String(input?.apiKey || "").trim()
        || keyFromEnvironment(provider, env)
    };
    const candidate = normalizeConnection(requested);
    const models = await listModels(candidate);
    const selected = candidate.model || automaticModel(candidate.provider, models);
    if (!selected || !models.some(({ id }) => id === selected)) {
      throw codedError(
        candidate.model
          ? "Choose an available model"
          : "Open Advanced connection options and enter an available model",
        "provider_model_unavailable",
        400
      );
    }
    connection = {
      ...candidate,
      model: selected,
      capabilities: {
        modelList: true,
        ...capabilitiesForModel(candidate.provider, selected)
      }
    };
    return { ...publicConnection(connection), models };
  }

  function disconnect() {
    const existed = Boolean(connection);
    connection = null;
    return existed;
  }

  function status() {
    return publicConnection(connection);
  }

  async function complete({ messages, signal } = {}) {
    if (!connection) {
      throw codedError(
        "Connect an AI provider first",
        "provider_not_connected",
        409
      );
    }

    let response;
    try {
      response = await fetchImpl(`${connection.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${connection.apiKey}`,
          "content-type": "application/json",
          accept: "application/json"
        },
        body: JSON.stringify({
          model: connection.model,
          messages,
          stream: false,
          response_format: connection.capabilities.jsonOutput
            ? { type: "json_object" }
            : undefined
        }),
        signal
      });
    } catch (error) {
      throw unreachableError(error);
    }

    if (!response.ok) throw providerError(response.status);

    let body;
    try {
      body = await response.json();
    } catch (error) {
      throw codedError(
        "The provider returned an invalid suggestion",
        "provider_invalid_response",
        502,
        error
      );
    }
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw codedError(
        "The provider returned an empty suggestion",
        "provider_invalid_response",
        502
      );
    }
    return content;
  }

  return { connect, disconnect, status, complete };
}

module.exports = {
  createProviderService,
  keyFromEnvironment,
  providerError
};
