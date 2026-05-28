import net from "net";
import dns from "dns/promises";
import { PROVIDER_FETCH_ALLOWED_HOSTS } from "../config.mjs";

export function isPrivateIp(address) {
  const version = net.isIP(address);
  if (version === 4) {
    const parts = address.split(".").map((part) => Number.parseInt(part, 10));
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      parts[0] === 0
    );
  }
  if (version === 6) {
    const normalized = address.toLowerCase();
    return (
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:")
    );
  }
  return false;
}

function isLocalProviderHost(hostname) {
  return hostname === "ollama" || hostname === "localhost" || hostname.endsWith(".localhost");
}

async function assertPublicHostname(hostname) {
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error("provider url must not target a private address");
    return;
  }
  const records = await dns.lookup(hostname, { all: true });
  if (records.length === 0 || records.some((record) => isPrivateIp(record.address))) {
    throw new Error("provider url must resolve only to public addresses");
  }
}

export async function validateProviderFetchUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || "").trim());
  } catch {
    throw new Error("invalid provider url");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("provider url protocol must be http or https");
  }
  const hostname = parsed.hostname.toLowerCase();
  if (parsed.protocol !== "https:") {
    if (parsed.protocol === "http:" && isLocalProviderHost(hostname)) {
      return parsed.toString().replace(/\/$/, "");
    }
    throw new Error("external provider urls must use https");
  }
  if (!PROVIDER_FETCH_ALLOWED_HOSTS.has(hostname)) await assertPublicHostname(hostname);
  return parsed.toString().replace(/\/$/, "");
}

export async function fetchJson(url, options = {}) {
  const timeoutMs = Number.parseInt(process.env.ENV_API_FETCH_TIMEOUT_MS || "7000", 10);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 7000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}
