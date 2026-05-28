import express from "express";
import fs from "fs";
import cors from "cors";
import { PORT, MAX_JSON_BYTES, ALLOWED_ORIGINS, ODOO_PLUGIN_CONFIG_PATH } from "./config.mjs";
import { requireAuth, readGatewayToken, extractBearerToken, timingSafeEqualString } from "./helpers/env.mjs";
import { readOdooConfig, writeOdooConfig } from "./helpers/odoo.mjs";
import envRouter from "./routes/env.mjs";
import odooRouter from "./routes/odoo.mjs";
import providersRouter from "./routes/providers.mjs";
import { internalRouter as confirmInternalRouter, router as confirmRouter } from "./routes/confirm.mjs";
import { startProviderRefreshLoop } from "./helpers/provider-refresh.mjs";

const app = express();

app.use(cors({
  origin(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.has(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed by env-api CORS policy"));
  },
}));
app.use(express.json({ limit: Number.isFinite(MAX_JSON_BYTES) && MAX_JSON_BYTES > 0 ? `${MAX_JSON_BYTES}b` : "1mb" }));

// ── Public routes ─────────────────────────────────────────────────────────

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/auth/validate", (req, res) => {
  const expected = readGatewayToken();
  if (!expected) return res.status(503).end();
  const provided = extractBearerToken(req);
  if (!provided || !timingSafeEqualString(provided, expected)) return res.status(401).end();
  res.status(200).end();
});

// ── Internal endpoints (private IP only, no auth) ─────────────────────────

app.use(confirmInternalRouter);

// ── Authenticated routes ──────────────────────────────────────────────────

app.use((req, res, next) => {
  if (req.get("x-doodoo-internal") === "1") return next();
  return requireAuth(req, res, next);
});

app.use(envRouter);
app.use(odooRouter);
app.use(providersRouter);
app.use(confirmRouter);

// ── Init ──────────────────────────────────────────────────────────────────

function initOdooConfigFile() {
  try {
    const stat = fs.statSync(ODOO_PLUGIN_CONFIG_PATH);
    if (!stat.isFile()) {
      fs.rmSync(ODOO_PLUGIN_CONFIG_PATH, { recursive: true, force: true });
      writeOdooConfig(readOdooConfig());
      console.log(`[env-api] created missing config at ${ODOO_PLUGIN_CONFIG_PATH}`);
    }
  } catch (e) {
    if (e.code === "ENOENT") {
      writeOdooConfig(readOdooConfig());
      console.log(`[env-api] created missing config at ${ODOO_PLUGIN_CONFIG_PATH}`);
    }
  }
}

initOdooConfigFile();

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[env-api] listening on :${PORT} — ENV_FILE_PATH=${process.env.ENV_FILE_PATH ?? "/workspace/.env"}`);
  startProviderRefreshLoop();
});
