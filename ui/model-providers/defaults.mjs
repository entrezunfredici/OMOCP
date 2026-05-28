import { inferModelAlias, isPlainObject } from "../utils.mjs";

export function addInstalledOllamaModelEntries(modelEntries, installedOllamaModels) {
  for (const modelName of installedOllamaModels) {
    const modelId = modelName.startsWith("ollama/") ? modelName : `ollama/${modelName}`;
    if (!modelEntries.some((entry) => entry.id === modelId)) {
      modelEntries.push({
        id: modelId,
        alias: inferModelAlias(modelId),
      });
    }
  }
}

export function addConfiguredOllamaModelEntry(modelEntries, { ollamaModelAlias, ollamaModelName, installedOllamaModels }) {
  if (!ollamaModelName || !installedOllamaModels.includes(ollamaModelName)) return;

  const modelId = ollamaModelName.startsWith("ollama/")
    ? ollamaModelName
    : `ollama/${ollamaModelName}`;
  if (!modelEntries.some((entry) => entry.id === modelId)) {
    modelEntries.push({
      id: modelId,
      alias: String(ollamaModelAlias || inferModelAlias(modelId)).trim(),
    });
  }
}

export function configureDefaultAgentModel(config, modelEntries, defaultModel) {
  config.agents = config.agents || {};
  config.agents.defaults = config.agents.defaults || {};
  config.agents.defaults.models = {};

  for (const { id, alias } of modelEntries) {
    config.agents.defaults.models[id] = {
      ...(alias ? { alias } : {}),
    };
  }

  if (defaultModel) {
    config.agents.defaults.model = {
      ...(isPlainObject(config.agents.defaults.model) ? config.agents.defaults.model : {}),
      primary: defaultModel,
    };
  } else if (isPlainObject(config.agents.defaults.model)) {
    delete config.agents.defaults.model.primary;
  }
}

export function resolveDefaultModel(configuredDefaultModel, modelEntries, fallbackModel) {
  if (configuredDefaultModel) return configuredDefaultModel;
  const preferredPatterns = [
    /\/gpt-5/i,
    /\/gpt-4\.1/i,
    /\/gpt-4o(?!.*(?:audio|realtime))/i,
    /\/o4/i,
    /\/o3/i,
    /\/claude.*sonnet/i,
    /\/gemini.*flash/i,
    /\/gpt-4/i,
    /\/gpt-3\.5/i,
  ];
  const preferred =
    preferredPatterns
      .map((pattern) => modelEntries.find((entry) => pattern.test(entry.id)))
      .find(Boolean) || modelEntries[0];
  return preferred?.id || "";
}
