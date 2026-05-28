import { resolveAuthProfileCredential } from "../auth-profiles.mjs";
import { DEFAULT_MAX_TOKENS, makeZeroCost } from "./constants.mjs";
import { toSecretEnvRef } from "./credentials.mjs";
import { fetchProviderModels } from "./fetch.mjs";

function ollamaContextWindow(env = process.env) {
  const value = Number.parseInt(env.OPENCLAW_OLLAMA_CONTEXT_WINDOW || "8192", 10);
  return Number.isFinite(value) && value > 0 ? value : 8192;
}

function buildOllamaModelConfig(modelName, env = process.env) {
  return {
    id: modelName,
    name: modelName,
    input: ["text"],
    cost: makeZeroCost(),
    contextWindow: ollamaContextWindow(env),
    maxTokens: DEFAULT_MAX_TOKENS,
  };
}

function parseToolCompatiblePatterns(env = process.env) {
  return String(env.OPENCLAW_OLLAMA_TOOL_MODEL_PATTERNS || "qwen3")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function isToolCompatibleOllamaModel(modelName, env = process.env) {
  const patterns = parseToolCompatiblePatterns(env);
  if (patterns.length === 0) return true;
  const normalized = String(modelName || "").toLowerCase();
  return patterns.some((pattern) => normalized.includes(pattern));
}

export async function listInstalledOllamaModels(ollamaBaseUrl, timeoutMs, env = process.env) {
  if (!ollamaBaseUrl) return [];
  try {
    const provider = { id: "ollama", url: ollamaBaseUrl, api: "ollama" };
    const models = await fetchProviderModels(provider, "", timeoutMs);
    return models
      .map((model) => model.localId)
      .filter(Boolean)
      .filter((modelName) => isToolCompatibleOllamaModel(modelName, env));
  } catch (error) {
    console.warn("[bootstrap] Cannot list installed Ollama models:", error.message);
    return [];
  }
}

export function filterUnavailableOllamaCatalogModels(modelEntries, installedOllamaModels) {
  if (installedOllamaModels.length === 0) {
    return modelEntries.filter((entry) => !String(entry.id || "").startsWith("ollama/"));
  }

  const installed = new Set(installedOllamaModels);
  return modelEntries.filter((entry) => {
    const id = String(entry.id || "");
    if (!id.startsWith("ollama/")) return true;
    return installed.has(id.slice("ollama/".length));
  });
}

export function configureLegacyOllamaProvider(
  config,
  { authProfileState, env, providerKeyringPath, ollamaBaseUrl, ollamaApiKey, modelEntries, installedOllamaModels },
) {
  const ollamaModelNames = [
    ...installedOllamaModels,
    ...modelEntries
      .map((entry) => entry.id)
      .filter((id) => id.startsWith("ollama/"))
      .map((id) => id.slice("ollama/".length).trim()),
  ].filter(Boolean);

  if (!ollamaBaseUrl && !ollamaApiKey && ollamaModelNames.length === 0) return;

  config.models = config.models || {};
  config.models.mode = config.models.mode || "merge";
  config.models.providers = config.models.providers || {};

  const existingProvider = config.models.providers.ollama || {};
  const existingModels = Array.isArray(existingProvider.models) ? existingProvider.models : [];
  const installed = new Set(installedOllamaModels);
  const nextModels = existingModels.filter((model) => {
    const modelName = typeof model === "string" ? model : model?.id || model?.name;
    return installed.has(modelName);
  }).map((model) => {
    if (typeof model === "string") return buildOllamaModelConfig(model, env);
    return {
      ...model,
      contextWindow: ollamaContextWindow(env),
      maxTokens: Number(model.maxTokens) || DEFAULT_MAX_TOKENS,
    };
  });
  const seen = new Set(
    existingModels
      .map((model) => (typeof model === "string" ? model : model?.id || model?.name))
      .filter(Boolean),
  );

  for (const modelName of new Set(ollamaModelNames)) {
    if (seen.has(modelName)) continue;
    nextModels.push(buildOllamaModelConfig(modelName, env));
    seen.add(modelName);
  }

  const hasAuthProfile = Boolean(resolveAuthProfileCredential(authProfileState.store, "ollama", env, providerKeyringPath));
  const nextProvider = {
    ...existingProvider,
    ...(ollamaBaseUrl ? { baseUrl: ollamaBaseUrl } : {}),
    api: existingProvider.api || "ollama",
    models: nextModels,
  };

  if (hasAuthProfile) nextProvider.apiKey = undefined;
  else if (ollamaApiKey) nextProvider.apiKey = toSecretEnvRef("OLLAMA_API_KEY");

  config.models.providers.ollama = nextProvider;
}
