import { Router } from "express";
import fs from "fs";
import path from "path";
import { isPrivateIp } from "../helpers/network.mjs";
import { GATEWAY_ENV_PATH } from "../config.mjs";

const _pendingConfirms = new Map();

function requirePrivateIp(req, res, next) {
  const raw = String(req.ip || req.socket?.remoteAddress || "");
  const ip = raw.replace(/^::ffff:/, "");
  if (!isPrivateIp(ip)) return res.status(403).json({ ok: false, error: "internal endpoint" });
  return next();
}

// Routes accessibles depuis l'IP privée uniquement (appelées par le plugin, sans auth Bearer)
export const internalRouter = Router();

internalRouter.post("/confirm/pending", requirePrivateIp, (req, res) => {
  const { id, operation, model, profile_id, details } = req.body || {};
  if (!id || !operation || !model) return res.status(400).json({ ok: false, error: "id, operation, model requis" });
  _pendingConfirms.set(id, {
    id, operation, model, profile_id: profile_id || "",
    details: details || {},
    createdAt: Date.now(),
    resolved: false,
    allowed: null,
  });
  setTimeout(() => {
    const e = _pendingConfirms.get(id);
    if (e && !e.resolved) { e.resolved = true; e.allowed = false; }
  }, 90000);
  res.json({ ok: true });
});

internalRouter.get("/confirm/pending/:id", requirePrivateIp, (req, res) => {
  const e = _pendingConfirms.get(req.params.id);
  if (!e) return res.status(404).json({ ok: false });
  res.json({ ok: true, resolved: e.resolved, allowed: e.allowed });
});

// Routes authentifiées (appelées par l'UI)
export const router = Router();

router.get("/confirm/pending", (_req, res) => {
  const pending = [..._pendingConfirms.values()].filter((e) => !e.resolved);
  res.json({ ok: true, pending });
});

router.post("/confirm/respond/:id", (req, res) => {
  const e = _pendingConfirms.get(req.params.id);
  if (!e || e.resolved) return res.status(404).json({ ok: false, error: "not found or already resolved" });
  e.resolved = true;
  e.allowed = !!req.body?.allowed;
  setTimeout(() => _pendingConfirms.delete(req.params.id), 5000);
  res.json({ ok: true, allowed: e.allowed });
});

router.post("/gateway/reload", (_req, res) => {
  const triggerPath = path.join(path.dirname(GATEWAY_ENV_PATH), ".gateway-reload");
  try {
    fs.writeFileSync(triggerPath, new Date().toISOString() + "\n", { mode: 0o644 });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
