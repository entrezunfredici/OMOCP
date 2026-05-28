import {
  defaultAuthProfilesPath,
  defaultProviderKeyringPath,
  pruneUnavailableEnvAuthProfiles,
  readAuthProfileStore,
  removeAuthProfileMetadata,
  writeAuthProfileStore,
} from "./auth-profiles.mjs";
import { inferModelAlias, uniqueBy } from "./utils.mjs";
import { DEFAULT_FETCH_TIMEOUT_MS } from "./model-providers/constants.mjs";
import {
  addConfiguredOllamaModelEntry,
  addInstalledOllamaModelEntries,
  configureDefaultAgentModel,
  resolveDefaultModel,
} from "./model-providers/defaults.mjs";
import { configureDiscoveredProviders, discoverProviderCatalog } from "./model-providers/discovery.mjs";
import {
  configureLegacyOllamaProvider,
  filterUnavailableOllamaCatalogModels,
  listInstalledOllamaModels,
} from "./model-providers/ollama.mjs";
import { parseModelCatalogValue } from "./model-providers/parsing.mjs";

export async function configureModelProviders(config, options) {
  const {
    defaultModel,
    fallbackDefaultModel,
    modelCatalog,
    authProfilesPath = defaultAuthProfilesPath,
    providerKeyringPath = defaultProviderKeyringPath,
    ollamaApiKey,
    ollamaBaseUrl,
    ollamaModelAlias,
    ollamaModelName,
    openClawProviders,
    providerFetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
    env = process.env,
  } = options;

  const authProfileState = {
    store: readAuthProfileStore(authProfilesPath),
    changed: false,
  };
  const prunedProfiles = pruneUnavailableEnvAuthProfiles(authProfileState.store, env);
  if (prunedProfiles.removedProfileIds.length > 0) {
    authProfileState.store = prunedProfiles.store;
    authProfileState.changed = true;
    removeAuthProfileMetadata(config, prunedProfiles.removedProfileIds);
  }

  const staticModels = parseModelCatalogValue(modelCatalog);
  const installedOllamaModels = await listInstalledOllamaModels(ollamaBaseUrl, providerFetchTimeoutMs, env);
  const discoveredProviders = await discoverProviderCatalog({
    authProfileState,
    config,
    env,
    providersConfig: openClawProviders,
    providerKeyringPath,
    timeoutMs: providerFetchTimeoutMs,
  });
  const discoveredModels = discoveredProviders.flatMap((entry) => entry.models);
  const modelEntries = uniqueBy(
    [
      ...filterUnavailableOllamaCatalogModels(staticModels, installedOllamaModels),
      ...discoveredModels.map((model) => ({ id: model.id, alias: model.alias })),
    ],
    (entry) => entry.id,
  );

  addInstalledOllamaModelEntries(modelEntries, installedOllamaModels);
  addConfiguredOllamaModelEntry(modelEntries, {
    ollamaModelAlias,
    ollamaModelName,
    installedOllamaModels,
  });

  const resolvedDefaultModel = resolveDefaultModel(defaultModel, modelEntries, fallbackDefaultModel);
  if (resolvedDefaultModel && !modelEntries.some((entry) => entry.id === resolvedDefaultModel)) {
    modelEntries.push({
      id: resolvedDefaultModel,
      alias: inferModelAlias(resolvedDefaultModel),
    });
  }

  configureDiscoveredProviders(config, discoveredProviders);
  configureLegacyOllamaProvider(config, {
    authProfileState,
    env,
    providerKeyringPath,
    ollamaApiKey,
    ollamaBaseUrl,
    modelEntries,
    installedOllamaModels,
  });
  configureDefaultAgentModel(config, modelEntries, resolvedDefaultModel);

  if (authProfileState.changed) {
    writeAuthProfileStore(authProfileState.store, authProfilesPath);
  }

  return {
    defaultModel: resolvedDefaultModel,
    discoveredProviders,
    modelEntries,
  };
}
