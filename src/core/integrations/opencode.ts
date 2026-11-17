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
  compaction?: OpenCodeCompaction;
}

export interface OpenCodeCompaction {
  auto?: boolean;
  buffer?: number | string;
  keep?: { tokens?: number };
}

/** Defaults that make compaction fire early enough to leave room for a reply. */
export const DEFAULT_OPENCODE_COMPACTION: OpenCodeCompaction = {
  auto: true,
  buffer: "20%",
  keep: { tokens: 15000 },
};

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
  /**
   * Declare the combo's context window on the frugal model. The harness cannot
   * see the combo's members, so without this it may assume a default and compact
   * too late. Set to the combo's minimum window (see recommendedContextLimit).
   */
  contextLimit?: number;
  outputLimit?: number;
  /** Replace the compaction block outright (power users). Otherwise defaults are
   * written only when the student has no compaction block yet. */
  compaction?: OpenCodeCompaction;
  /** Override the resolved config path (used by tests). */
  configPath?: string;
}

export async function writeOpenCodeConfig(options: OpenCodeOptions = {}): Promise<IntegrationResult> {
  const configPath = options.configPath ?? openCodeConfigPath();
  const baseUrl = options.baseUrl ?? `http://${ROUTER_HOST}:${ROUTER_PORT}/v1`;
  const apiKey = options.apiKey ?? "";
  const model = options.model ?? "free-best";

  const existing = (await readJson<OpenCodeConfig>(configPath)) ?? {};
  const provider = { ...(existing.provider ?? {}) };
  const previousFrugal =
    provider.router9 && typeof provider.router9 === "object"
      ? (provider.router9 as Record<string, unknown>)
      : {};
  const previousModels =
    previousFrugal.models && typeof previousFrugal.models === "object"
      ? (previousFrugal.models as Record<string, unknown>)
      : {};
  const previousModel =
    previousModels[model] && typeof previousModels[model] === "object"
      ? (previousModels[model] as Record<string, unknown>)
      : {};

  const modelEntry: Record<string, unknown> = { ...previousModel, name: model };
  if (options.contextLimit != null) {
    const output =
      options.outputLimit ?? Math.min(32768, Math.max(1024, Math.floor(options.contextLimit / 4)));
    modelEntry.limit = { context: options.contextLimit, output };
  }

  const routerProvider = {
    ...previousFrugal,
    npm: "@ai-sdk/openai-compatible",
    name: "Router9 (local)",
    options: {
      baseURL: baseUrl,
      apiKey,
    },
    models: {
      ...previousModels,
      [model]: modelEntry,
    },
  };

  const compaction: OpenCodeCompaction =
    options.compaction ?? existing.compaction ?? DEFAULT_OPENCODE_COMPACTION;
  const compactionWritten = options.compaction != null || existing.compaction == null;

  const next: OpenCodeConfig = {
    ...existing,
    provider: { ...provider, router9: routerProvider },
    model: `router9/${model}`,
    compaction,
  };

  const backedUp = await backupOnce(configPath);
  await writeJsonAtomic(configPath, next);

  const limitText =
    options.contextLimit != null ? `, context limit ${options.contextLimit}` : "";
  const compactionText = compactionWritten
    ? "wrote compaction defaults"
    : "kept existing compaction settings";
  return {
    name: "opencode",
    changed: true,
    backedUp,
    configPath,
    detail: `Wrote provider "router9" (base ${baseUrl}), default model ${model}${limitText}; ${compactionText}.`,
  };
}

export async function openCodeConfigured(configPath = openCodeConfigPath()): Promise<boolean> {
  try {
    const config = await readJson<OpenCodeConfig>(configPath);
    return config != null && config.provider != null && "router9" in config.provider;
  } catch {
    return false;
  }
}

export async function openCodeCompactionConfigured(
  configPath = openCodeConfigPath(),
): Promise<boolean> {
  try {
    const config = await readJson<OpenCodeConfig>(configPath);
    return config?.compaction != null && config.compaction.auto !== false;
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