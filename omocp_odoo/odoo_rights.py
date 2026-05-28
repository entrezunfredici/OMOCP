"""Odoo rights — CRUD permissions linked to a profile, an Odoo model and fields.

A right ties together:
    - a connection profile  (profile_id → OdooProfile.id)
    - an Odoo model         (odoo_model, e.g. "project.task")
    - a list of Odoo fields (fields, e.g. ["name", "deadline"] or ["*"] for all)
    - CRUD operation flags  (create / read / update / delete)
    - optional per-operation confirmation requirements

Everything is persisted via SDKTable (JSON file + keyring).
"""

from __future__ import annotations

import os
import uuid
from collections.abc import Callable

from omocp_main.data_manager import (
    BoolField,
    ListField,
    SDKModel,
    SDKTable,
    StringField,
)
from omocp_main.errors_manager.errors import NotFoundError
from omocp_main.right_manager.right_manager import Right, RightManager

# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------

class OdooRight(SDKModel):
    # Identity
    id:    str = StringField(primary_key=True)
    label: str = StringField(default="")

    # Links
    profile_id: str  = StringField()           # → OdooProfile.id
    odoo_model: str  = StringField()           # e.g. "project.task"
    fields:     list = ListField()             # e.g. ["name", "deadline"] or ["*"]

    # CRUD flags (deny-by-default)
    create: bool = BoolField(default=False)
    read:   bool = BoolField(default=True)
    update: bool = BoolField(default=False)
    delete: bool = BoolField(default=False)

    # Confirmation flags (per-operation; require_confirmation is the global fallback)
    require_confirmation: bool = BoolField(default=False)
    confirm_create:       bool = BoolField(default=False)
    confirm_read:         bool = BoolField(default=False)
    confirm_update:       bool = BoolField(default=False)
    confirm_delete:       bool = BoolField(default=False)

    def applies_to_field(self, field_name: str) -> bool:
        """True if this right covers the given Odoo field (or covers all via '*')."""
        return "*" in self.fields or field_name in self.fields

    def to_right(self) -> Right:
        """Convert to a RightManager-compatible Right dataclass."""
        return Right(
            id=self.id,
            create=self.create,
            read=self.read,
            update=self.update,
            delete=self.delete,
            require_confirmation=self.require_confirmation,
            confirm_create=self.confirm_create or None,
            confirm_read=self.confirm_read or None,
            confirm_update=self.confirm_update or None,
            confirm_delete=self.confirm_delete or None,
        )


# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------

_RIGHTS_PATH = os.getenv(
    "ODOO_RIGHTS_PATH",
    "/workspace/odoo-rights.json",
)

_table: SDKTable = SDKTable(
    OdooRight,
    file_path=_RIGHTS_PATH,
    keyring_service="odoo-plugin",
)


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

def create_right(
    profile_id: str,
    odoo_model: str,
    fields: list[str],
    *,
    label: str = "",
    id: str | None = None,
    create: bool = False,
    read: bool = True,
    update: bool = False,
    delete: bool = False,
    require_confirmation: bool = False,
    confirm_create: bool = False,
    confirm_read: bool = False,
    confirm_update: bool = False,
    confirm_delete: bool = False,
) -> OdooRight:
    right = OdooRight(
        id=id or str(uuid.uuid4()),
        label=label,
        profile_id=profile_id,
        odoo_model=odoo_model,
        fields=fields,
        create=create,
        read=read,
        update=update,
        delete=delete,
        require_confirmation=require_confirmation,
        confirm_create=confirm_create,
        confirm_read=confirm_read,
        confirm_update=confirm_update,
        confirm_delete=confirm_delete,
    )
    _table.save(right)
    return right


def get_right(right_id: str) -> OdooRight:
    return _table.get(right_id)


def get_right_or_none(right_id: str) -> OdooRight | None:
    return _table.get_or_none(right_id)


def save_right(right: OdooRight) -> None:
    _table.save(right)


def delete_right(right_id: str) -> bool:
    return _table.delete(right_id)


def list_rights() -> list[OdooRight]:
    return _table.list()


def list_rights_public() -> list[dict]:
    return _table.list_public()


# ---------------------------------------------------------------------------
# Filtered lookups
# ---------------------------------------------------------------------------

def _filter(predicate: Callable[[OdooRight], bool]) -> list[OdooRight]:
    return [r for r in _table.list() if predicate(r)]


def rights_for_profile(profile_id: str) -> list[OdooRight]:
    """All rights linked to a given profile."""
    return _filter(lambda r: r.profile_id == profile_id)


def rights_for_model(odoo_model: str) -> list[OdooRight]:
    """All rights that apply to a given Odoo model."""
    return _filter(lambda r: r.odoo_model == odoo_model)


def rights_for_profile_and_model(profile_id: str, odoo_model: str) -> list[OdooRight]:
    """All rights for a (profile, Odoo model) pair."""
    return _filter(lambda r: r.profile_id == profile_id and r.odoo_model == odoo_model)


def rights_for_field(odoo_model: str, field_name: str) -> list[OdooRight]:
    """All rights that cover a specific field on a given Odoo model."""
    return _filter(lambda r: r.odoo_model == odoo_model and r.applies_to_field(field_name))


# ---------------------------------------------------------------------------
# RightManager factory
# ---------------------------------------------------------------------------

def get_right_manager(right_id: str) -> RightManager:
    """Load a right by id and return a ready-to-use RightManager."""
    odoo_right = _table.get(right_id)
    return RightManager(odoo_right.to_right())


def get_right_manager_for(profile_id: str, odoo_model: str, field_name: str) -> RightManager:
    """Find the most specific right for a (profile, model, field) and return its RightManager.

    Prefers an exact field match over a wildcard '*' rule.
    Raises NotFoundError if no right covers this combination.
    """
    candidates = rights_for_field(odoo_model, field_name)
    candidates = [r for r in candidates if r.profile_id == profile_id]

    if not candidates:
        raise NotFoundError(
            f"No right found for profile='{profile_id}' model='{odoo_model}' field='{field_name}'",
            {"profile_id": profile_id, "odoo_model": odoo_model, "field": field_name},
        )

    # Exact field match takes priority over wildcard
    exact = [r for r in candidates if field_name in r.fields]
    chosen = exact[0] if exact else candidates[0]
    return RightManager(chosen.to_right())
