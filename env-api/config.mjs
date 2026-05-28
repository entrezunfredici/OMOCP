import path from "path";

export const PORT = process.env.ENV_API_PORT || 3099;
export const ENV_PATH = process.env.ENV_FILE_PATH || "/workspace/.env";
export const GATEWAY_ENV_PATH = process.env.GATEWAY_ENV_PATH || "/workspace/openclaw-config/.env";
export const OPENCLAW_CONFIG_PATH = path.join(path.dirname(GATEWAY_ENV_PATH), "openclaw.json");
export const AUTH_PROFILES_PATH =
  process.env.AUTH_PROFILES_PATH || "/workspace/openclaw-config/agents/main/agent/auth-profiles.json";
export const PROVIDER_KEYRING_PATH =
  process.env.PROVIDER_KEYRING_PATH || "/workspace/openclaw-config/provider-keyring.json";
export const ODOO_PLUGIN_CONFIG_PATH =
  process.env.ODOO_PLUGIN_CONFIG_PATH || "/workspace/omop-plugin-config.json";
export const ODOO_PLUGIN_KEYRING_PATH =
  process.env.ODOO_PLUGIN_KEYRING_PATH || "/workspace/openclaw-config/odoo-plugin-keyring.json";
export const AI_PROVIDERS_PATH =
  process.env.AI_PROVIDERS_FILE_PATH || "/workspace/openclaw-config/ai-providers.json";
export const ODOO_PROFILES_PATH =
  process.env.ODOO_PROFILES_FILE_PATH || "/workspace/openclaw-config/odoo-profiles.json";

export const SENSITIVE_ENV_PATTERN = /(?:API|TOKEN|KEY|SECRET|PASSWORD|PRIVATE|CREDENTIAL)/i;

export const ALLOWED_ENV_KEYS = new Set([
  "OPENCLAW_MODEL_CATALOG",
  "OPENCLAW_PROVIDERS",
  "OPENCLAW_DEFAULT_MODEL",
  "OPENCLAW_PROVIDER_FETCH_TIMEOUT_MS",
  "OPENCLAW_ENABLE_ODOO_PLUGIN",
  ...String(process.env.ENV_API_ALLOWED_ENV_KEYS || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean),
]);

export const ALLOWED_ORIGINS = new Set([
  "http://127.0.0.1:18789",
  "http://localhost:18789",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://localhost:3000",
  "http://doodoo-agent",
  "http://doodoo-agent.localhost",
  ...String(process.env.ENV_API_ALLOWED_ORIGINS || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean),
]);

export const PROVIDER_FETCH_ALLOWED_HOSTS = new Set([
  "generativelanguage.googleapis.com",
  "api.anthropic.com",
  "api.openai.com",
  "api.mistral.ai",
  "openrouter.ai",
  "api.groq.com",
  "api.deepseek.com",
  "api.cerebras.ai",
  ...String(process.env.ENV_API_PROVIDER_FETCH_ALLOWED_HOSTS || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean),
]);

export const MAX_JSON_BYTES = Number.parseInt(process.env.ENV_API_MAX_JSON_BYTES || "1048576", 10);
export const PROVIDER_REFRESH_INTERVAL_MS = Number.parseInt(
  process.env.OPENCLAW_PROVIDER_REFRESH_INTERVAL_MS || "0",
  10,
);
