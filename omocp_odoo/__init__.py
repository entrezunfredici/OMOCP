"""Public package exports for the embedded Odoo connector."""

from .odoo_cli_for_ai import OdooAIExecutor
from .odoo_cli_for_config import OdooConfigExecutor
from .odoo_client import OdooClient
from .odoo_profile import (
    OdooProfile,
    create_odoo_profile,
    delete_odoo_profile,
    filter_profiles,
    get_odoo_profile,
    get_odoo_profile_or_none,
    get_odoo_profiles,
)
from .odoo_rights import (
    OdooRight,
    create_right,
    delete_right,
    get_right,
    get_right_manager,
    get_right_manager_for,
    get_right_or_none,
    list_rights,
    list_rights_public,
    rights_for_field,
    rights_for_model,
    rights_for_profile,
    rights_for_profile_and_model,
    save_right,
)

__all__ = [
    "OdooAIExecutor",
    "OdooClient",
    "OdooConfigExecutor",
    "OdooProfile",
    "OdooRight",
    "create_odoo_profile",
    "create_right",
    "delete_odoo_profile",
    "delete_right",
    "filter_profiles",
    "get_odoo_profile",
    "get_odoo_profile_or_none",
    "get_odoo_profiles",
    "get_right",
    "get_right_manager",
    "get_right_manager_for",
    "get_right_or_none",
    "list_rights",
    "list_rights_public",
    "rights_for_field",
    "rights_for_model",
    "rights_for_profile",
    "rights_for_profile_and_model",
    "save_right",
]
