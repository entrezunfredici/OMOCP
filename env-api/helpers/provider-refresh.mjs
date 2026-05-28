import fs from "fs";
import path from "path";
import { GATEWAY_ENV_PATH, PROVIDER_REFRESH_INTERVAL_MS } from "../config.mjs";
import { readAIProviders } from "./providers.mjs";
import { sdkProviders } from "../omocp_providers_bridge.mjs";

function providerModelId(model) {
  const providerId = String(model.provider_id || "").trim();
  const modelId = String(model.model_id || model.id || model.name || "").trim();
  return providerId && modelId ? `${providerId}/${modelId}` : "";
}

async function buildProviderSignature() {
  const configuredProviders = readAIProviders()
    .map((provider) => ({
      id: String(provider.id || "").trim(),
      url: String(provider.url || "").trim(),
      api: String(provider.api || "").trim(),
    }));

  const result = await sdkProviders("get_models", {});
  if (!result.ok) throw new Error(result.error || "Unable to fetch provider models");

  const configuredProviderIds = new Set(configuredProviders.map((provider) => provider.id));
  const discoveredProviders = [];
  const models = (result.models || [])
    .map((model) => {
      const providerId = String(model.provider_id || "").trim();
      if (providerId && !configuredProviderIds.has(providerId)) {
        discoveredProviders.push({ id: providerId, url: "", api: "" });
        configuredProviderIds.add(providerId);
      }
      return providerModelId(model);
    })
    .filter(Boolean)
    .sort();

  const providers = [...configuredProviders, ...discoveredProviders]
    .sort((a, b) => a.id.localeCompare(b.id) || a.url.localeCompare(b.url));

  return JSON.stringify({ providers, models });
}

function triggerGatewayReload(reason) {
  const triggerPath = path.join(path.dirname(GATEWAY_ENV_PATH), ".gateway-reload");
  fs.writeFileSync(triggerPath, `${new Date().toISOString()} ${reason}\n`, { mode: 0o644 });
}

export function startProviderRefreshLoop() {
  if (!Number.isFinite(PROVIDER_REFRESH_INTERVAL_MS) || PROVIDER_REFRESH_INTERVAL_MS <= 0) {
    return;
  }

  let lastSignature = null;
  let inFlight = false;

  async function refreshProviders() {
    if (inFlight) return;
    inFlight = true;

    try {
      const nextSignature = await buildProviderSignature();
      if (lastSignature === null) {
        lastSignature = nextSignature;
        console.log(`[env-api] provider refresh enabled every ${PROVIDER_REFRESH_INTERVAL_MS}ms`);
        return;
      }

      if (nextSignature !== lastSignature) {
        lastSignature = nextSignature;
        triggerGatewayReload("provider-refresh");
        console.log("[env-api] provider catalog changed; gateway reload requested");
      }
    } catch (e) {
      console.warn("[env-api] provider refresh failed:", e.message);
    } finally {
      inFlight = false;
    }
  }

  const interval = setInterval(refreshProviders, PROVIDER_REFRESH_INTERVAL_MS);
  interval.unref?.();
  refreshProviders();
}
