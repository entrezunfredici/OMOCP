import { Router } from "express";
import { readEnv, writeEnv, isAllowedEnvKey, publicEnv } from "../helpers/env.mjs";

const router = Router();

router.get("/env", (_req, res) => {
  const entries = readEnv();
  res.json({ ok: true, entries: publicEnv(entries) });
});

router.post("/env", (req, res) => {
  const updates = req.body;
  if (!updates || typeof updates !== "object") {
    return res.status(400).json({ ok: false, error: "Body must be a JSON object" });
  }
  const blocked = Object.keys(updates).filter((key) => !isAllowedEnvKey(key));
  if (blocked.length > 0) {
    return res.status(400).json({ ok: false, error: `Unsupported env keys: ${blocked.join(", ")}` });
  }
  try {
    const current = readEnv();
    const next = { ...current, ...updates };
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === "") delete next[k];
    }
    writeEnv(next);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
