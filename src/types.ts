export interface OdooError {
    code: string;
    message: string;
    details?: Record<string, unknown>;
}

export interface OdooProfile {
    id: string;
    label: string;
    enabled: boolean;
}

export interface OdooRight {
    id: string;
    profile_id: string;
    odoo_model: string;
    [key: string]: unknown;
}

export type ProfilesResult =
    | { ok: true; profiles: OdooProfile[] }
    | { ok: false; error: OdooError };

export type RightsResult =
    | { ok: true; rights: OdooRight[] }
    | { ok: false; error: OdooError };

export type ActionResult =
    | { ok: true }
    | { ok: false; error: OdooError };

export interface PluginApi {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerTool(tool: { name: string; description: string; parameters: unknown; execute: (...args: any[]) => Promise<unknown> }): void;
}
