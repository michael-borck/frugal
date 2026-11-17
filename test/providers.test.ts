import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runAdd, runRemove } from "../src/cli/commands/providerCommands.js";
import type { CommandContext } from "../src/cli/command.js";
import type { Paths } from "../src/core/config.js";
import { providerInfo, isProviderId } from "../src/core/providers.js";

function pathsFor(dir: string): Paths {
  return {
    configDir: dir,
    userConfigPath: path.join(dir, "user.json"),
    statePath: path.join(dir, "state.json"),
    secretsPath: path.join(dir, "secrets.json"),
    backupDir: path.join(dir, "backups"),
  };
}

describe("provider catalog", () => {
  it("knows the providers and their auth kind", () => {
    expect(isProviderId("openrouter")).toBe(true);
    expect(isProviderId("nope")).toBe(false);
    expect(providerInfo("opencode-free")?.auth).toBe("none");
    expect(providerInfo("openrouter")?.validatable).toBe(true);
    expect(providerInfo("kiro")?.auth).toBe("oauth");
    expect(providerInfo("crowllm")?.auth).toBe("key");
    expect(providerInfo("requesty")?.auth).toBe("key");
    expect(providerInfo("kilo")?.auth).toBe("key");
  });
});

describe("frugal add / remove (thin guidance)", () => {
  let dir: string;
  let paths: Paths;
  let ctx: CommandContext;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "frugal-add-"));
    paths = pathsFor(dir);
    ctx = { paths, json: true };
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("points to the 9Router provider screen", async () => {
    expect(await runAdd(ctx, "openrouter")).toBe(0);
    expect(await runAdd(ctx, "kiro")).toBe(0);
  });

  it("never creates a key store", async () => {
    await runAdd(ctx, "openrouter");
    await expect(fs.access(paths.secretsPath)).rejects.toBeTruthy();
  });

  it("rejects an unknown provider", async () => {
    expect(await runAdd(ctx, "notaprovider")).toBe(2);
  });

  it("remove points to 9Router and is safe for unknown providers", async () => {
    expect(await runRemove(ctx, "groq")).toBe(0);
    expect(await runRemove(ctx, "notaprovider")).toBe(2);
  });
});