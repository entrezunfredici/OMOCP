import fs from "node:fs";

function sanitizePluginConfig(value) {
  if (Array.isArray(value)) {
    return value
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => sanitizePluginConfig(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !key.startsWith("_"))
        .map(([key, entry]) => [key, sanitizePluginConfig(entry)]),
    );
  }

  return value;
}

function readOdooPluginConfig(odooPluginConfigPath) {
  if (!fs.existsSync(odooPluginConfigPath)) return {};
  try {
    return sanitizePluginConfig(JSON.parse(fs.readFileSync(odooPluginConfigPath, "utf8")));
  } catch (error) {
    console.warn("Cannot read OMOCP plugin config:", error.message);
    return {};
  }
}

export function configureOdooPlugin(config, { enableOdooPlugin, odooPluginPath, odooPluginConfigPath }) {
  config.plugins = config.plugins || {};
  config.plugins.entries = config.plugins.entries || {};

  if (!enableOdooPlugin) {
    if (config.plugins.entries["odoo-plugin"]) {
      config.plugins.entries["odoo-plugin"] = {
        ...config.plugins.entries["odoo-plugin"],
        enabled: false,
      };
    }
    return;
  }

  if (!fs.existsSync(odooPluginPath)) return;

  config.plugins.enabled = true;
  config.plugins.load = config.plugins.load || {};
  const loadPaths = Array.isArray(config.plugins.load.paths) ? config.plugins.load.paths : [];
  if (!loadPaths.includes(odooPluginPath)) loadPaths.push(odooPluginPath);
  config.plugins.load.paths = loadPaths;

  config.plugins.entries["odoo-plugin"] = {
    ...config.plugins.entries["odoo-plugin"],
    enabled: true,
    config: {
      ...readOdooPluginConfig(odooPluginConfigPath),
      ...config.plugins.entries["odoo-plugin"]?.config,
    },
  };
}
