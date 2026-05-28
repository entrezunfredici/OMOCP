import { Type } from "@sinclair/typebox";

/**
 * The plugin no longer stores Odoo profiles or rights in the OpenClaw plugin config.
 * Everything is managed by the OMOCP data_manager (omocp_odoo package):
 *   - Connection profiles → ODOO_PLUGIN_CONFIG_PATH (JSON + keyring)
 *   - Rights             → ODOO_RIGHTS_PATH (JSON)
 *
 * This schema is intentionally minimal — no config needed at the plugin level.
 */
export const odooPluginConfigSchema = Type.Object({}, { additionalProperties: true });
