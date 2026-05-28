import crypto from "crypto";
import fs from "fs";
import path from "path";
import { ENV_PATH, GATEWAY_ENV_PATH, ALLOWED_ENV_KEYS, SENSITIVE_ENV_PATTERN } from "../config.mjs";

export function parseEnv(raw) {
  const lines = raw.split(/\r?\n/);
  const entries = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    entries[key] = val;
  }
  return entries;
}

export function serializeEnv(entries) {
  return (
    Object.entries(entries)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") + "\n"
  );
}

export function readEnv() {
  if (!fs.existsSync(ENV_PATH)) return {};
  return parseEnv(fs.readFileSync(ENV_PATH, "utf8"));
}

export function writeEnv(entries) {
  fs.mkdirSync(path.dirname(ENV_PATH), { recursive: true });
  fs.writeFileSync(ENV_PATH, serializeEnv(entries), { mode: 0o600 });
}

export function readGatewayToken() {
  const envToken = String(process.env.ENV_API_AUTH_TOKEN || process.env.OPENCLAW_GATEWAY_TOKEN || "").trim();
  if (envToken) return envToken;
  if (!fs.existsSync(GATEWAY_ENV_PATH)) return "";
  const parsed = parseEnv(fs.readFileSync(GATEWAY_ENV_PATH, "utf8"));
  return parsed.ENV_API_AUTH_TOKEN || parsed.OPENCLAW_GATEWAY_TOKEN || "";
}

export function extractBearerToken(req) {
  const header = String(req.get("authorization") || "");
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (match) return match[1].trim();
  return String(req.get("x-doodoo-env-token") || "").trim();
}

export function timingSafeEqualString(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function requireAuth(req, res, next) {
  const expected = readGatewayToken();
  if (!expected) {
    return res.status(503).json({ ok: false, error: "env-api auth token is not initialized yet" });
  }
  if (!timingSafeEqualString(extractBearerToken(req), expected)) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  return next();
}

export function isAllowedEnvKey(key) {
  return ALLOWED_ENV_KEYS.has(key) && /^[A-Z_][A-Z0-9_]*$/.test(key);
}

export function publicEnv(entries) {
  return Object.fromEntries(
    Object.entries(entries).filter(([key]) => isAllowedEnvKey(key) && !SENSITIVE_ENV_PATTERN.test(key))
  );
}
