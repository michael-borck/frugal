import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Paths } from "../src/core/config.js";
import {
  hasProviderKey,
  listProviderKeys,
  loadSecrets,
  removeProviderKey,
  setProviderKey,
} from "../src/core/secrets.js";

function pathsFor(dir: string): Paths {
  return {
    configDir: dir,
    userConfigPath: path.join(dir, "user.json"),
    statePath: path.join(dir, "state.json"),
    secretsPath: path.join(dir, "secrets.json"),
    backupDir: path.join(dir, "backups"),
  };
}

describe("secrets store", () => {
  let dir: string;
  let paths: Paths;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "frugal-secrets-"));
    paths = pathsFor(dir);
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("stores and reads provider keys", async () => {
    await setProviderKey(paths, "openrouter", "sk-or-secret");
    expect(await hasProviderKey(paths, "openrouter")).toBe(true);
    expect(await listProviderKeys(paths)).toEqual(["openrouter"]);
    const secrets = await loadSecrets(paths);
    expect(secrets.providers.openrouter?.apiKey).toBe("sk-or-secret");
  });

  it("writes the secrets file with 0600 permissions", async () => {
    await setProviderKey(paths, "groq", "gsk-secret");
    const stat = await fs.stat(paths.secretsPath);
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it("removes a key", async () => {
    await setProviderKey(paths, "groq", "x");
    expect(await removeProviderKey(paths, "groq")).toBe(true);
    expect(await hasProviderKey(paths, "groq")).toBe(false);
    expect(await removeProviderKey(paths, "groq")).toBe(false);
  });

  it("returns empty secrets when the file is absent", async () => {
    const secrets = await loadSecrets(paths);
    expect(secrets.providers).toEqual({});
  });
});