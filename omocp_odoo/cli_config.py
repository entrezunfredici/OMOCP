"""CLI bridge: JS → OdooConfigExecutor.

Input (stdin JSON):
  {
    "action": "list_profiles" | "get_profile" | "save_profile" | "delete_profile"
            | "list_rights"   | "get_right"   | "save_right"   | "delete_right"
            | "list_odoo_models" | "list_odoo_fields",
    "payload": { ... }
  }

Output (stdout JSON):
  { "ok": true,  ... }
  { "ok": false, "error": { "code": "...", "message": "...", "details": {} } }
"""

from __future__ import annotations

import json
import sys

from omocp_main.errors_manager.errors import ConnectorError

from .odoo_cli_for_config import OdooConfigExecutor


def main() -> None:
    try:
        data = json.loads(sys.stdin.read())
    except Exception as exc:
        err = {"ok": False, "error": {"code": "PARSE_ERROR", "message": str(exc), "details": {}}}
        print(json.dumps(err))
        sys.exit(1)

    action: str = data.get("action", "")
    payload: dict = data.get("payload", {})

    executor = OdooConfigExecutor()
    try:
        result = executor.execute(action, payload)
    except ConnectorError as exc:
        print(json.dumps(exc.to_dict()))
        sys.exit(1)
    except Exception as exc:
        print(json.dumps({
            "ok": False,
            "error": {"code": "UNHANDLED_ERROR", "message": str(exc), "details": {}},
        }))
        sys.exit(1)

    print(json.dumps(result))


if __name__ == "__main__":
    main()
