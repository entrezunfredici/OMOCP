"""CLI bridge: JS → omocp_providers actions.

Input (stdin JSON):
  { "action": "get_presets" | "list_providers" | "save_provider" | "delete_provider" | "get_models",
    "payload": { ... } }

Output (stdout JSON):
  { "ok": true, ... }
  { "ok": false, "error": "..." }
"""
from __future__ import annotations

import json
import sys

from .ai_provider import (
    PROVIDER_PRESETS,
    add_ai_provider,
    delete_ai_provider,
    detect_local_ollama,
    get_ai_models_list,
    get_ai_providers,
)


def main() -> None:
    try:
        data = json.loads(sys.stdin.read())
    except Exception as exc:
        print(json.dumps({"ok": False, "error": f"PARSE_ERROR: {exc}"}))
        sys.exit(1)

    action: str = data.get("action", "")
    payload: dict = data.get("payload", {})

    try:
        if action == "get_presets":
            print(json.dumps({"ok": True, "presets": PROVIDER_PRESETS}))

        elif action == "list_providers":
            providers = [
                {"id": p.id, "name": p.name, "url": p.url, "api": p.api}
                for p in get_ai_providers()
            ]
            print(json.dumps({"ok": True, "providers": providers}))

        elif action == "save_provider":
            p = add_ai_provider(
                id=payload["id"],
                name=payload["name"],
                url=payload["url"],
                api=payload.get("api", "openai-completions"),
                api_key=payload.get("api_key", ""),
            )
            provider = {"id": p.id, "name": p.name, "url": p.url, "api": p.api}
            print(json.dumps({"ok": True, "provider": provider}))

        elif action == "delete_provider":
            deleted = delete_ai_provider(payload["id"])
            print(json.dumps({"ok": True, "deleted": deleted}))

        elif action == "get_models":
            models = get_ai_models_list(payload.get("provider_ids"))
            print(json.dumps({"ok": True, "models": models}))

        elif action == "detect_local":
            local = detect_local_ollama()
            if local:
                provider = {"id": local.id, "name": local.name, "url": local.url, "api": local.api}
                print(json.dumps({"ok": True, "detected": True, "provider": provider}))
            else:
                print(json.dumps({"ok": True, "detected": False}))

        else:
            print(json.dumps({"ok": False, "error": f"Unknown action: {action}"}))
            sys.exit(1)

    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
