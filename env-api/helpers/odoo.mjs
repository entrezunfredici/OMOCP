import fs from "fs";
import path from "path";
import {
  ODOO_PLUGIN_CONFIG_PATH,
  ODOO_PLUGIN_KEYRING_PATH,
  ODOO_PROFILES_PATH,
} from "../config.mjs";

export function sanitizeConfig(value) {
  if (Array.isArray(value)) {
    return value.filter((entry) => entry && typeof entry === "object").map((entry) => sanitizeConfig(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !key.startsWith("_") && key !== "password" && key !== "secret_value")
        .map(([key, entry]) => [key, sanitizeConfig(entry)])
    );
  }
  return value;
}

const ODOO_CONFIG_DEFAULTS = {
  active_connection_profile_id: "default",
  active_access_profile_id: "readonly",
  read_only: true,
  default_limit: 25,
  connection_profiles: [],
  access_profiles: [],
  permission_rules: [],
  templates: [],
};

export function readOdooConfig() {
  if (!fs.existsSync(ODOO_PLUGIN_CONFIG_PATH)) return { ...ODOO_CONFIG_DEFAULTS };
  try {
    const parsed = JSON.parse(fs.readFileSync(ODOO_PLUGIN_CONFIG_PATH, "utf8"));
    return sanitizeConfig({
      active_connection_profile_id: parsed.active_connection_profile_id || "default",
      active_access_profile_id: parsed.active_access_profile_id || "readonly",
      read_only: parsed.read_only ?? parsed.readOnly ?? true,
      default_limit: parsed.default_limit ?? parsed.defaultLimit ?? 25,
      connection_profiles: Array.isArray(parsed.connection_profiles) ? parsed.connection_profiles : [],
      access_profiles: Array.isArray(parsed.access_profiles) ? parsed.access_profiles : [],
      permission_rules: Array.isArray(parsed.permission_rules) ? parsed.permission_rules : [],
      templates: Array.isArray(parsed.templates) ? parsed.templates : [],
    });
  } catch {
    return { ...ODOO_CONFIG_DEFAULTS };
  }
}

export function writeOdooConfig(config) {
  fs.mkdirSync(path.dirname(ODOO_PLUGIN_CONFIG_PATH), { recursive: true });
  fs.writeFileSync(ODOO_PLUGIN_CONFIG_PATH, JSON.stringify(sanitizeConfig(config), null, 2) + "\n", { mode: 0o600 });
  fs.chmodSync(ODOO_PLUGIN_CONFIG_PATH, 0o600);
}

export function readOdooProfiles() {
  if (!fs.existsSync(ODOO_PROFILES_PATH)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(ODOO_PROFILES_PATH, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function writeOdooProfiles(profiles) {
  fs.mkdirSync(path.dirname(ODOO_PROFILES_PATH), { recursive: true });
  fs.writeFileSync(ODOO_PROFILES_PATH, JSON.stringify(profiles, null, 2) + "\n", { mode: 0o600 });
  fs.chmodSync(ODOO_PROFILES_PATH, 0o600);
}

export function slugId(value, fallback = "default") {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

export function secretEnvName(secretRef) {
  return `ODOO_SECRET_${String(secretRef || "").toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`;
}

export function readOdooKeyring() {
  if (!fs.existsSync(ODOO_PLUGIN_KEYRING_PATH)) return { version: 1, services: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(ODOO_PLUGIN_KEYRING_PATH, "utf8"));
    if (!parsed || typeof parsed !== "object") return { version: 1, services: {} };
    if (!parsed.services || typeof parsed.services !== "object") parsed.services = {};
    return parsed;
  } catch {
    return { version: 1, services: {} };
  }
}

export function writeOdooKeyring(store) {
  fs.mkdirSync(path.dirname(ODOO_PLUGIN_KEYRING_PATH), { recursive: true });
  fs.writeFileSync(ODOO_PLUGIN_KEYRING_PATH, JSON.stringify(store, null, 2) + "\n", { mode: 0o600 });
  fs.chmodSync(ODOO_PLUGIN_KEYRING_PATH, 0o600);
}

export function saveOdooSecret(secretRef, secretValue) {
  const ref = String(secretRef || "").trim();
  const value = String(secretValue || "");
  if (!ref || !value) return false;
  const store = readOdooKeyring();
  store.services["odoo-plugin"] = { ...(store.services["odoo-plugin"] || {}), [ref]: value };
  writeOdooKeyring(store);
  return true;
}

export function deleteOdooSecret(secretRef) {
  const ref = String(secretRef || "").trim();
  if (!ref) return false;
  const store = readOdooKeyring();
  const service = store.services["odoo-plugin"];
  if (!service || typeof service !== "object" || !(ref in service)) return false;
  delete service[ref];
  if (Object.keys(service).length === 0) delete store.services["odoo-plugin"];
  writeOdooKeyring(store);
  return true;
}

export function hasOdooSecret(secretRef) {
  const service = readOdooKeyring().services["odoo-plugin"] || {};
  return typeof service[secretRef] === "string" && service[secretRef].length > 0;
}
