import {
  configureAuthProfileMetadata,
  resolveAuthProfileCredential,
  upsertApiKeyAuthProfile,
} from "../auth-profiles.mjs";
import { PROVIDER_ENV_CANDIDATES } from "./constants.mjs";

export function toSecretEnvRef(id) {
  return {
    source: "env",
    provider: "default",
    id,
  };
}

function parseEnvReference(value) {
  const trimmed = String(value || "").trim();
  const match = /^\$\{([A-Z_][A-Z0-9_]*)\}$/.exec(trimmed);
  return match ? match[1] : "";
}

function isEnvName(value) {
  return /^[A-Z_][A-Z0-9_]*$/.test(String(value || "").trim());
}

function findMatchingEnvName(secret, env) {
  if (!secret) return "";
  for (const [key, value] of Object.entries(env)) {
    if (!isEnvName(key)) continue;
    if (!/(?:API|TOKEN|KEY|SECRET|PASSWORD)/.test(key)) continue;
    if (value && value === secret) return key;
  }
  return "";
}

function firstPresentEnvName(candidates, env) {
  return candidates.find((name) => String(env[name] || "").trim()) || "";
}

function withAuthProfileStore(params, credential) {
  const { authProfileState, config, provider } = params;
  const result = upsertApiKeyAuthProfile(authProfileState.store, provider.id, credential);
  authProfileState.store = result.store;
  authProfileState.changed = true;
  configureAuthProfileMetadata(config, provider.id, result.profileId);
  return result.profileId;
}

export function resolveProviderCredential(params) {
  const { authProfileState, config, env, provider, providerKeyringPath } = params;
  const authProfileCredential = resolveAuthProfileCredential(
    authProfileState.store,
    provider.id,
    env,
    providerKeyringPath,
  );
  const explicitEnv = String(provider.keyEnv || provider.apiKeyEnv || provider.env || "").trim();
  if (explicitEnv) {
    const discoveryApiKey = String(env[explicitEnv] || "").trim() || authProfileCredential?.discoveryApiKey || "";
    if (discoveryApiKey) {
      withAuthProfileStore(params, {
        keyRef: toSecretEnvRef(explicitEnv),
      });
    }
    return {
      discoveryApiKey,
    };
  }

  const rawKey = String(provider.key ?? provider.apiKey ?? "").trim();
  const envRef = parseEnvReference(rawKey);
  if (envRef) {
    const resolvedEnv = String(env[envRef] || "").trim()
      ? envRef
      : firstPresentEnvName(PROVIDER_ENV_CANDIDATES[provider.id] || [], env) || envRef;
    const discoveryApiKey = String(env[resolvedEnv] || "").trim() || authProfileCredential?.discoveryApiKey || "";
    if (discoveryApiKey) {
      withAuthProfileStore(params, {
        keyRef: toSecretEnvRef(resolvedEnv),
      });
    }
    return {
      discoveryApiKey,
    };
  }

  if (isEnvName(rawKey) && env[rawKey]) {
    withAuthProfileStore(params, {
      keyRef: toSecretEnvRef(rawKey),
    });
    return {
      discoveryApiKey: String(env[rawKey] || "").trim(),
    };
  }

  if (rawKey) {
    const matchingEnv = findMatchingEnvName(rawKey, env);
    if (matchingEnv) {
      withAuthProfileStore(params, {
        keyRef: toSecretEnvRef(matchingEnv),
      });
      return {
        discoveryApiKey: rawKey,
      };
    }
    withAuthProfileStore(params, {
      key: rawKey,
    });
    return {
      discoveryApiKey: rawKey,
    };
  }

  if (authProfileCredential) {
    configureAuthProfileMetadata(config, provider.id, authProfileCredential.profileId);
    return {
      discoveryApiKey: authProfileCredential.discoveryApiKey,
    };
  }

  const defaultEnv = firstPresentEnvName(PROVIDER_ENV_CANDIDATES[provider.id] || [], env);
  if (!defaultEnv) return {};

  withAuthProfileStore(params, {
    keyRef: toSecretEnvRef(defaultEnv),
  });
  return {
    discoveryApiKey: String(env[defaultEnv] || "").trim(),
  };
}
