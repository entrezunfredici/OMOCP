import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ActionResult } from "./types.js";

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultPythonCommand = process.platform === "win32" ? "python" : "python3";
const venvPythonCommand =
    process.platform === "win32"
        ? resolve(pluginRoot, ".venv", "Scripts", "python.exe")
        : resolve(pluginRoot, ".venv", "bin", "python");

function resolvePythonCommand(): string {
    if (process.env.PYTHON) {
        return process.env.PYTHON;
    }

    return existsSync(venvPythonCommand) ? venvPythonCommand : defaultPythonCommand;
}

export interface SdkOdooRequest {
    action: string;
    model?: string;
    payload: Record<string, unknown>;
}

function spawnPythonCli(module: string, request: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolvePromise, rejectPromise) => {
        const pythonCommand = resolvePythonCommand();
        const child = spawn(pythonCommand, ["-m", module], {
            cwd: pluginRoot,
            stdio: ["pipe", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
        child.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });
        child.on("error", (error: Error) => { rejectPromise(error); });

        child.on("close", (code: number | null) => {
            if (code !== 0) {
                rejectPromise(new Error(stderr || `Python process exited with code ${code}`));
                return;
            }
            try {
                resolvePromise(JSON.parse(stdout));
            } catch {
                rejectPromise(new Error(`Invalid JSON from Python: ${stdout}`));
            }
        });

        child.stdin.write(JSON.stringify(request));
        child.stdin.end();
    });
}

/** Call the omocp_odoo AI executor (profile-based rights, no config object needed). */
export function runSdkOdooAction<T = ActionResult>(request: SdkOdooRequest): Promise<T> {
    return spawnPythonCli("omocp_odoo.cli", request as unknown as Record<string, unknown>) as Promise<T>;
}

export interface SdkOdooConfigRequest {
    action: string;
    payload: Record<string, unknown>;
}

/** Call the omocp_odoo config executor (profile & right CRUD, live Odoo meta). */
export function runSdkOdooConfig<T = ActionResult>(request: SdkOdooConfigRequest): Promise<T> {
    return spawnPythonCli("omocp_odoo.cli_config", request as unknown as Record<string, unknown>) as Promise<T>;
}
