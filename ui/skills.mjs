import fs from "node:fs";
import path from "node:path";
import { isPlainObject } from "./utils.mjs";

const ignoredDirectories = new Set([
  ".cache",
  ".git",
  ".mypy_cache",
  ".pytest_cache",
  ".venv",
  "__pycache__",
  "build",
  "dist",
  "node_modules",
  "venv",
]);

function extractFrontmatter(content) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  return match ? match[1] : "";
}

function unquoteScalar(value) {
  const trimmed = String(value || "").trim().replace(/,$/, "").trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function readFrontmatterScalar(frontmatter, key) {
  const pattern = new RegExp(`^\\s*${key}\\s*:\\s*(.+?)\\s*$`, "m");
  const match = pattern.exec(frontmatter);
  return match ? unquoteScalar(match[1]) : "";
}

function readOpenClawSkillKey(frontmatter) {
  const jsonStyle = /["']skillKey["']\s*:\s*["']([^"']+)["']/.exec(frontmatter);
  if (jsonStyle) return jsonStyle[1].trim();

  const yamlStyle = /^\s*skillKey\s*:\s*["']?([^"',}\s]+)["']?/m.exec(frontmatter);
  return yamlStyle ? yamlStyle[1].trim() : "";
}

function normalizeSkillKey(value) {
  const key = String(value || "").trim();
  return key || "";
}

function readSkillKey(skillFilePath, fallback) {
  try {
    const frontmatter = extractFrontmatter(fs.readFileSync(skillFilePath, "utf8"));
    return normalizeSkillKey(
      readOpenClawSkillKey(frontmatter) ||
        readFrontmatterScalar(frontmatter, "name") ||
        fallback,
    );
  } catch {
    return normalizeSkillKey(fallback);
  }
}

function shouldSkipDirectory(name) {
  return name.startsWith(".") || ignoredDirectories.has(name);
}

function listSkillEntries(rootPath, { maxDepth = 8, maxEntries = 500 } = {}) {
  if (!fs.existsSync(rootPath)) return [];

  const entries = [];
  const seenPaths = new Set();

  function visit(directoryPath, depth) {
    if (depth > maxDepth || entries.length >= maxEntries) return;

    let realPath = directoryPath;
    try {
      realPath = fs.realpathSync(directoryPath);
    } catch {
      return;
    }
    if (seenPaths.has(realPath)) return;
    seenPaths.add(realPath);

    const skillFilePath = path.join(directoryPath, "SKILL.md");
    try {
      if (fs.existsSync(skillFilePath) && fs.statSync(skillFilePath).isFile()) {
        entries.push({
          key: readSkillKey(skillFilePath, path.basename(directoryPath)),
          filePath: skillFilePath,
        });
      }
    } catch {
      return;
    }

    let dirents = [];
    try {
      dirents = fs.readdirSync(directoryPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of dirents) {
      if (!entry.isDirectory()) continue;
      if (shouldSkipDirectory(entry.name)) continue;
      visit(path.join(directoryPath, entry.name), depth + 1);
    }
  }

  visit(rootPath, 0);

  return entries
    .filter((entry) => entry.key)
    .sort((left, right) => left.key.localeCompare(right.key));
}

function uniqueSkillEntries(roots) {
  const byKey = new Map();
  for (const root of roots) {
    for (const entry of listSkillEntries(root)) {
      if (!byKey.has(entry.key)) byKey.set(entry.key, entry);
    }
  }
  return [...byKey.values()].sort((left, right) => left.key.localeCompare(right.key));
}

function appendUniqueStrings(target, values) {
  const seen = new Set(target);
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    target.push(value);
    seen.add(value);
  }
  return target;
}

function skillDirectories(entries) {
  return entries
    .map((entry) => path.dirname(entry.filePath))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

export function resolvePluginSkillRoots(pluginPath) {
  const manifestPath = path.join(pluginPath, "openclaw.plugin.json");
  let declaredRoots = [];

  try {
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      if (Array.isArray(manifest.skills)) {
        declaredRoots = manifest.skills
          .filter((entry) => typeof entry === "string" && entry.trim())
          .map((entry) => path.resolve(pluginPath, entry));
      }
    }
  } catch (error) {
    console.warn(`Cannot read plugin skill roots from ${manifestPath}:`, error.message);
  }

  const fallbackRoot = path.join(pluginPath, "skills");
  if (fs.existsSync(fallbackRoot)) declaredRoots.push(fallbackRoot);
  return [...new Set(declaredRoots)];
}

export function configureSkillInventory(config, { bundledSkillsPath, managedSkillRoots = [] }) {
  const bundledSkills = uniqueSkillEntries([bundledSkillsPath]);
  const managedSkills = uniqueSkillEntries(managedSkillRoots);
  const allSkills = uniqueSkillEntries([bundledSkillsPath, ...managedSkillRoots]);

  if (allSkills.length === 0) return;

  config.skills = isPlainObject(config.skills) ? config.skills : {};
  config.skills.load = isPlainObject(config.skills.load) ? config.skills.load : {};

  if (!Array.isArray(config.skills.allowBundled) && bundledSkills.length > 0) {
    config.skills.allowBundled = bundledSkills.map((entry) => entry.key);
  }

  const extraDirs = Array.isArray(config.skills.load.extraDirs)
    ? config.skills.load.extraDirs.filter((entry) => typeof entry === "string" && entry.trim())
    : [];
  config.skills.load.extraDirs = appendUniqueStrings(extraDirs, skillDirectories(managedSkills));

  config.skills.entries = isPlainObject(config.skills.entries) ? config.skills.entries : {};
  for (const skill of allSkills) {
    const current = config.skills.entries[skill.key];
    if (!isPlainObject(current)) {
      config.skills.entries[skill.key] = { enabled: true };
    } else if (typeof current.enabled !== "boolean") {
      config.skills.entries[skill.key] = { ...current, enabled: true };
    }
  }

  config.skills.install = isPlainObject(config.skills.install) ? config.skills.install : {};
  config.skills.install.nodeManager = config.skills.install.nodeManager || "npm";
}
