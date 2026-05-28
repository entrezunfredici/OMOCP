import fs from "node:fs";
import path from "node:path";
import { isPlainObject } from "./utils.mjs";

export const defaultAuthProfilesPath = "/home/node/.openclaw/agents/main/agent/auth-profiles.json";
export const defaultProviderKeyringPath = "/home/node/.openclaw/provider-keyring.json";

function emptyStore() {
  return {
    version: 1,
    profiles: {},
  };
}

function cloneStore(store) {
  return {
    ...store,
    profiles: { ...(store.profiles || {}) },
  };
}

function normalizeProvider(value) {
  return String(value || "").trim();
}

function readProviderKeyring(keyringPath = defaultProviderKeyringPath) {
  if (!fs.existsSync(keyringPath)) return { version: 1, services: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(keyringPath, "utf8"));
    if (!isPlainObject(parsed)) return { version: 1, services: {} };
    if (!isPlainObject(parsed.services)) parsed.services = {};
    return parsed;
  } catch (error) {
    console.warn("[bootstrap] Cannot read provider keyring:", error.message);
    return { version: 1, services: {} };
  }
}

function resolveKeyringSecret(keyRef, keyringPath = defaultProviderKeyringPath) {
  if (!isPlainObject(keyRef) || keyRef.source !== "keyring") return "";
  const serviceName = String(keyRef.service || "model-provider").trim();
  const id = String(keyRef.id || "").trim();
  if (!serviceName || !id) return "";

  const service = readProviderKeyring(keyringPath).services?.[serviceName];
  if (!isPlainObject(service)) return "";
  const secret = service[id];
  return typeof secret === "string" ? secret.trim() : "";
}

export function readAuthProfileStore(authProfilesPath = defaultAuthProfilesPath) {
  if (!fs.existsSync(authProfilesPath)) return emptyStore();

  try {
    const parsed = JSON.parse(fs.readFileSync(authProfilesPath, "utf8"));
    if (!isPlainObject(parsed) || !isPlainObject(parsed.profiles)) return emptyStore();
    return {
      version: Number(parsed.version || 1),
      ...parsed,
      profiles: { ...parsed.profiles },
    };
  } catch (error) {
    console.warn("[bootstrap] Cannot read auth profiles:", error.message);
    return emptyStore();
  }
}

export function writeAuthProfileStore(store, authProfilesPath = defaultAuthProfilesPath) {
  fs.mkdirSync(path.dirname(authProfilesPath), { recursive: true });
  fs.writeFileSync(authProfilesPath, JSON.stringify(store, null, 2) + "\n", { mode: 0o600 });
  fs.chmodSync(authProfilesPath, 0o600);
}

export function listProviderProfiles(store, providerId) {
  const provider = normalizeProvider(providerId);
  return Object.entries(store?.profiles || {}).filter(([, credential]) => {
    return isPlainObject(credential) && normalizeProvider(credential.provider) === provider;
  });
}

export function resolveAuthProfileCredential(store, providerId, env = process.env, keyringPath = defaultProviderKeyringPath) {
  for (const [profileId, credential] of listProviderProfiles(store, providerId)) {
    if (credential.type !== "api_key") continue;

    if (typeof credential.key === "string" && credential.key.trim()) {
      return {
        profileId,
        discoveryApiKey: credential.key.trim(),
      };
    }

    const keyRef = credential.keyRef;
    if (isPlainObject(keyRef) && keyRef.source === "keyring") {
      const discoveryApiKey = resolveKeyringSecret(keyRef, keyringPath);
      if (!discoveryApiKey) continue;

      return {
        profileId,
        discoveryApiKey,
      };
    }

    if (
      isPlainObject(keyRef) &&
      keyRef.source === "env" &&
      typeof keyRef.id === "string" &&
      keyRef.id.trim()
    ) {
      const discoveryApiKey = String(env[keyRef.id.trim()] || "").trim();
      if (!discoveryApiKey) continue;

      return {
        profileId,
        discoveryApiKey,
      };
    }
  }

  return null;
}

export function pruneUnavailableEnvAuthProfiles(store, env = process.env) {
  const next = cloneStore(store || emptyStore());
  const removedProfileIds = [];

  for (const [profileId, credential] of Object.entries(next.profiles || {})) {
    if (!isPlainObject(credential) || credential.type !== "api_key") continue;
    if (typeof credential.key === "string" && credential.key.trim()) continue;

    const keyRef = credential.keyRef;
    if (
      !isPlainObject(keyRef) ||
      keyRef.source !== "env" ||
      typeof keyRef.id !== "string" ||
      !keyRef.id.trim()
    ) {
      continue;
    }

    if (String(env[keyRef.id.trim()] || "").trim()) continue;
    delete next.profiles[profileId];
    removedProfileIds.push(profileId);
  }

  return { store: next, removedProfileIds };
}

export function upsertApiKeyAuthProfile(store, providerId, credential) {
  const provider = normalizeProvider(providerId);
  if (!provider) return { store, profileId: "" };

  const profileId = `${provider}:default`;
  const next = cloneStore(store);
  next.profiles[profileId] = {
    type: "api_key",
    provider,
    ...credential,
  };
  return { store: next, profileId };
}

export function configureAuthProfileMetadata(config, providerId, profileId) {
  if (!providerId || !profileId) return;

  config.auth = config.auth || {};
  config.auth.profiles = isPlainObject(config.auth.profiles) ? config.auth.profiles : {};
  config.auth.profiles[profileId] = {
    ...config.auth.profiles[profileId],
    provider: providerId,
    mode: "api_key",
  };
}

export function removeAuthProfileMetadata(config, profileIds) {
  if (!Array.isArray(profileIds) || profileIds.length === 0) return;
  if (!isPlainObject(config.auth?.profiles)) return;

  for (const profileId of profileIds) {
    delete config.auth.profiles[profileId];
  }

  if (Object.keys(config.auth.profiles).length === 0) {
    delete config.auth.profiles;
  }
}
