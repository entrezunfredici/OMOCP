import { asArray, inferModelAlias, isPlainObject, normalizeAlias, normalizeBaseUrl, uniqueBy } from "../utils.mjs";
import { DEFAULT_CONTEXT_WINDOW, DEFAULT_FETCH_TIMEOUT_MS, DEFAULT_MAX_TOKENS, makeZeroCost } from "./constants.mjs";

async function fetchJson(url, { timeoutMs, ...options } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs || DEFAULT_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function localModelId(providerId, modelId) {
  const raw = String(modelId || "").trim();
  const prefix = `${providerId}/`;
  return raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
}

function fullModelId(providerId, modelId) {
  const localId = localModelId(providerId, modelId);
  return `${providerId}/${localId}`;
}

export function normalizeFetchedModel(provider, model) {
  const rawId = String(model.id || model.name || "").trim();
  if (!rawId) return null;
  const localId = localModelId(provider.id, rawId);
  const id = fullModelId(provider.id, localId);
  return {
    id,
    localId,
    name: String(model.label || model.displayName || model.name || localId).trim(),
    alias: normalizeAlias(model.alias || inferModelAlias(id)),
  };
}

function normalizeManualModels(provider) {
  return [
    ...asArray(provider.models),
    ...asArray(provider.selected),
  ]
    .map((entry) => {
      if (typeof entry === "string") return normalizeFetchedModel(provider, { id: entry });
      if (isPlainObject(entry)) return normalizeFetchedModel(provider, entry);
      return null;
    })
    .filter(Boolean);
}

export async function fetchProviderModels(provider, discoveryApiKey, timeoutMs) {
  const url = normalizeBaseUrl(provider.url);
  if (!url) return [];

  if (provider.id === "google" || url.includes("generativelanguage.googleapis.com")) {
    if (!discoveryApiKey) return [];
    const data = await fetchJson(
      `${url}/models?key=${encodeURIComponent(discoveryApiKey)}&pageSize=100`,
      { timeoutMs },
    );
    return asArray(data.models)
      .filter(
        (model) =>
          Array.isArray(model.supportedGenerationMethods) &&
          model.supportedGenerationMethods.includes("generateContent") &&
          String(model.name || "").includes("gemini"),
      )
      .map((model) =>
        normalizeFetchedModel(provider, {
          id: model.name.replace(/^models\//, ""),
          name: model.displayName || model.name,
        }),
      )
      .filter(Boolean);
  }

  if (provider.id === "anthropic" || url.includes("api.anthropic.com")) {
    if (!discoveryApiKey) return [];
    const data = await fetchJson(`${url}/models`, {
      timeoutMs,
      headers: {
        "x-api-key": discoveryApiKey,
        "anthropic-version": "2023-06-01",
      },
    });
    return asArray(data.data)
      .map((model) =>
        normalizeFetchedModel(provider, {
          id: model.id,
          name: model.display_name || model.id,
        }),
      )
      .filter(Boolean);
  }

  if (provider.id === "ollama" || url.includes(":11434") || url.includes("ollama")) {
    const data = await fetchJson(`${url}/api/tags`, { timeoutMs });
    return asArray(data.models)
      .map((model) => normalizeFetchedModel(provider, { id: model.name, name: model.name }))
      .filter(Boolean);
  }

  if (!discoveryApiKey) return [];

  const headers = { "Content-Type": "application/json" };
  if (discoveryApiKey) headers.Authorization = `Bearer ${discoveryApiKey}`;
  const data = await fetchJson(`${url}/models`, { timeoutMs, headers });
  return asArray(data.data || data.models)
    .map((model) =>
      normalizeFetchedModel(provider, {
        id: model.id || model.name,
        name: model.display_name || model.name || model.id,
      }),
    )
    .filter(Boolean);
}

export async function resolveProviderModels(provider, credential, timeoutMs) {
  const manualModels = normalizeManualModels(provider);
  let fetchedModels = [];

  if (provider.discover !== false && provider.fetch !== false && provider.url) {
    try {
      fetchedModels = await fetchProviderModels(provider, credential.discoveryApiKey, timeoutMs);
    } catch (error) {
      console.warn(`[bootstrap] Cannot fetch models for provider '${provider.id}':`, error.message);
    }
  }

  return uniqueBy([...manualModels, ...fetchedModels], (model) => model.id);
}

function buildProviderModelConfig(provider, model) {
  const entry = {
    id: model.localId,
    name: model.name || model.localId,
  };

  if (provider.api === "ollama" || provider.api === "openai-completions" || provider.api === "openai-responses") {
    entry.reasoning = false;
    entry.input = ["text"];
    entry.cost = makeZeroCost();
    entry.contextWindow = Number(provider.contextWindow) || DEFAULT_CONTEXT_WINDOW;
    entry.maxTokens = Number(provider.maxTokens) || DEFAULT_MAX_TOKENS;
  }

  return entry;
}

export function buildProviderConfig(provider, credential, models) {
  const next = {
    ...(provider.url ? { baseUrl: provider.url } : {}),
    api: provider.api,
    apiKey: credential.configApiKey,
    models: models.map((model) => buildProviderModelConfig(provider, model)),
  };

  if (isPlainObject(provider.headers)) next.headers = provider.headers;
  if (isPlainObject(provider.request)) next.request = provider.request;
  if (provider.auth) next.auth = provider.auth;
  if (typeof provider.authHeader === "boolean") next.authHeader = provider.authHeader;

  return next;
}
