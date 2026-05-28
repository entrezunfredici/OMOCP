/**
 * Bridge Node.js → omocp_providers.cli_config (Python).
 *
 * SDK_PLUGIN_PATH env var must point to the plugin root directory.
 * Defaults to /workspace/plugins/sdk-plugin.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const pluginRoot = process.env.SDK_PLUGIN_PATH || "/workspace/plugins/sdk-plugin";
const venvPython =
  process.platform === "win32"
    ? resolve(pluginRoot, ".venv", "Scripts", "python.exe")
    : resolve(pluginRoot, ".venv", "bin", "python");

function resolvePython() {
  if (process.env.PYTHON) return process.env.PYTHON;
  return existsSync(venvPython) ? venvPython : "python3";
}

export function sdkProviders(action, payload = {}) {
  return new Promise((res, rej) => {
    const python = resolvePython();
    const child = spawn(python, ["-m", "omocp_providers.cli_config"], {
      cwd: pluginRoot,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("error", rej);
    child.on("close", (code) => {
      if (code !== 0) {
        rej(new Error(stderr || `Python exited with code ${code}`));
        return;
      }
      try {
        res(JSON.parse(stdout));
      } catch {
        rej(new Error(`Invalid JSON from Python: ${stdout}`));
      }
    });

    child.stdin.write(JSON.stringify({ action, payload }));
    child.stdin.end();
  });
}
