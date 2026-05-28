import { Type } from "@sinclair/typebox";
import { randomUUID } from "node:crypto";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { odooPluginConfigSchema } from "./configSchema.js";
import { runSdkOdooAction, runSdkOdooConfig } from "./pythonBridge.js";
import type { ActionResult, OdooProfile, PluginApi, ProfilesResult, RightsResult } from "./types.js";

const ENV_API_INTERNAL_URL = (process.env.ENV_API_INTERNAL_URL || "http://openclaw-env-api:3099").replace(/\/$/, "");
const CONFIRM_TIMEOUT_MS = 90_000;
const CONFIRM_POLL_MS = 1_500;

function toToolText(result: unknown): string {
    return JSON.stringify(result, null, 2);
}

async function requestUiConfirmation(
    operation: string,
    model: string,
    profileId: string,
    details: Record<string, unknown>,
): Promise<boolean> {
    const id = randomUUID();
    try {
        await fetch(`${ENV_API_INTERNAL_URL}/confirm/pending`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, operation, model, profile_id: profileId, details }),
        });
    } catch {
        return false;
    }
    const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
    while (Date.now() < deadline) {
        await new Promise<void>((r) => setTimeout(r, CONFIRM_POLL_MS));
        try {
            const resp = await fetch(`${ENV_API_INTERNAL_URL}/confirm/pending/${id}`);
            const data = (await resp.json()) as { resolved?: boolean; allowed?: boolean };
            if (data.resolved) return !!data.allowed;
        } catch { /* continue */ }
    }
    return false;
}

const DENIED_RESULT = { ok: false, error: { code: "DENIED_BY_USER", message: "Accès refusé par l'utilisateur." } };

export default definePluginEntry({
    id: "omocp",
    name: "OMOCP — Odoo Manager OpenClaw Plugin",
    description: "Generic Odoo connector for OpenClaw with policy-enforced, profile-based CRUD tools",
    configSchema: odooPluginConfigSchema,

    register(api: PluginApi) {
        api.registerTool({
            name: "odoo_config_validate",
            description:
                "Validate the SDK Odoo setup: check that at least one connection profile exists and is enabled, " +
                "and that rights are configured so the AI can actually access Odoo.",
            parameters: Type.Object({}),
            async execute() {
                const [profilesResult, rightsResult] = await Promise.all([
                    runSdkOdooConfig<ProfilesResult>({ action: "list_profiles", payload: {} }),
                    runSdkOdooConfig<RightsResult>({ action: "list_rights", payload: {} }),
                ]);

                const issues: string[] = [];
                const profiles: OdooProfile[] = profilesResult.ok ? profilesResult.profiles : [];
                const rights = rightsResult.ok ? rightsResult.rights : [];

                if (!profilesResult.ok) issues.push(`Cannot read profiles: ${profilesResult.error?.message}`);
                if (!rightsResult.ok)  issues.push(`Cannot read rights: ${rightsResult.error?.message}`);
                if (profiles.length === 0) issues.push("No connection profiles configured.");
                const disabled = profiles.filter((p) => !p.enabled);
                if (disabled.length > 0) issues.push(`${disabled.length} profile(s) disabled: ${disabled.map((p) => p.id).join(", ")}`);
                if (rights.length === 0) issues.push("No rights configured — the AI cannot access Odoo without at least one right.");

                return {
                    content: [
                        {
                            type: "text",
                            text: toToolText({
                                ok: issues.length === 0,
                                profiles_count: profiles.length,
                                rights_count: rights.length,
                                profiles: profiles.map((p) => ({ id: p.id, label: p.label, enabled: p.enabled })),
                                issues,
                            }),
                        },
                    ],
                };
            },
        });

        api.registerTool({
            name: "odoo_list_connection_profiles",
            description: "List Odoo connection profiles stored in the SDK system (no secrets exposed).",
            parameters: Type.Object({
                include_disabled: Type.Optional(Type.Boolean({ default: false })),
            }),
            async execute(_id: string, params?: { include_disabled?: boolean }) {
                const result = await runSdkOdooConfig<ProfilesResult>({ action: "list_profiles", payload: {} });
                if (!result.ok) return { content: [{ type: "text", text: toToolText(result) }] };

                const profiles = params?.include_disabled
                    ? result.profiles
                    : result.profiles.filter((p) => p.enabled);

                return {
                    content: [{ type: "text", text: toToolText({ ok: true, profiles, count: profiles.length }) }],
                };
            },
        });

        api.registerTool({
            name: "odoo_list_rights",
            description:
                "List rights configured in the SDK system. " +
                "Each right defines which CRUD operations the AI may perform on a given profile, model, and set of fields.",
            parameters: Type.Object({
                profile_id: Type.Optional(Type.String({ description: "Filter by connection profile id." })),
                odoo_model: Type.Optional(Type.String({ description: "Filter by Odoo model name." })),
            }),
            async execute(_id: string, params?: { profile_id?: string; odoo_model?: string }) {
                const result = await runSdkOdooConfig<RightsResult>({
                    action: "list_rights",
                    payload: { profile_id: params?.profile_id ?? "" },
                });
                if (!result.ok) return { content: [{ type: "text", text: toToolText(result) }] };

                const rights = params?.odoo_model
                    ? result.rights.filter((r) => r.odoo_model === params.odoo_model)
                    : result.rights;

                return {
                    content: [{ type: "text", text: toToolText({ ok: true, rights, count: rights.length }) }],
                };
            },
        });

        api.registerTool({
            name: "odoo_sdk_read",
            description:
                "Read records from an Odoo model using the SDK rights system. " +
                "Access is gated per field by rights linked to the profile. " +
                "Only fields explicitly allowed by a matching OdooRight are returned.",
            parameters: Type.Object({
                profile_id: Type.String({ description: "Connection profile id configured in omocp_odoo." }),
                model: Type.String({ description: "Odoo model name, e.g. 'project.task'." }),
                fields: Type.Optional(Type.Array(Type.String(), { description: "Fields to read. Defaults to ['id', 'name']." })),
                domain: Type.Optional(Type.Array(Type.Any(), { description: "Odoo domain filter, e.g. [['project_id', '=', 1]]." })),
                limit: Type.Optional(Type.Number({ description: "Max records to return. Defaults to 25." })),
                confirmed: Type.Optional(Type.Boolean({ description: "Set true when the right requires read confirmation." })),
            }),
            async execute(
                _id: string,
                params: { profile_id: string; model: string; fields?: string[]; domain?: unknown[]; limit?: number; confirmed?: boolean },
            ) {
                const result = await runSdkOdooAction<ActionResult>({
                    action: "odoo_read",
                    model: params.model,
                    payload: {
                        profile_id: params.profile_id,
                        fields: params.fields,
                        domain: params.domain,
                        limit: params.limit,
                        confirmed: params.confirmed,
                    },
                });
                if (!result.ok && result.error?.code === "CONFIRMATION_REQUIRED") {
                    const allowed = await requestUiConfirmation("read", params.model, params.profile_id, result.error?.details || {});
                    if (!allowed) return { content: [{ type: "text", text: toToolText(DENIED_RESULT) }] };
                    const confirmed = await runSdkOdooAction({ action: "odoo_read", model: params.model, payload: { profile_id: params.profile_id, fields: params.fields, domain: params.domain, limit: params.limit, confirmed: true } });
                    return { content: [{ type: "text", text: toToolText(confirmed) }] };
                }
                return { content: [{ type: "text", text: toToolText(result) }] };
            },
        });

        api.registerTool({
            name: "odoo_sdk_create",
            description:
                "Create a record in an Odoo model using the SDK rights system. " +
                "Each field is checked individually; unauthorized fields are silently dropped. " +
                "If the right requires confirmation, re-call with confirmed: true.",
            parameters: Type.Object({
                profile_id: Type.String({ description: "Connection profile id." }),
                model: Type.String({ description: "Odoo model name." }),
                values: Type.Record(Type.String(), Type.Any(), { description: "Field values for the new record." }),
                confirmed: Type.Optional(Type.Boolean({ description: "Set true after the user explicitly confirms." })),
            }),
            async execute(
                _id: string,
                params: { profile_id: string; model: string; values: Record<string, unknown>; confirmed?: boolean },
            ) {
                const result = await runSdkOdooAction<ActionResult>({
                    action: "odoo_create",
                    model: params.model,
                    payload: { profile_id: params.profile_id, values: params.values, confirmed: params.confirmed },
                });
                if (!result.ok && result.error?.code === "CONFIRMATION_REQUIRED") {
                    const allowed = await requestUiConfirmation("create", params.model, params.profile_id, result.error?.details || {});
                    if (!allowed) return { content: [{ type: "text", text: toToolText(DENIED_RESULT) }] };
                    const confirmed = await runSdkOdooAction({ action: "odoo_create", model: params.model, payload: { profile_id: params.profile_id, values: params.values, confirmed: true } });
                    return { content: [{ type: "text", text: toToolText(confirmed) }] };
                }
                return { content: [{ type: "text", text: toToolText(result) }] };
            },
        });

        api.registerTool({
            name: "odoo_sdk_update",
            description:
                "Update one or more records in an Odoo model using the SDK rights system. " +
                "Authorization is evaluated per field. Unauthorized fields are silently dropped.",
            parameters: Type.Object({
                profile_id: Type.String({ description: "Connection profile id." }),
                model: Type.String({ description: "Odoo model name." }),
                id: Type.Optional(Type.Number({ description: "Single record id to update." })),
                ids: Type.Optional(Type.Array(Type.Number(), { description: "Multiple record ids to update." })),
                values: Type.Record(Type.String(), Type.Any(), { description: "Fields to update." }),
                confirmed: Type.Optional(Type.Boolean({ description: "Set true after explicit user confirmation." })),
            }),
            async execute(
                _id: string,
                params: { profile_id: string; model: string; id?: number; ids?: number[]; values: Record<string, unknown>; confirmed?: boolean },
            ) {
                const result = await runSdkOdooAction<ActionResult>({
                    action: "odoo_update",
                    model: params.model,
                    payload: { profile_id: params.profile_id, id: params.id, ids: params.ids, values: params.values, confirmed: params.confirmed },
                });
                if (!result.ok && result.error?.code === "CONFIRMATION_REQUIRED") {
                    const allowed = await requestUiConfirmation("update", params.model, params.profile_id, result.error?.details || {});
                    if (!allowed) return { content: [{ type: "text", text: toToolText(DENIED_RESULT) }] };
                    const confirmed = await runSdkOdooAction({ action: "odoo_update", model: params.model, payload: { profile_id: params.profile_id, id: params.id, ids: params.ids, values: params.values, confirmed: true } });
                    return { content: [{ type: "text", text: toToolText(confirmed) }] };
                }
                return { content: [{ type: "text", text: toToolText(result) }] };
            },
        });

        api.registerTool({
            name: "odoo_sdk_delete",
            description:
                "Delete one or more records in an Odoo model using the SDK rights system. " +
                "Requires an OdooRight with delete=true and fields=['*'] for the profile/model. " +
                "If confirmation is required, re-call with confirmed: true.",
            parameters: Type.Object({
                profile_id: Type.String({ description: "Connection profile id." }),
                model: Type.String({ description: "Odoo model name." }),
                id: Type.Optional(Type.Number({ description: "Single record id to delete." })),
                ids: Type.Optional(Type.Array(Type.Number(), { description: "Multiple record ids to delete." })),
                confirmed: Type.Optional(Type.Boolean({ description: "Set true after explicit user confirmation." })),
            }),
            async execute(
                _id: string,
                params: { profile_id: string; model: string; id?: number; ids?: number[]; confirmed?: boolean },
            ) {
                const result = await runSdkOdooAction<ActionResult>({
                    action: "odoo_delete",
                    model: params.model,
                    payload: { profile_id: params.profile_id, id: params.id, ids: params.ids, confirmed: params.confirmed },
                });
                if (!result.ok && result.error?.code === "CONFIRMATION_REQUIRED") {
                    const allowed = await requestUiConfirmation("delete", params.model, params.profile_id, result.error?.details || {});
                    if (!allowed) return { content: [{ type: "text", text: toToolText(DENIED_RESULT) }] };
                    const confirmed = await runSdkOdooAction({ action: "odoo_delete", model: params.model, payload: { profile_id: params.profile_id, id: params.id, ids: params.ids, confirmed: true } });
                    return { content: [{ type: "text", text: toToolText(confirmed) }] };
                }
                return { content: [{ type: "text", text: toToolText(result) }] };
            },
        });

        api.registerTool({
            name: "odoo_sdk_list_models",
            description: "List available Odoo models for a given connection profile.",
            parameters: Type.Object({
                profile_id: Type.String({ description: "Connection profile id." }),
            }),
            async execute(_id: string, params: { profile_id: string }) {
                const result = await runSdkOdooAction({
                    action: "odoo_list_models",
                    payload: { profile_id: params.profile_id },
                });
                return { content: [{ type: "text", text: toToolText(result) }] };
            },
        });

        api.registerTool({
            name: "odoo_sdk_list_fields",
            description: "List fields of an Odoo model (schema introspection). Use to discover what fields exist before reading or writing.",
            parameters: Type.Object({
                profile_id: Type.String({ description: "Connection profile id." }),
                model: Type.String({ description: "Odoo model name." }),
            }),
            async execute(_id: string, params: { profile_id: string; model: string }) {
                const result = await runSdkOdooAction({
                    action: "odoo_list_fields",
                    model: params.model,
                    payload: { profile_id: params.profile_id },
                });
                return { content: [{ type: "text", text: toToolText(result) }] };
            },
        });
    },
});
