export const DEFAULT_CONTEXT_WINDOW = 200000;
export const DEFAULT_MAX_TOKENS = 8192;
export const DEFAULT_FETCH_TIMEOUT_MS = 7000;
export const DEFAULT_SDK_PLUGIN_PATH = "/opt/doodoo/plugins/odoo-plugin";

export const PROVIDER_ENV_CANDIDATES = {
  anthropic: ["ANTHROPIC_API_KEY"],
  cerebras: ["CEREBRAS_API_KEY"],
  deepseek: ["DEEPSEEK_API_KEY"],
  google: ["GEMINI_API_KEY", "GOOGLE_GEMINI_API_KEY", "GOOGLE_API_KEY"],
  groq: ["GROQ_API_KEY"],
  mistral: ["MISTRAL_API_KEY"],
  ollama: ["OLLAMA_API_KEY"],
  openai: ["OPENAI_API_KEY"],
  openrouter: ["OPENROUTER_API_KEY"],
};

export function makeZeroCost() {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
  };
}
