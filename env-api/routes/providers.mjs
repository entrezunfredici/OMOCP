import { Router } from "express";
import {
  readAIProviders, writeAIProviders,
  updateOpenClawProvider, removeOpenClawProvider,
  saveAIProviderSecret, deleteAIProviderSecret,
  readAuthProfiles, writeAuthProfiles,
  readProviderKeyring, writeProviderKeyring,
  saveProviderSecret,
  fetchProviderModels,
} from "../helpers/providers.mjs";
import { sdkProviders } from "../omocp_providers_bridge.mjs";

const router = Router();

router.get("/ai-providers/presets", async (_req, res) => {
  try {
    res.json(await sdkProviders("get_presets"));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get("/ai-providers", (_req, res) => {
  res.json({ ok: true, providers: readAIProviders() });
});

router.get("/ai-providers/models", async (req, res) => {
  try {
    const providerIds = req.query.provider_id ? [String(req.query.provider_id)] : undefined;
    const result = await sdkProviders("get_models", providerIds ? { provider_ids: providerIds } : {});
    if (!result.ok) {
      return res.status(500).json({ ok: false, error: result.error || "Unable to fetch provider models" });
    }

    const grouped = new Map();
    for (const model of result.models || []) {
      const providerId = String(model.provider_id || "").trim();
      const modelId = String(model.model_id || model.id || model.name || "").trim();
      if (!providerId || !modelId) continue;

      const fullId = modelId.startsWith(`${providerId}/`) ? modelId : `${providerId}/${modelId}`;
      const models = grouped.get(providerId) || [];
      models.push({ id: fullId, label: String(model.label || model.name || modelId) });
      grouped.set(providerId, models);
    }

    const configuredProviderIds = readAIProviders().map((p) => p.id);
    const providerOrder = providerIds || [
      ...configuredProviderIds,
      ...[...grouped.keys()].filter((providerId) => !configuredProviderIds.includes(providerId)),
    ];
    res.json({
      ok: true,
      source: "omocp_providers.get_ai_models_list",
      results: providerOrder.map((providerId) => ({
        provider_id: providerId,
        models: grouped.get(providerId) || [],
      })),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post("/providers/fetch", async (req, res) => {
  try {
    const { url, key } = req.body || {};
    if (!url) return res.status(400).json({ ok: false, error: "url requis" });
    const models = await fetchProviderModels(url, key || "");
    res.json({ ok: true, models });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post("/ai-provider", (req, res) => {
  try {
    const { id, name, url, api, api_key } = req.body || {};
    if (!id || !name || !url) return res.status(400).json({ ok: false, error: "id, name, url requis" });
    const providers = readAIProviders().filter((p) => p.id !== id);
    providers.push({ id, name, url, ...(api ? { api } : {}) });
    writeAIProviders(providers);
    if (typeof api_key === "string" && api_key.length > 0) {
      saveAIProviderSecret(id, api_key);
      const profileId = `${id}:default`;
      const authStore = readAuthProfiles();
      authStore.profiles[profileId] = { type: "api_key", provider: id, key: api_key };
      writeAuthProfiles(authStore);
      saveProviderSecret(profileId, api_key);
    }
    updateOpenClawProvider(id, { url, api, apiKey: typeof api_key === "string" && api_key.length > 0 ? api_key : undefined });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.delete("/ai-provider/:id", (req, res) => {
  try {
    const { id } = req.params;
    writeAIProviders(readAIProviders().filter((p) => p.id !== id));
    deleteAIProviderSecret(id);
    const profileId = `${id}:default`;
    const authStore = readAuthProfiles();
    delete authStore.profiles[profileId];
    writeAuthProfiles(authStore);
    const keyringStore = readProviderKeyring();
    if (keyringStore.services?.["model-provider"]) delete keyringStore.services["model-provider"][profileId];
    writeProviderKeyring(keyringStore);
    removeOpenClawProvider(id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
