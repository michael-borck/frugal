import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  loadState,
  loadUserConfig,
  saveState,
  saveUserConfig,
  type Paths,
} from "../src/core/config.js";
import { SCHEMA_VERSION } from "../src/core/types.js";

function pathsFor(dir: string): Paths {
  return {
    configDir: dir,
    userConfigPath: path.join(dir, "user.json"),
    statePath: path.join(dir, "state.json"),
    secretsPath: path.join(dir, "secrets.json"),
    backupDir: path.join(dir, "backups"),
  };
}

describe("config round-trip", () => {
  let dir: string;
  let paths: Paths;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "frugal-config-"));
    paths = pathsFor(dir);
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("loads back every saved user field (snake_case on disk)", async () => {
    await saveUserConfig(paths, {
      schemaVersion: SCHEMA_VERSION,
      tier: "budget",
      maxMonthlyUsd: 20,
      pin: ["vendor/a:free"],
      ban: ["vendor/b:free"],
      lock: "vendor/a:free",
      localMode: "first",
      enabledProviders: ["openrouter", "groq", "local"],
      picksUrl: "https://example.test/picks.json",
      resultsUrl: "https://example.test/results.json",
      usageUrl: "https://example.test/usage.json",
      catalogUrl: "https://example.test/catalog.json",
    });

    const loaded = await loadUserConfig(paths);
    expect(loaded.tier).toBe("budget");
    expect(loaded.maxMonthlyUsd).toBe(20);
    expect(loaded.pin).toEqual(["vendor/a:free"]);
    expect(loaded.ban).toEqual(["vendor/b:free"]);
    expect(loaded.lock).toBe("vendor/a:free");
    expect(loaded.localMode).toBe("first");
    expect(loaded.enabledProviders).toEqual(["openrouter", "groq", "local"]);
    expect(loaded.picksUrl).toBe("https://example.test/picks.json");
    expect(loaded.resultsUrl).toBe("https://example.test/results.json");
    expect(loaded.usageUrl).toBe("https://example.test/usage.json");
    expect(loaded.catalogUrl).toBe("https://example.test/catalog.json");
  });

  it("loads back the last good combo (snake_case on disk)", async () => {
    await saveState(paths, {
      schemaVersion: SCHEMA_VERSION,
      lastGoodCombo: {
        name: "free-best",
        generatedAt: "2026-11-17T00:00:00Z",
        entries: [
          {
            id: "vendor/a:free",
            provider: "openrouter",
            access: "free",
            contextTokens: 131072,
            source: "bench",
          },
        ],
      },
      lastRefreshAt: "2026-11-17T01:00:00Z",
      lastFreeModelList: ["vendor/a:free"],
    });

    const loaded = await loadState(paths);
    expect(loaded.lastGoodCombo?.name).toBe("free-best");
    expect(loaded.lastGoodCombo?.entries[0]?.contextTokens).toBe(131072);
    expect(loaded.lastRefreshAt).toBe("2026-11-17T01:00:00Z");
    expect(loaded.lastFreeModelList).toEqual(["vendor/a:free"]);
  });

  it("rejects an unknown schema major", async () => {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      paths.userConfigPath,
      JSON.stringify({ schema_version: "9.0", tier: "free" }),
    );
    await expect(loadUserConfig(paths)).rejects.toThrow(/unsupported config schema major/);
  });
});