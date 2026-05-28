import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const venvDir = resolve(pluginRoot, ".venv");
const requirementsPath = resolve(pluginRoot, "requirements.txt");

if (!existsSync(requirementsPath)) {
  console.log("[install:python] No requirements.txt found, skipping.");
  process.exit(0);
}

const python3 = "python3";
const pip = resolve(venvDir, "bin", "pip");

if (!existsSync(venvDir)) {
  console.log("[install:python] Creating virtual environment…");
  execFileSync(python3, ["-m", "venv", venvDir], { stdio: "inherit" });
}

console.log("[install:python] Installing Python dependencies…");
execFileSync(pip, ["install", "-r", requirementsPath], { stdio: "inherit" });
console.log("[install:python] Done.");
