"""CLI bridge: JS → Python data_manager.

Called as a subprocess by bridge.mjs.  Reads one JSON request from stdin,
executes the requested storage action, and writes one JSON response to stdout.

Request schema (stdin):
  {
    "action":          "save" | "get" | "get_or_none" | "list" | "list_public" | "delete",
    "file_path":       "/abs/path/to/data.json",
    "keyring_service": "odoo-plugin",
    "secret_fields":   ["password"],          // field names stored in keyring
    "pk_field":        "id",
    "data":            { ... },               // required for "save"
    "pk":              "some-id"              // required for "get" / "get_or_none" / "delete"
  }

Response schema (stdout):
  { "ok": true,  "result": <value> }
  { "ok": false, "error": { "code": "...", "message": "...", "details": {} } }
"""

from __future__ import annotations

import json
import sys

from .file_manager import FileManager
from .secret_service import SecretService


def _err(code: str, message: str, details: dict | None = None) -> dict:
    return {"ok": False, "error": {"code": code, "message": message, "details": details or {}}}


def _secret_key(pk_value: str, field_name: str) -> str:
    return f"{pk_value}.{field_name}"


def _load_secrets(secrets_svc: SecretService, pk_value: str, secret_fields: list[str]) -> dict:
    out = {}
    for name in secret_fields:
        try:
            out[name] = secrets_svc.get_secret(_secret_key(pk_value, name))
        except Exception:
            out[name] = None
    return out


def _handle(req: dict) -> dict:
    action         = req.get("action", "")
    file_path      = req.get("file_path", "")
    keyring_svc    = req.get("keyring_service", "")
    secret_fields  = req.get("secret_fields", [])
    pk_field       = req.get("pk_field", "id")

    if not file_path:
        return _err("INVALID_REQUEST", "file_path is required")
    if not keyring_svc:
        return _err("INVALID_REQUEST", "keyring_service is required")

    fm = FileManager(file_path)
    ss = SecretService(keyring_svc)

    # ---- save --------------------------------------------------------
    if action == "save":
        data = req.get("data", {})
        pk   = data.get(pk_field)
        if pk is None:
            return _err("INVALID_REQUEST", f"data.{pk_field} is required")

        public_record = {k: v for k, v in data.items() if k not in secret_fields}
        fm.upsert(pk_field, public_record)

        for field_name in secret_fields:
            value = data.get(field_name)
            if value is not None:
                ss.save_secret(_secret_key(pk, field_name), str(value))

        return {"ok": True, "result": None}

    # ---- get ---------------------------------------------------------
    if action in ("get", "get_or_none"):
        pk = req.get("pk")
        if pk is None:
            return _err("INVALID_REQUEST", "pk is required")

        record = fm.read_one(pk_field, pk)
        if record is None:
            if action == "get_or_none":
                return {"ok": True, "result": None}
            return _err("NOT_FOUND", f"Record '{pk}' not found", {pk_field: pk})

        secrets = _load_secrets(ss, pk, secret_fields)
        return {"ok": True, "result": {**record, **secrets}}

    # ---- list --------------------------------------------------------
    if action == "list":
        records = fm.read_all()
        result = []
        for record in records:
            pk = record.get(pk_field)
            secrets = _load_secrets(ss, pk, secret_fields)
            result.append({**record, **secrets})
        return {"ok": True, "result": result}

    # ---- list_public -------------------------------------------------
    if action == "list_public":
        return {"ok": True, "result": fm.read_all()}

    # ---- delete ------------------------------------------------------
    if action == "delete":
        pk = req.get("pk")
        if pk is None:
            return _err("INVALID_REQUEST", "pk is required")

        deleted = fm.delete(pk_field, pk)
        for field_name in secret_fields:
            try:
                ss.delete_secret(_secret_key(pk, field_name))
            except Exception:
                pass
        return {"ok": True, "result": deleted}

    return _err("UNKNOWN_ACTION", f"Unknown action: {action}")


def main() -> None:
    try:
        req = json.loads(sys.stdin.read())
    except Exception as exc:
        print(json.dumps(_err("PARSE_ERROR", str(exc))))
        sys.exit(1)

    try:
        result = _handle(req)
    except Exception as exc:
        print(json.dumps(_err("UNHANDLED_ERROR", str(exc))))
        sys.exit(1)

    print(json.dumps(result))


if __name__ == "__main__":
    main()
