"""Odoo connection profile model and CRUD helpers."""

from __future__ import annotations

import json as _json
import os
import urllib.parse
import urllib.request

from omocp_main.data_manager import SDKModel, SDKTable, SecretField, StringField

_LOCAL_PROVIDER_ID = "local-ollama"
_DEFAULT_OLLAMA_URL = "http://localhost:11434"

PROVIDER_PRESETS = [
    {"id": "anthropic", "label": "Anthropic", "url": "https://api.anthropic.com/v1", "api": "anthropic-messages"},  # noqa: E501
    {"id": "openai", "label": "OpenAI", "url": "https://api.openai.com/v1", "api": "openai-responses"},  # noqa: E501
    {"id": "google", "label": "Google", "url": "https://generativelanguage.googleapis.com/v1beta", "api": "google-generative-ai"},  # noqa: E501
    {"id": "openrouter", "label": "OpenRouter", "url": "https://openrouter.ai/api/v1", "api": "openai-completions"},  # noqa: E501
    {"id": "mistral", "label": "Mistral AI", "url": "https://api.mistral.ai/v1", "api": "openai-completions"},  # noqa: E501
    {"id": "groq", "label": "Groq", "url": "https://api.groq.com/openai/v1", "api": "openai-completions"},  # noqa: E501
    {"id": "deepseek", "label": "DeepSeek", "url": "https://api.deepseek.com/v1", "api": "openai-completions"},  # noqa: E501
    {"id": _LOCAL_PROVIDER_ID, "label": "Local (Ollama)", "url": _DEFAULT_OLLAMA_URL, "api": "ollama"},  # noqa: E501
    {"id": "custom", "label": "Autre", "url": "", "api": "openai-completions"},
]

class AIProvider(SDKModel):
    id:         str  = StringField(primary_key=True)
    name:       str  = StringField()
    url:        str  = StringField()
    api:        str  = StringField()
    api_key:    str  = SecretField()



_table = SDKTable(
    AIProvider,
    file_path=os.getenv("AI_PROVIDERS_FILE_PATH", "/workspace/openclaw-config/ai-providers.json"),
    keyring_service="odoo-plugin",
)


# ------------------------------------------------------------------
# CRUD
# ------------------------------------------------------------------

def add_ai_provider(
    id: str,
    name: str,
    url: str,
    api: str,
    api_key: str,
) -> AIProvider:
    provider = AIProvider(
        id=id,
        name=name,
        url=url,
        api=api,
        api_key=api_key,
    )
    _table.save(provider)
    return provider


def get_ai_providers() -> list[AIProvider]:
    return _table.list()


def get_ai_provider(provider_id: str) -> AIProvider:
    return _table.get(provider_id)


def get_ai_provider_or_none(provider_id: str) -> AIProvider | None:
    return _table.get_or_none(provider_id)


def delete_ai_provider(provider_id: str) -> bool:
    return _table.delete(provider_id)

def _read_json(request: urllib.request.Request) -> dict:
    with urllib.request.urlopen(request, timeout=8) as resp:
        return _json.loads(resp.read())


def _probe_ollama(base_url: str) -> bool:
    try:
        req = urllib.request.Request(
            base_url.rstrip("/") + "/api/tags",
            headers={"Accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=2) as resp:
            resp.read()
        return True
    except Exception:
        return False


def detect_local_ollama() -> AIProvider | None:
    env_url = os.environ.get("OLLAMA_BASE_URL", "").rstrip("/")
    candidates = list(dict.fromkeys(filter(None, [env_url, _DEFAULT_OLLAMA_URL])))
    for url in candidates:
        if _probe_ollama(url):
            return AIProvider(
                id=_LOCAL_PROVIDER_ID, name="Local (Ollama)", url=url, api="ollama", api_key=""
            )
    return None


def _is_openai_generation_model(model_id: str) -> bool:
    value = model_id.lower()
    excluded = (
        "embedding",
        "whisper",
        "tts",
        "dall-e",
        "moderation",
        "audio",
        "realtime",
        "transcribe",
        "speech",
        "image",
        "babbage",
        "davinci",
    )
    if any(token in value for token in excluded):
        return False
    return value.startswith(("gpt-", "o1", "o3", "o4", "o5", "chatgpt-", "codex-"))


def _is_generation_model(provider: AIProvider, model_id: str) -> bool:
    if not model_id:
        return False
    if provider.id == "openai" or "api.openai.com" in provider.url:
        return _is_openai_generation_model(model_id)
    value = model_id.lower()
    return not any(
        token in value
        for token in ("embedding", "whisper", "tts", "dall-e", "moderation", "audio", "realtime")
    )


def _provider_models(provider: AIProvider) -> list[dict]:
    url = provider.url.rstrip("/")
    api_key = provider.api_key or ""

    if provider.api == "google-generative-ai" or "generativelanguage.googleapis.com" in url:
        if not api_key:
            return []
        request = urllib.request.Request(
            url + "/models?key=" + urllib.parse.quote(api_key) + "&pageSize=100",
            headers={"Accept": "application/json"},
        )
        data = _read_json(request)
        models = []
        for model in data.get("models") or []:
            methods = model.get("supportedGenerationMethods") or []
            name = str(model.get("name") or "")
            if "generateContent" not in methods or "gemini" not in name:
                continue
            model_id = name.replace("models/", "", 1)
            if not _is_generation_model(provider, model_id):
                continue
            models.append({
                "provider_id": provider.id,
                "model_id": model_id,
                "label": model.get("displayName") or model_id,
            })
        return models

    if provider.api == "anthropic-messages" or "api.anthropic.com" in url:
        if not api_key:
            return []
        request = urllib.request.Request(
            url + "/models",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "Accept": "application/json",
            },
        )
        data = _read_json(request)
        return [
            {
                "provider_id": provider.id,
                "model_id": model.get("id"),
                "label": model.get("display_name") or model.get("id"),
            }
            for model in data.get("data") or []
            if model.get("id")
        ]

    if provider.api == "ollama" or ":11434" in url or "ollama" in url:
        request = urllib.request.Request(url + "/api/tags", headers={"Accept": "application/json"})
        data = _read_json(request)
        return [
            {"provider_id": provider.id, "model_id": model.get("name"), "label": model.get("name")}
            for model in data.get("models") or []
            if model.get("name")
        ]

    if not api_key:
        return []

    request = urllib.request.Request(
        url + "/models",
        headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json"},
    )
    data = _read_json(request)
    entries = data.get("data") or data.get("models") or []
    models = []
    for model in entries:
        model_id = model.get("id") or model.get("name") or ""
        if _is_generation_model(provider, model_id):
            models.append({
                "provider_id": provider.id,
                "model_id": model_id,
                "label": model.get("display_name") or model.get("name") or model_id,
            })
    return models


def get_ai_models_list(provider_id_list: list[str] | None = None) -> list[dict]:
    """Fetch available models from configured providers."""

    if provider_id_list:
        provider_list = [get_ai_provider(pid) for pid in provider_id_list]
    else:
        provider_list = get_ai_providers()
        # Auto-inject local Ollama if not already explicitly configured
        if not any(p.id == _LOCAL_PROVIDER_ID for p in provider_list):
            local = detect_local_ollama()
            if local:
                provider_list.append(local)

    model_list = []
    for provider in provider_list:
        try:
            model_list.extend(_provider_models(provider))
        except Exception:
            pass
    return model_list



# ------------------------------------------------------------------
# Filtres
# ------------------------------------------------------------------

def filter_providers(**kwargs) -> list[AIProvider]:
    """Retourne les profils dont les champs correspondent aux kwargs.

    Exemple :
        filter_profiles(enabled=True)
        filter_profiles(database="mydb", enabled=True)
    """
    return [
        p for p in _table.list()
        if all(getattr(p, field, None) == value for field, value in kwargs.items())
    ]
