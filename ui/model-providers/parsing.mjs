import { inferModelAlias, isPlainObject, normalizeAlias, normalizeBaseUrl, stripOuterQuotes } from "../utils.mjs";

function inferProviderIdFromUrl(url) {
  const normalized = normalizeBaseUrl(url).toLowerCase();
  if (normalized.includes("generativelanguage.googleapis.com")) return "google";
  if (normalized.includes("api.anthropic.com")) return "anthropic";
  if (normalized.includes("api.openai.com")) return "openai";
  if (normalized.includes("api.mistral.ai")) return "mistral";
  if (normalized.includes("openrouter.ai")) return "openrouter";
  if (normalized.includes("api.groq.com")) return "groq";
  if (normalized.includes("api.deepseek.com")) return "deepseek";
  if (normalized.includes(":11434") || normalized.includes("ollama")) return "ollama";

  try {
    const host = new URL(normalized).hostname;
    return normalizeAlias(host.replace(/^api\./, "").split(".")[0]) || "custom";
  } catch {
    return "custom";
  }
}

function inferProviderApi(provider) {
  if (provider.api) return String(provider.api).trim();
  if (provider.id === "google") return "google-generative-ai";
  if (provider.id === "anthropic") return "anthropic-messages";
  if (provider.id === "ollama") return "ollama";
  if (provider.id === "openai") return "openai-responses";
  return "openai-completions";
}

export function normalizeProviderEntry(entry, index) {
  if (!isPlainObject(entry) || entry.enabled === false) return null;

  const url = normalizeBaseUrl(entry.url || entry.baseUrl || entry.base_url);
  const explicitId = String(entry.id || entry.provider || entry.name || "").trim();
  const id = normalizeAlias(explicitId || inferProviderIdFromUrl(url) || `provider-${index + 1}`);
  if (!id) return null;

  return {
    ...entry,
    id,
    url,
    api: inferProviderApi({ ...entry, id }),
  };
}

export function parseProvidersConfig(rawValue) {
  const raw = stripOuterQuotes(rawValue);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(normalizeProviderEntry).filter(Boolean);
    if (isPlainObject(parsed)) {
      return Object.entries(parsed)
        .map(([id, entry], index) => normalizeProviderEntry({ ...(isPlainObject(entry) ? entry : {}), id }, index))
        .filter(Boolean);
    }
  } catch (error) {
    console.warn("[bootstrap] Cannot parse OPENCLAW_PROVIDERS:", error.message);
  }

  return [];
}

export function parseModelCatalogValue(modelCatalog) {
  const entries = [];

  function addModel(model, alias) {
    const id = String(model || "").trim();
    if (!id) return;
    entries.push({
      id,
      alias: String(alias || inferModelAlias(id)).trim(),
    });
  }

  if (!modelCatalog) return entries;

  try {
    const parsed = JSON.parse(modelCatalog);
    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        if (typeof entry === "string") addModel(entry);
        else if (isPlainObject(entry)) addModel(entry.id || entry.model, entry.alias || entry.name);
      }
    } else if (isPlainObject(parsed)) {
      for (const [alias, model] of Object.entries(parsed)) addModel(model, alias);
    }
  } catch {
    for (const entry of modelCatalog.split(",")) {
      const value = entry.trim();
      if (!value) continue;

      const separatorIndex = value.indexOf("=");
      if (separatorIndex > 0) {
        addModel(value.slice(separatorIndex + 1), value.slice(0, separatorIndex));
      } else {
        addModel(value);
      }
    }
  }

  return entries;
}
