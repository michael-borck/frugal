import { promises as fs } from "node:fs";
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
 * OpenCode: write an OpenAI-compatible provider entry into its JSON config and
 * set free-best as the default model. Additive only: existing providers are
 * preserved and the file is backed up once before the first change.
 */

interface OpenCodeConfig {
  [key: string]: unknown;
  provider?: Record<string, unknown>;
  model?: unknown;
}

export function openCodeConfigPath(): string {
  const base =
    process.platform === "darwin"
      ? path.join(os.homedir(), ".config", "opencode")
      : process.platform === "win32"
        ? path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "opencode")
        : path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"), "opencode");
  return path.join(base, "opencode.json");
}

export interface OpenCodeOptions {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  /** Override the resolved config path (used by tests). */
  configPath?: string;
}

export async function writeOpenCodeConfig(options: OpenCodeOptions = {}): Promise<IntegrationResult> {
  const configPath = options.configPath ?? openCodeConfigPath();
  const baseUrl = options.baseUrl ?? `http://${ROUTER_HOST}:${ROUTER_PORT}/v1`;
  const apiKey = options.apiKey ?? "frugal-local";
  const model = options.model ?? "free-best";

  const existing = (await readJson<OpenCodeConfig>(configPath)) ?? {};
  const provider = { ...(existing.provider ?? {}) };
  const previousFrugal =
    provider.frugal && typeof provider.frugal === "object"
      ? (provider.frugal as Record<string, unknown>)
      : {};
  const previousModels =
    previousFrugal.models && typeof previousFrugal.models === "object"
      ? (previousFrugal.models as Record<string, unknown>)
      : {};

  const frugalProvider = {
    ...previousFrugal,
    npm: "@ai-sdk/openai-compatible",
    name: "frugal (local 9Router)",
    options: {
      baseURL: baseUrl,
      apiKey,
    },
    models: {
      ...previousModels,
      [model]: { name: model },
    },
  };

  const next: OpenCodeConfig = {
    ...existing,
    provider: { ...provider, frugal: frugalProvider },
    model: `frugal/${model}`,
  };

  const backedUp = await backupOnce(configPath);
  await writeJsonAtomic(configPath, next);

  return {
    name: "opencode",
    changed: true,
    backedUp,
    configPath,
    detail: `Wrote provider "frugal" (base ${baseUrl}) and set default model to ${model}.`,
  };
}

export async function openCodeConfigured(configPath = openCodeConfigPath()): Promise<boolean> {
  try {
    const config = await readJson<OpenCodeConfig>(configPath);
    return config != null && config.provider != null && "frugal" in config.provider;
  } catch {
    return false;
  }
}

export async function readOpenCodeConfig(
  configPath = openCodeConfigPath(),
): Promise<OpenCodeConfig | null> {
  try {
    await fs.access(configPath);
  } catch {
    return null;
  }
  return readJson<OpenCodeConfig>(configPath);
}