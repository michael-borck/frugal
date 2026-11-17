import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { Paths } from "./config.js";
import { SCHEMA_VERSION } from "./types.js";

export interface ProviderSecret {
  apiKey: string;
  addedAt?: string;
}

export interface Secrets {
  schemaVersion: string;
  providers: Record<string, ProviderSecret>;
}

/**
 * Provider keys are stored in a frugal-owned file with mode 0600 and are never
 * written into any harness config. They are read only by frugal. (Once 9Router's
 * provider-registration API is verified, frugal will hand keys to 9Router and can
 * drop this local copy; the spec wants keys to live in 9Router's data directory.)
 */
export function defaultSecrets(): Secrets {
  return { schemaVersion: SCHEMA_VERSION, providers: {} };
}

function normalize(raw: unknown): Secrets {
  const data = raw as {
    schemaVersion?: unknown;
    providers?: Record<string, { apiKey?: unknown; addedAt?: unknown }>;
  } | null;
  const secrets = defaultSecrets();
  if (!data || typeof data !== "object") return secrets;
  const providers = data.providers;
  if (providers && typeof providers === "object") {
    for (const [name, value] of Object.entries(providers)) {
      if (value && typeof value.apiKey === "string" && value.apiKey.length > 0) {
        secrets.providers[name] = {
          apiKey: value.apiKey,
          addedAt: typeof value.addedAt === "string" ? value.addedAt : undefined,
        };
      }
    }
  }
  return secrets;
}

export async function loadSecrets(paths: Paths): Promise<Secrets> {
  try {
    const raw = await fs.readFile(paths.secretsPath, "utf8");
    return normalize(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return defaultSecrets();
    throw error;
  }
}

export async function saveSecrets(paths: Paths, secrets: Secrets): Promise<void> {
  await fs.mkdir(path.dirname(paths.secretsPath), { recursive: true });
  const tmp = `${paths.secretsPath}.${process.pid}.tmp`;
  const body = `${JSON.stringify(secrets, null, 2)}\n`;
  await fs.writeFile(tmp, body, { encoding: "utf8", mode: 0o600 });
  await fs.chmod(tmp, 0o600);
  await fs.rename(tmp, paths.secretsPath);
  await fs.chmod(paths.secretsPath, 0o600);
}

export async function setProviderKey(
  paths: Paths,
  provider: string,
  apiKey: string,
): Promise<void> {
  const secrets = await loadSecrets(paths);
  secrets.providers[provider] = { apiKey, addedAt: new Date().toISOString() };
  await saveSecrets(paths, secrets);
}

export async function removeProviderKey(paths: Paths, provider: string): Promise<boolean> {
  const secrets = await loadSecrets(paths);
  if (!(provider in secrets.providers)) return false;
  delete secrets.providers[provider];
  await saveSecrets(paths, secrets);
  return true;
}

export async function hasProviderKey(paths: Paths, provider: string): Promise<boolean> {
  const secrets = await loadSecrets(paths);
  return secrets.providers[provider] != null;
}

export async function listProviderKeys(paths: Paths): Promise<string[]> {
  const secrets = await loadSecrets(paths);
  return Object.keys(secrets.providers).sort();
}