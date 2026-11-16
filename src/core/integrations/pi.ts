import * as os from "node:os";
import * as path from "node:path";
import { ROUTER_HOST, ROUTER_PORT } from "../types.js";
import {
  backupOnce,
  readJson,
  writeJsonAtomic,
  type IntegrationResult,
} from "./base.js";

/**
 * Pi: the community 9Router extension stores its settings in
 * ~/.pi/agent/9router-config.json. Write the URL and key there. Additive only.
 */

export function piConfigPath(): string {
  return path.join(os.homedir(), ".pi", "agent", "9router-config.json");
}

interface PiConfig {
  [key: string]: unknown;
  url?: string;
  apiKey?: string;
  models?: unknown;
}

export interface PiOptions {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  /** Override the resolved config path (used by tests). */
  configPath?: string;
}

export async function writePiConfig(options: PiOptions = {}): Promise<IntegrationResult> {
  const configPath = options.configPath ?? piConfigPath();
  const baseUrl = options.baseUrl ?? `http://${ROUTER_HOST}:${ROUTER_PORT}/v1`;
  const apiKey = options.apiKey ?? "frugal-local";
  const model = options.model ?? "free-best";

  const existing = (await readJson<PiConfig>(configPath)) ?? {};
  const next: PiConfig = {
    ...existing,
    url: baseUrl,
    apiKey,
    models: existing.models ?? [model],
  };
  if (!Array.isArray(next.models) || !next.models.includes(model)) {
    next.models = Array.isArray(next.models) ? [...next.models, model] : [model];
  }

  const backedUp = await backupOnce(configPath);
  await writeJsonAtomic(configPath, next);

  return {
    name: "pi",
    changed: true,
    backedUp,
    configPath,
    detail: `Wrote 9Router extension settings (url ${baseUrl}, model ${model}).`,
  };
}

export async function piConfigured(configPath = piConfigPath()): Promise<boolean> {
  const config = await readJson<PiConfig>(configPath);
  return config != null && config.url != null;
}