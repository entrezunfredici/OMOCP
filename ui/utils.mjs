export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function stripOuterQuotes(value) {
  const trimmed = String(value || "").trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function normalizeAlias(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function inferModelAlias(model) {
  const shortName = String(model || "").split("/").filter(Boolean).pop() || model;
  if (shortName === "gemini-3-flash-preview") return "gemini-flash";
  return normalizeAlias(shortName);
}

export function uniqueBy(items, keyFn) {
  const byKey = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!key || byKey.has(key)) continue;
    byKey.set(key, item);
  }
  return [...byKey.values()];
}

export function normalizeBaseUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}
