import { Router } from "express";
import { readEnv } from "../helpers/env.mjs";
import {
  readOdooConfig, writeOdooConfig,
  readOdooProfiles, writeOdooProfiles,
  slugId, secretEnvName,
  saveOdooSecret, deleteOdooSecret, hasOdooSecret,
} from "../helpers/odoo.mjs";
import { upsertById } from "../helpers/providers.mjs";
import { sdkOdooConfig } from "../omocp_odoo_config_bridge.mjs";

const router = Router();

// ── Odoo plugin config ────────────────────────────────────────────────────

router.get("/odoo/config", (_req, res) => {
  const config = readOdooConfig();
  const env = readEnv();
  res.json({
    ok: true,
    config,
    secret_refs: Object.fromEntries(
      config.connection_profiles.map((profile) => [
        profile.secret_ref,
        hasOdooSecret(profile.secret_ref) || Boolean(env[secretEnvName(profile.secret_ref)]),
      ])
    ),
  });
});

router.post("/odoo/profile", (req, res) => {
  const body = req.body || {};
  const id = slugId(body.id || body.label || body.database, "default");
  const secretRef = slugId(body.secret_ref || `${id}_password`, "default_password").replaceAll("-", "_");

  if (!body.base_url || !body.database || !body.login) {
    return res.status(400).json({ ok: false, error: "base_url, database and login are required" });
  }

  try {
    const config = readOdooConfig();
    const profile = {
      id,
      label: String(body.label || id),
      base_url: String(body.base_url).trim(),
      database: String(body.database).trim(),
      login: String(body.login).trim(),
      port: Number.parseInt(body.port, 10) || 443,
      secret_ref: secretRef,
      enabled: body.enabled ?? true,
    };

    config.connection_profiles = upsertById(config.connection_profiles, profile);
    config.active_connection_profile_id = body.active === false ? config.active_connection_profile_id : id;

    if (!Array.isArray(config.access_profiles) || config.access_profiles.length === 0) {
      config.access_profiles = [
        {
          id: "readonly",
          label: "Readonly",
          connection_profile_id: id,
          enabled: true,
          default_read_confirmation: false,
          default_create_confirmation: true,
          default_write_confirmation: true,
          default_delete_confirmation: true,
        },
      ];
      config.active_access_profile_id = "readonly";
    }

    writeOdooConfig(config);

    const flatProfiles = readOdooProfiles();
    const flatEntry = { id, label: profile.label, base_url: profile.base_url, database: profile.database, login: profile.login, port: profile.port, enabled: profile.enabled };
    writeOdooProfiles(upsertById(flatProfiles, flatEntry));
    if (body.password) saveOdooSecret(`${id}.password`, body.password);

    const secretSaved = saveOdooSecret(secretRef, body.password);

    res.json({
      ok: true,
      profile,
      active_connection_profile_id: config.active_connection_profile_id,
      secret_ref: secretRef,
      secret_saved: secretSaved,
      secret_storage: "odoo-plugin-keyring",
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.delete("/odoo/profile/:id", (req, res) => {
  try {
    const config = readOdooConfig();
    const profile = config.connection_profiles.find((entry) => entry.id === req.params.id);
    const accessProfileIds = new Set(
      config.access_profiles
        .filter((entry) => entry.connection_profile_id === req.params.id)
        .map((entry) => entry.id)
    );

    config.connection_profiles = config.connection_profiles.filter((p) => p.id !== req.params.id);
    config.access_profiles = config.access_profiles.filter((p) => !accessProfileIds.has(p.id));
    config.permission_rules = config.permission_rules.filter((rule) => !accessProfileIds.has(rule.access_profile_id));

    if (config.active_connection_profile_id === req.params.id) {
      config.active_connection_profile_id = config.connection_profiles[0]?.id || "default";
    }
    if (accessProfileIds.has(config.active_access_profile_id)) {
      config.active_access_profile_id = config.access_profiles[0]?.id || "readonly";
    }

    writeOdooConfig(config);

    writeOdooProfiles(readOdooProfiles().filter((p) => p.id !== req.params.id));
    deleteOdooSecret(`${req.params.id}.password`);

    const secret_deleted = deleteOdooSecret(profile?.secret_ref);
    res.json({ ok: true, deleted: Boolean(profile), deleted_access_profiles: accessProfileIds.size, secret_deleted });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post("/odoo/access-profile", (req, res) => {
  const body = req.body || {};
  const id = slugId(body.id || body.label, "readonly");
  if (!body.connection_profile_id) {
    return res.status(400).json({ ok: false, error: "connection_profile_id is required" });
  }

  try {
    const config = readOdooConfig();
    const profile = {
      id,
      label: String(body.label || id),
      connection_profile_id: String(body.connection_profile_id),
      enabled: body.enabled ?? true,
      default_read_confirmation: Boolean(body.default_read_confirmation),
      default_create_confirmation: body.default_create_confirmation ?? true,
      default_write_confirmation: body.default_write_confirmation ?? true,
      default_delete_confirmation: body.default_delete_confirmation ?? true,
    };
    config.access_profiles = upsertById(config.access_profiles, profile);
    config.active_access_profile_id = body.active === false ? config.active_access_profile_id : id;
    writeOdooConfig(config);
    res.json({ ok: true, profile, active_access_profile_id: config.active_access_profile_id });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post("/odoo/permission-rule", (req, res) => {
  const body = req.body || {};
  const operation = String(body.operation || "");
  const allowedOperations = new Set(["read", "create", "write", "delete"]);
  if (!body.access_profile_id || !body.model || !body.field || !allowedOperations.has(operation)) {
    return res.status(400).json({
      ok: false,
      error: "access_profile_id, model, field and operation(read/create/write/delete) are required",
    });
  }

  try {
    const config = readOdooConfig();
    const id = slugId(
      body.id || `${body.access_profile_id}_${body.model}_${body.field}_${operation}`,
      "permission-rule"
    );
    const rule = {
      id,
      access_profile_id: String(body.access_profile_id),
      model: String(body.model).trim(),
      field: String(body.field).trim(),
      operation,
      allowed: body.allowed ?? true,
      require_confirmation: Boolean(body.require_confirmation),
    };
    if (Array.isArray(body.template_ids) && body.template_ids.length) {
      rule.template_ids = body.template_ids.filter(Boolean).map(String);
    }
    config.permission_rules = upsertById(config.permission_rules, rule);
    writeOdooConfig(config);
    res.json({ ok: true, rule });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.delete("/odoo/permission-rule/:id", (req, res) => {
  try {
    const config = readOdooConfig();
    config.permission_rules = config.permission_rules.filter((rule) => rule.id !== req.params.id);
    writeOdooConfig(config);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── SDK Odoo routes ───────────────────────────────────────────────────────

router.get("/sdk/odoo/profiles", async (_req, res) => {
  try {
    res.json(await sdkOdooConfig("list_profiles"));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post("/sdk/odoo/profile", async (req, res) => {
  try {
    res.json(await sdkOdooConfig("save_profile", req.body || {}));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.delete("/sdk/odoo/profile/:id", async (req, res) => {
  try {
    res.json(await sdkOdooConfig("delete_profile", { id: req.params.id }));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get("/sdk/odoo/rights", async (req, res) => {
  try {
    res.json(await sdkOdooConfig("list_rights", { profile_id: req.query.profile_id || "" }));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post("/sdk/odoo/right", async (req, res) => {
  try {
    res.json(await sdkOdooConfig("save_right", req.body || {}));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.delete("/sdk/odoo/right/:id", async (req, res) => {
  try {
    res.json(await sdkOdooConfig("delete_right", { id: req.params.id }));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get("/sdk/odoo/models/:profile_id", async (req, res) => {
  try {
    res.json(await sdkOdooConfig("list_odoo_models", { profile_id: req.params.profile_id }));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get("/sdk/odoo/fields/:profile_id/:model", async (req, res) => {
  try {
    res.json(await sdkOdooConfig("list_odoo_fields", { profile_id: req.params.profile_id, model: req.params.model }));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
