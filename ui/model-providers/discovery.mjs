import { asArray, isPlainObject } from "../utils.mjs";
import { resolveProviderCredential } from "./credentials.mjs";
import { buildProviderConfig, normalizeFetchedModel, resolveProviderModels } from "./fetch.mjs";
import { parseProvidersConfig } from "./parsing.mjs";
import { readSdkProviderCatalog } from "./sdk-catalog.mjs";

async function discoverSdkProviderCatalog({ authProfileState, config, env, providerKeyringPath, timeoutMs }) {
  const sdkCatalog = await readSdkProviderCatalog(env, timeoutMs);
  if (sdkCatalog === null) return null;

  const modelsByProvider = new Map();
  for (const model of sdkCatalog.models) {
    const providerId = String(model.provider_id || "").trim();
    const modelId = String(model.model_id || model.id || model.name || "").trim();
    if (!providerId || !modelId) continue;
    const models = modelsByProvider.get(providerId) || [];
    models.push({
      id: modelId,
      name: model.label || model.name || modelId,
      alias: model.alias,
    });
    modelsByProvider.set(providerId, models);
  }

  const discovered = [];
  for (const provider of sdkCatalog.providers) {
    const credential = resolveProviderCredential({
      authProfileState,
      config,
      env,
      provider,
      providerKeyringPath,
    });
    const models = asArray(modelsByProvider.get(provider.id))
      .map((model) => normalizeFetchedModel(provider, model))
      .filter(Boolean);
    if (models.length === 0) continue;

    discovered.push({
      provider,
      models,
      config: buildProviderConfig(provider, credential, models),
    });
  }

  return discovered;
}

export async function discoverProviderCatalog({ authProfileState, config, env, providersConfig, providerKeyringPath, timeoutMs }) {
  const sdkDiscovered = await discoverSdkProviderCatalog({
    authProfileState,
    config,
    env,
    providerKeyringPath,
    timeoutMs,
  });
  if (sdkDiscovered !== null) return sdkDiscovered;

  const providers = parseProvidersConfig(providersConfig);
  const discovered = [];

  for (const provider of providers) {
    const credential = resolveProviderCredential({
      authProfileState,
      config,
      env,
      provider,
      providerKeyringPath,
    });
    const models = await resolveProviderModels(provider, credential, timeoutMs);
    if (models.length === 0) continue;
    discovered.push({
      provider,
      models,
      config: buildProviderConfig(provider, credential, models),
    });
  }

  return discovered;
}

export function configureDiscoveredProviders(config, discoveredProviders) {
  if (discoveredProviders.length === 0) return;

  config.models = config.models || {};
  config.models.mode = config.models.mode || "merge";
  config.models.providers = config.models.providers || {};

  for (const discovered of discoveredProviders) {
    const existing = isPlainObject(config.models.providers[discovered.provider.id])
      ? config.models.providers[discovered.provider.id]
      : {};
    config.models.providers[discovered.provider.id] = {
      ...existing,
      ...discovered.config,
    };
  }
}
