import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { asArray } from "../utils.mjs";
import { DEFAULT_FETCH_TIMEOUT_MS, DEFAULT_SDK_PLUGIN_PATH } from "./constants.mjs";
import { normalizeProviderEntry } from "./parsing.mjs";

function resolveSdkPython(env) {
  const pluginRoot = String(env.SDK_PLUGIN_PATH || DEFAULT_SDK_PLUGIN_PATH).trim();
  const venvPython = path.join(pluginRoot, ".venv", "bin", "python");
  return {
    pluginRoot,
    python: String(env.PYTHON || "").trim() || (fs.existsSync(venvPython) ? venvPython : "python3"),
  };
}

function callSdkProviders(action, payload, { env, timeoutMs }) {
  const { pluginRoot, python } = resolveSdkPython(env);
  if (!pluginRoot || !fs.existsSync(pluginRoot)) {
    return Promise.resolve({ ok: false, error: `SDK plugin path not found: ${pluginRoot}` });
  }

  return new Promise((resolve) => {
    const child = spawn(python, ["-m", "omocp_providers.cli_config"], {
      cwd: pluginRoot,
      stdio: ["pipe", "pipe", "pipe"],
      env,
    });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, (timeoutMs || DEFAULT_FETCH_TIMEOUT_MS) + 5000);

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, error: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        resolve({ ok: false, error: stderr || `Python exited with code ${code}` });
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        resolve({ ok: false, error: `Invalid JSON from Python: ${stdout}` });
      }
    });
    child.stdin.end(JSON.stringify({ action, payload }));
  });
}

export async function readSdkProviderCatalog(env, timeoutMs) {
  const providerFile = String(env.AI_PROVIDERS_FILE_PATH || "").trim();
  const hasProviderFile = providerFile ? fs.existsSync(providerFile) : false;
  const providersResult = await callSdkProviders("list_providers", {}, { env, timeoutMs });
  if (!providersResult.ok) {
    console.warn("[bootstrap] Cannot list AI providers through Python SDK:", providersResult.error);
    return hasProviderFile ? { providers: [], models: [] } : null;
  }

  const providers = asArray(providersResult.providers)
    .map((provider, index) =>
      normalizeProviderEntry({
        id: provider.id,
        name: provider.name,
        label: provider.name,
        url: provider.url,
        api: provider.api,
      }, index),
    )
    .filter(Boolean);

  if (providers.length === 0) return hasProviderFile ? { providers: [], models: [] } : null;

  const modelsResult = await callSdkProviders(
    "get_models",
    { provider_ids: providers.map((provider) => provider.id) },
    { env, timeoutMs },
  );
  if (!modelsResult.ok) {
    console.warn("[bootstrap] Cannot fetch AI models through Python SDK:", modelsResult.error);
    return { providers, models: [] };
  }

  return {
    providers,
    models: asArray(modelsResult.models),
  };
}
