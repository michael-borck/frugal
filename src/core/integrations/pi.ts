import * as os from "node:os";
import * as path from "node:path";
import { ROUTER_HOST, ROUTER_PORT } from "../types.js";
import { backupOnce, readJson, writeJsonAtomic, type IntegrationResult } from "./base.js";

/**
 * Pi: add a provider to ~/.pi/agent/models.json, the format the unit's labs use.
 * Providers such as Ollama and the shared server are preserved; only the
 * frugal/9Router provider is added or updated. This mirrors the lab's
 * setup-pi.mjs rather than relying on a community extension.
 */

export const PI_PROVIDER_ID = "9router";

export function piConfigPath(): string {
  return path.join(os.homedir(), ".pi", "agent", "models.json");
}

interface PiModelsFile {
  [key: string]: unknown;
  providers?: Record<string, unknown>;
}

export interface PiOptions {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  /** Extra model ids to expose in Pi (e.g. verified models). */
  models?: string[];
  /** Override the resolved config path (used by tests). */
  configPath?: string;
}

export async function writePiConfig(options: PiOptions = {}): Promise<IntegrationResult> {
  const configPath = options.configPath ?? piConfigPath();
  const baseUrl = options.baseUrl ?? `http://${ROUTER_HOST}:${ROUTER_PORT}/v1`;
  const apiKey = options.apiKey ?? "";
  const model = options.model ?? "free-best";

  const existing = (await readJson<PiModelsFile>(configPath)) ?? {};
  const providers = { ...(existing.providers ?? {}) };
  const previous = providers[PI_PROVIDER_ID];
  const previousRecord =
    previous && typeof previous === "object" ? (previous as Record<string, unknown>) : {};

  const ids = [...new Set([model, ...(options.models ?? [])])];
  providers[PI_PROVIDER_ID] = {
    ...previousRecord,
    baseUrl,
    api: "openai-completions",
    apiKey,
    models: ids.map((id) => ({ id })),
  };

  const next: PiModelsFile = { ...existing, providers };

  const backedUp = await backupOnce(configPath);
  await writeJsonAtomic(configPath, next);

  return {
    name: "pi",
    changed: true,
    backedUp,
    configPath,
    detail: `Added Pi provider "${PI_PROVIDER_ID}" with ${ids.length} models (including ${model}).`,
  };
}

export async function piConfigured(configPath = piConfigPath()): Promise<boolean> {
  const config = await readJson<PiModelsFile>(configPath);
  return config?.providers != null && PI_PROVIDER_ID in config.providers;
}