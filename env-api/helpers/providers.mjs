import fs from "fs";
import path from "path";
import {
  AI_PROVIDERS_PATH,
  OPENCLAW_CONFIG_PATH,
  AUTH_PROFILES_PATH,
  PROVIDER_KEYRING_PATH,
} from "../config.mjs";
import { readOdooKeyring, writeOdooKeyring } from "./odoo.mjs";
import { validateProviderFetchUrl, fetchJson } from "./network.mjs";

export function readAIProviders() {
  try {
    if (fs.existsSync(AI_PROVIDERS_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(AI_PROVIDERS_PATH, "utf8"));
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch {}
  return [];
}

export function writeAIProviders(providers) {
  fs.mkdirSync(path.dirname(AI_PROVIDERS_PATH), { recursive: true });
  fs.writeFileSync(AI_PROVIDERS_PATH, JSON.stringify(providers, null, 2) + "\n", { mode: 0o600 });
}

export function updateOpenClawProvider(id, { url, api, apiKey }) {
  if (!fs.existsSync(OPENCLAW_CONFIG_PATH)) return;
  try {
    const config = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, "utf8"));
    config.models = config.models || {};
    config.models.mode = config.models.mode || "merge";
    config.models.providers = config.models.providers || {};
    const existing = config.models.providers[id] || {};
    config.models.providers[id] = {
      ...existing,
      ...(url ? { baseUrl: url } : {}),
      api: api || existing.api || "openai-completions",
      ...(apiKey ? { apiKey } : {}),
    };
    fs.writeFileSync(OPENCLAW_CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
  } catch (e) {
    console.error("[env-api] Cannot update openclaw.json provider:", e.message);
  }
}

export function removeOpenClawProvider(id) {
  if (!fs.existsSync(OPENCLAW_CONFIG_PATH)) return;
  try {
    const config = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, "utf8"));
    if (config.models?.providers?.[id] !== undefined) {
      delete config.models.providers[id];
      fs.writeFileSync(OPENCLAW_CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
    }
  } catch (e) {
    console.error("[env-api] Cannot remove openclaw.json provider:", e.message);
  }
}

export function readAIProviderSecret(id) {
  const service = readOdooKeyring().services?.["odoo-plugin"] || {};
  return service[`${id}.api_key`] || "";
}

export function saveAIProviderSecret(id, apiKey) {
  const store = readOdooKeyring();
  store.services = store.services || {};
  store.services["odoo-plugin"] = store.services["odoo-plugin"] || {};
  store.services["odoo-plugin"][`${id}.api_key`] = apiKey;
  writeOdooKeyring(store);
}

export function deleteAIProviderSecret(id) {
  const store = readOdooKeyring();
  const service = store.services?.["odoo-plugin"];
  if (service) delete service[`${id}.api_key`];
  writeOdooKeyring(store);
}

export function upsertById(items, item) {
  const next = items.filter((entry) => entry.id !== item.id);
  next.push(item);
  return next;
}

export function readAuthProfiles() {
  if (!fs.existsSync(AUTH_PROFILES_PATH)) return { version: 1, profiles: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(AUTH_PROFILES_PATH, "utf8"));
    if (!parsed || typeof parsed !== "object" || !parsed.profiles || typeof parsed.profiles !== "object") {
      return { version: 1, profiles: {} };
    }
    return { version: parsed.version || 1, ...parsed, profiles: { ...parsed.profiles } };
  } catch {
    return { version: 1, profiles: {} };
  }
}

export function writeAuthProfiles(store) {
  fs.mkdirSync(path.dirname(AUTH_PROFILES_PATH), { recursive: true });
  fs.writeFileSync(AUTH_PROFILES_PATH, JSON.stringify(store, null, 2) + "\n", { mode: 0o600 });
  fs.chmodSync(AUTH_PROFILES_PATH, 0o600);
}

export function readProviderKeyring() {
  if (!fs.existsSync(PROVIDER_KEYRING_PATH)) return { version: 1, services: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(PROVIDER_KEYRING_PATH, "utf8"));
    if (!parsed || typeof parsed !== "object") return { version: 1, services: {} };
    if (!parsed.services || typeof parsed.services !== "object") parsed.services = {};
    return parsed;
  } catch {
    return { version: 1, services: {} };
  }
}

export function writeProviderKeyring(store) {
  fs.mkdirSync(path.dirname(PROVIDER_KEYRING_PATH), { recursive: true });
  fs.writeFileSync(PROVIDER_KEYRING_PATH, JSON.stringify(store, null, 2) + "\n", { mode: 0o600 });
  fs.chmodSync(PROVIDER_KEYRING_PATH, 0o600);
}

export function saveProviderSecret(profileId, key) {
  const store = readProviderKeyring();
  store.services["model-provider"] = { ...(store.services["model-provider"] || {}), [profileId]: key };
  writeProviderKeyring(store);
}

export async function fetchProviderModels(url, key) {
  const trimmedUrl = await validateProviderFetchUrl(url);

  if (trimmedUrl.includes("generativelanguage.googleapis.com")) {
    const res = await fetchJson(`${trimmedUrl}/models?key=${encodeURIComponent(key)}&pageSize=100`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    return (d.models || [])
      .filter(
        (m) =>
          Array.isArray(m.supportedGenerationMethods) &&
          m.supportedGenerationMethods.includes("generateContent") &&
          m.name.includes("gemini")
      )
      .map((m) => ({
        id: "google/" + m.name.replace(/^models\//, ""),
        label: m.displayName || m.name,
      }));
  }

  if (trimmedUrl.includes("api.anthropic.com")) {
    const res = await fetchJson(`${trimmedUrl}/models`, {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    return (d.data || []).map((m) => ({
      id: "anthropic/" + m.id,
      label: m.display_name || m.id,
    }));
  }

  if (trimmedUrl.includes(":11434") || trimmedUrl.includes("ollama")) {
    const res = await fetchJson(`${trimmedUrl}/api/tags`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    return (d.models || []).map((m) => ({
      id: "ollama/" + m.name,
      label: m.name,
    }));
  }

  const headers = { "Content-Type": "application/json" };
  if (key) headers["Authorization"] = `Bearer ${key}`;
  const res = await fetchJson(`${trimmedUrl}/models`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  const items = d.data || d.models || [];
  return items.map((m) => ({ id: m.id || m.name, label: m.id || m.name }));
}
