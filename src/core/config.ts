import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  DEFAULT_MAX_MONTHLY_USD,
  SCHEMA_VERSION,
  type RuntimeState,
  type UserConfig,
} from "./types.js";

export interface Paths {
  configDir: string;
  userConfigPath: string;
  statePath: string;
  secretsPath: string;
  backupDir: string;
}

export function defaultPaths(): Paths {
  const override = process.env.FRUGAL_HOME;
  const base =
    override ??
    (process.platform === "darwin"
      ? path.join(os.homedir(), "Library", "Application Support", "frugal")
      : process.platform === "win32"
        ? path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "frugal")
        : path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"), "frugal"));
  return {
    configDir: base,
    userConfigPath: path.join(base, "user.json"),
    statePath: path.join(base, "state.json"),
    secretsPath: path.join(base, "secrets.json"),
    backupDir: path.join(base, "backups"),
  };
}

export function defaultUserConfig(): UserConfig {
  return {
    schemaVersion: SCHEMA_VERSION,
    tier: "free",
    maxMonthlyUsd: DEFAULT_MAX_MONTHLY_USD,
    pin: [],
    ban: [],
    lock: null,
    localMode: "fallback",
    enabledProviders: ["opencode-free", "openrouter", "groq"],
  };
}

export function defaultState(): RuntimeState {
  return {
    schemaVersion: SCHEMA_VERSION,
    lastGoodCombo: null,
    lastRefreshAt: null,
    lastFreeModelList: [],
  };
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tmp, file);
}

function assertSchemaVersion(value: unknown): string {
  const version = (value as { schema_version?: unknown })?.schema_version;
  if (typeof version !== "string") {
    throw new Error("config is missing schema_version");
  }
  const major = version.split(".")[0];
  if (major !== SCHEMA_VERSION.split(".")[0]) {
    throw new Error(
      `unsupported config schema major ${major}; expected ${SCHEMA_VERSION.split(".")[0]}`,
    );
  }
  return version;
}

export async function loadUserConfig(paths: Paths): Promise<UserConfig> {
  const data = await readJson<Record<string, unknown>>(paths.userConfigPath);
  if (!data) return defaultUserConfig();
  assertSchemaVersion(data);
  const defaults = defaultUserConfig();
  return {
    schemaVersion: (data.schema_version as string) ?? defaults.schemaVersion,
    tier: (data.tier as UserConfig["tier"]) ?? defaults.tier,
    maxMonthlyUsd: (data.max_monthly_usd as number) ?? defaults.maxMonthlyUsd,
    pin: (data.pin as string[]) ?? defaults.pin,
    ban: (data.ban as string[]) ?? defaults.ban,
    lock: (data.lock as string | null) ?? defaults.lock,
    localMode: (data.local_mode as UserConfig["localMode"]) ?? defaults.localMode,
    enabledProviders:
      (data.enabled_providers as UserConfig["enabledProviders"]) ?? defaults.enabledProviders,
    picksUrl: data.picks_url as string | undefined,
    resultsUrl: data.results_url as string | undefined,
    usageUrl: data.usage_url as string | undefined,
    catalogUrl: data.catalog_url as string | undefined,
  };
}

export async function saveUserConfig(paths: Paths, config: UserConfig): Promise<void> {
  const payload: Record<string, unknown> = {
    schema_version: config.schemaVersion,
    tier: config.tier,
    max_monthly_usd: config.maxMonthlyUsd,
    pin: config.pin,
    ban: config.ban,
    lock: config.lock,
    local_mode: config.localMode,
    enabled_providers: config.enabledProviders,
  };
  if (config.picksUrl) payload.picks_url = config.picksUrl;
  if (config.resultsUrl) payload.results_url = config.resultsUrl;
  if (config.usageUrl) payload.usage_url = config.usageUrl;
  if (config.catalogUrl) payload.catalog_url = config.catalogUrl;
  await writeJsonAtomic(paths.userConfigPath, payload);
}

export async function loadState(paths: Paths): Promise<RuntimeState> {
  const data = await readJson<Record<string, unknown>>(paths.statePath);
  if (!data) return defaultState();
  assertSchemaVersion(data);
  const defaults = defaultState();
  return {
    schemaVersion: (data.schema_version as string) ?? defaults.schemaVersion,
    lastGoodCombo: (data.last_good_combo as RuntimeState["lastGoodCombo"]) ?? defaults.lastGoodCombo,
    lastRefreshAt: (data.last_refresh_at as string | null) ?? defaults.lastRefreshAt,
    lastFreeModelList: (data.last_free_model_list as string[]) ?? defaults.lastFreeModelList,
  };
}

export async function saveState(paths: Paths, state: RuntimeState): Promise<void> {
  const payload: Record<string, unknown> = {
    schema_version: state.schemaVersion,
    last_good_combo: state.lastGoodCombo,
    last_refresh_at: state.lastRefreshAt,
    last_free_model_list: state.lastFreeModelList,
  };
  await writeJsonAtomic(paths.statePath, payload);
}

export async function configExists(paths: Paths): Promise<boolean> {
  try {
    await fs.access(paths.userConfigPath);
    return true;
  } catch {
    return false;
  }
}