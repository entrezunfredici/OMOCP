/**
 * JS bridge to the Python data_manager package.
 *
 * Spawns the Python CLI (`omocp_main.data_manager.cli`) as a subprocess,
 * sends a JSON request via stdin, and returns the parsed JSON response.
 *
 * Usage:
 *   import { dataManager } from "./bridge.mjs";
 *
 *   // Save a record (public fields go to file, secret fields go to keyring)
 *   await dataManager.save({
 *     filePath:       "/workspace/omop-plugin-config.json",
 *     keyringService: "odoo-plugin",
 *     secretFields:   ["password"],
 *     pkField:        "id",
 *     data:           { id: "main", label: "Main", baseUrl: "https://…", password: "s3cr3t" },
 *   });
 *
 *   // Read with secrets resolved
 *   const profile = await dataManager.get({ …, pk: "main" });
 *
 *   // Public records only (for API responses — no secrets)
 *   const list = await dataManager.listPublic({ filePath, keyringService, secretFields, pkField });
 *
 *   // Delete record + its secrets
 *   await dataManager.delete({ …, pk: "main" });
 */

import { spawn }       from "node:child_process";
import { existsSync }  from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath }    from "node:url";

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const venvPython = process.platform === "win32"
  ? resolve(pluginRoot, ".venv", "Scripts", "python.exe")
  : resolve(pluginRoot, ".venv", "bin", "python");

function resolvePython() {
  if (process.env.PYTHON) return process.env.PYTHON;
  return existsSync(venvPython) ? venvPython : (process.platform === "win32" ? "python" : "python3");
}

function runCli(request) {
  return new Promise((res, rej) => {
    const child = spawn(resolvePython(), ["-m", "omocp_main.data_manager.cli"], {
      cwd: pluginRoot,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("error", rej);
    child.on("close", (code) => {
      if (code !== 0) {
        rej(new Error(stderr.trim() || `data_manager CLI exited with code ${code}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        if (!parsed.ok) {
          const { code: errCode, message } = parsed.error ?? {};
          rej(Object.assign(new Error(message ?? "data_manager error"), { code: errCode }));
        } else {
          res(parsed.result);
        }
      } catch {
        rej(new Error(`Invalid JSON from data_manager CLI: ${stdout}`));
      }
    });

    child.stdin.write(JSON.stringify(request));
    child.stdin.end();
  });
}

// ------------------------------------------------------------------
// Public API
// ------------------------------------------------------------------

/**
 * @typedef {Object} TableOptions
 * @property {string}   filePath        - Absolute path to the JSON data file
 * @property {string}   keyringService  - Service name used in the keyring file
 * @property {string[]} [secretFields]  - Field names whose values are stored in the keyring
 * @property {string}   [pkField]       - Primary key field name (default: "id")
 */

function base(opts) {
  return {
    file_path:       opts.filePath,
    keyring_service: opts.keyringService,
    secret_fields:   opts.secretFields ?? [],
    pk_field:        opts.pkField ?? "id",
  };
}

export const dataManager = {
  /** Insert or update a record. */
  save(opts)       { return runCli({ ...base(opts), action: "save",         data: opts.data }); },

  /** Get a record with secrets. Rejects if not found. */
  get(opts)        { return runCli({ ...base(opts), action: "get",          pk: opts.pk }); },

  /** Get a record with secrets, or null if not found. */
  getOrNone(opts)  { return runCli({ ...base(opts), action: "get_or_none",  pk: opts.pk }); },

  /** List all records with secrets resolved. */
  list(opts)       { return runCli({ ...base(opts), action: "list" }); },

  /** List all records without secrets (safe for API responses). */
  listPublic(opts) { return runCli({ ...base(opts), action: "list_public" }); },

  /** Delete a record and its secrets. Returns true if it existed. */
  delete(opts)     { return runCli({ ...base(opts), action: "delete",       pk: opts.pk }); },
};
