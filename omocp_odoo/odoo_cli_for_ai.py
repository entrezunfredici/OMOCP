"""AI-facing Odoo executor.

Provides bounded CRUD access to Odoo.  All operations are gated by the
rights defined in omocp_odoo/odoo_rights.py (profile × model × fields).
Secrets (passwords) are resolved automatically from the keyring.

Flow for each call:
  1. Load OdooProfile from data_manager (resolves password from keyring).
  2. Build OdooClient.
  3. For each requested field, look up the matching OdooRight via
     get_right_manager_for() and call assert_<operation>().
  4. Only allowed fields are forwarded to OdooClient.
  5. If any allowed field requires confirmation and confirmed=False,
     raise ConfirmationRequiredError — the tool layer re-raises this as a
     CONFIRMATION_REQUIRED response; the AI re-calls with confirmed=true.
"""

from __future__ import annotations

from typing import Any

from omocp_main.errors_manager.errors import (
    AuthorizationError,
    ConfirmationRequiredError,
    NotFoundError,
    ValidationError,
)

from .odoo_client import OdooClient
from .odoo_profile import get_odoo_profile_or_none
from .odoo_rights import get_right_manager_for

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _build_client(profile_id: str) -> tuple[OdooClient, Any]:
    """Load profile, validate it, and return (OdooClient, profile)."""
    profile = get_odoo_profile_or_none(profile_id)
    if profile is None:
        raise NotFoundError(
            f"Connection profile '{profile_id}' not found",
            {"profile_id": profile_id},
        )
    if not profile.enabled:
        raise AuthorizationError(
            f"Connection profile '{profile_id}' is disabled",
            {"profile_id": profile_id},
        )
    client = OdooClient(
        url=profile.base_url,
        port=profile.port,
        database=profile.database,
        login=profile.login,
        password=profile.password,
    )
    return client, profile


def _check_field(
    profile_id: str,
    model: str,
    field: str,
    operation: str,
) -> tuple[bool, bool]:
    """Return (allowed, require_confirmation) for a field/operation pair.

    Returns (False, False) when no right covers the field — deny by default.
    """
    try:
        rm = get_right_manager_for(profile_id, model, field)
        decision = rm.check(operation)
        return decision.allowed, decision.require_confirmation
    except NotFoundError:
        return False, False


def _filter_fields(
    profile_id: str,
    model: str,
    fields: list[str],
    operation: str,
) -> tuple[list[str], list[str], bool]:
    """Split fields into (allowed, denied, any_requires_confirmation)."""
    allowed, denied = [], []
    needs_confirm = False
    for field in fields:
        ok, confirm = _check_field(profile_id, model, field, operation)
        if ok:
            allowed.append(field)
            if confirm:
                needs_confirm = True
        else:
            denied.append(field)
    return allowed, denied, needs_confirm


# ---------------------------------------------------------------------------
# Executor
# ---------------------------------------------------------------------------

class OdooAIExecutor:
    """Coordinates right checks and OdooClient calls for AI tool requests."""

    def execute(self, action: str, model: str, payload: dict[str, Any]) -> dict[str, Any]:
        profile_id: str = payload.get("profile_id", "")
        if not profile_id:
            raise ValidationError("payload.profile_id is required")

        if action == "odoo_list_models":
            client, _ = _build_client(profile_id)
            return self._list_models(client)

        if action == "odoo_list_fields":
            if not model:
                raise ValidationError("model is required for odoo_list_fields")
            client, _ = _build_client(profile_id)
            return self._list_fields(model, client)

        if not model:
            raise ValidationError("model is required")

        client, _ = _build_client(profile_id)

        if action == "odoo_read":
            return self._read(model, payload, profile_id, client)
        if action == "odoo_create":
            return self._create(model, payload, profile_id, client)
        if action in ("odoo_update", "odoo_write"):
            return self._update(model, payload, profile_id, client)
        if action == "odoo_delete":
            return self._delete(model, payload, profile_id, client)

        raise ValidationError(f"Unknown action '{action}'", {"action": action})

    # ------------------------------------------------------------------
    # CRUD operations
    # ------------------------------------------------------------------

    def _read(
        self,
        model: str,
        payload: dict[str, Any],
        profile_id: str,
        client: OdooClient,
    ) -> dict[str, Any]:
        requested = payload.get("fields") or ["id", "name"]
        domain = payload.get("domain") or []
        limit = int(payload.get("limit") or 25)
        confirmed: bool = bool(payload.get("confirmed", False))

        allowed, denied, needs_confirm = _filter_fields(profile_id, model, requested, "read")

        if not allowed:
            raise AuthorizationError(
                "No readable fields allowed for this profile/model combination",
                {"model": model, "profile_id": profile_id, "denied_fields": denied},
            )
        if needs_confirm and not confirmed:
            raise ConfirmationRequiredError(
                "Read requires explicit confirmation",
                {"model": model, "profile_id": profile_id, "allowed_fields": allowed},
            )

        records = client.get(model, domain, allowed, limit)
        return {
            "ok": True,
            "records": records,
            "count": len(records),
            "allowed_fields": allowed,
            "denied_fields": denied,
        }

    def _create(
        self,
        model: str,
        payload: dict[str, Any],
        profile_id: str,
        client: OdooClient,
    ) -> dict[str, Any]:
        values: dict[str, Any] = payload.get("values") or {}
        confirmed: bool = bool(payload.get("confirmed", False))

        allowed_values = {}
        denied_fields = []
        needs_confirm = False

        for field, value in values.items():
            ok, confirm = _check_field(profile_id, model, field, "create")
            if ok:
                allowed_values[field] = value
                if confirm:
                    needs_confirm = True
            else:
                denied_fields.append(field)

        if not allowed_values:
            raise AuthorizationError(
                "No creatable fields allowed for this profile/model combination",
                {"model": model, "profile_id": profile_id, "denied_fields": denied_fields},
            )
        if needs_confirm and not confirmed:
            raise ConfirmationRequiredError(
                "Create requires explicit confirmation",
                {
                    "model": model,
                    "profile_id": profile_id,
                    "allowed_fields": list(allowed_values.keys()),
                },
            )

        record_id = client.post(model, allowed_values)
        return {
            "ok": True,
            "record_id": record_id,
            "allowed_fields": list(allowed_values.keys()),
            "denied_fields": denied_fields,
        }

    def _update(
        self,
        model: str,
        payload: dict[str, Any],
        profile_id: str,
        client: OdooClient,
    ) -> dict[str, Any]:
        record_ids = [payload["id"]] if "id" in payload else list(payload.get("ids", []))
        values: dict[str, Any] = payload.get("values") or {}
        confirmed: bool = bool(payload.get("confirmed", False))

        if not record_ids:
            raise ValidationError("payload.id or payload.ids is required for update")

        allowed_values = {}
        denied_fields = []
        needs_confirm = False

        for field, value in values.items():
            ok, confirm = _check_field(profile_id, model, field, "update")
            if ok:
                allowed_values[field] = value
                if confirm:
                    needs_confirm = True
            else:
                denied_fields.append(field)

        if not allowed_values:
            raise AuthorizationError(
                "No updatable fields allowed for this profile/model combination",
                {"model": model, "profile_id": profile_id, "denied_fields": denied_fields},
            )
        if needs_confirm and not confirmed:
            raise ConfirmationRequiredError(
                "Update requires explicit confirmation",
                {"model": model, "profile_id": profile_id, "ids": record_ids},
            )

        success = client.put(model, record_ids, allowed_values)
        return {
            "ok": True,
            "success": success,
            "updated_ids": record_ids,
            "allowed_fields": list(allowed_values.keys()),
            "denied_fields": denied_fields,
        }

    def _delete(
        self,
        model: str,
        payload: dict[str, Any],
        profile_id: str,
        client: OdooClient,
    ) -> dict[str, Any]:
        record_ids = [payload["id"]] if "id" in payload else list(payload.get("ids", []))
        confirmed: bool = bool(payload.get("confirmed", False))

        if not record_ids:
            raise ValidationError("payload.id or payload.ids is required for delete")

        # Delete is checked against the wildcard field "*"
        allowed, needs_confirm = _check_field(profile_id, model, "*", "delete")
        if not allowed:
            raise AuthorizationError(
                "Delete not allowed for this profile/model combination",
                {"model": model, "profile_id": profile_id},
            )
        if needs_confirm and not confirmed:
            raise ConfirmationRequiredError(
                "Delete requires explicit confirmation",
                {"model": model, "profile_id": profile_id, "ids": record_ids},
            )

        success = client.delete(model, record_ids)
        return {
            "ok": True,
            "success": success,
            "deleted_ids": record_ids,
        }

    # ------------------------------------------------------------------
    # Meta operations (no right check — informational only)
    # ------------------------------------------------------------------

    def _list_models(self, client: OdooClient) -> dict[str, Any]:
        ir_model = client.get_model("ir.model")
        models = ir_model.search_read([], ["model", "name"], order="model asc")
        return {
            "ok": True,
            "models": [{"model": m["model"], "name": m.get("name", "")} for m in models],
            "count": len(models),
        }

    def _list_fields(self, model: str, client: OdooClient) -> dict[str, Any]:
        schema = client.get_model_schema(model)
        fields = [
            {
                "name": name,
                "label": meta.get("string", name),
                "type": meta.get("type", "unknown"),
                "required": meta.get("required", False),
                "readonly": meta.get("readonly", False),
            }
            for name, meta in schema.items()
        ]
        return {"ok": True, "model": model, "fields": fields, "count": len(fields)}
