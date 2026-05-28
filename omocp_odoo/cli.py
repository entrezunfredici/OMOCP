"""CLI bridge: JS → omocp_odoo AI executor.

Input (stdin JSON):
  {
    "action":  "odoo_read" | "odoo_create" | "odoo_update" | "odoo_delete"
             | "odoo_list_models" | "odoo_list_fields",
    "model":   "project.task",
    "payload": {
      "profile_id": "main",
      "fields":     ["name", "deadline"],
      "domain":     [["project_id", "=", 1]],
      "limit":      25,
      "values":     { "name": "New task" },
      "id":         42,
      "ids":        [42, 43],
      "confirmed":  false
    }
  }

Output (stdout JSON):
  { "ok": true,  ... }
  { "ok": false, "error": { "code": "...", "message": "...", "details": {} } }
"""

from __future__ import annotations

import json
import sys

from omocp_main.errors_manager.errors import ConnectorError

from .odoo_cli_for_ai import OdooAIExecutor


def main() -> None:
    try:
        data = json.loads(sys.stdin.read())
    except Exception as exc:
        err = {"ok": False, "error": {"code": "PARSE_ERROR", "message": str(exc), "details": {}}}
        print(json.dumps(err))
        sys.exit(1)

    action: str = data.get("action", "")
    model: str  = data.get("model", "")
    payload: dict = data.get("payload", {})

    executor = OdooAIExecutor()
    try:
        result = executor.execute(action, model, payload)
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
