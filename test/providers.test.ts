import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runAdd, runRemove } from "../src/cli/commands/providerCommands.js";
import type { Prompter } from "../src/cli/prompt.js";
import type { CommandContext } from "../src/cli/command.js";
import { loadUserConfig, type Paths } from "../src/core/config.js";
import { hasProviderKey } from "../src/core/secrets.js";
import { providerInfo, isProviderId } from "../src/core/providers.js";

class StubPrompter implements Prompter {
  constructor(private readonly key = "") {}
  text(): Promise<string> {
    return Promise.resolve("");
  }
  secret(): Promise<string> {
    return Promise.resolve(this.key);
  }
  confirm(): Promise<boolean> {
    return Promise.resolve(false);
  }
  select<T extends string>(): Promise<T> {
    return Promise.resolve("" as T);
  }
  info(): void {}
  close(): void {}
}

function okFetch(): typeof fetch {
  return (async () => ({ ok: true, status: 200 }) as Response) as typeof fetch;
}
function rejectFetch(): typeof fetch {
  return (async () => ({ ok: false, status: 401 }) as Response) as typeof fetch;
}

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
    expect(providerInfo("crowllm")?.validatable).toBe(false);
    expect(providerInfo("requesty")?.auth).toBe("key");
    expect(providerInfo("kilo")?.auth).toBe("key");
  });
});

describe("frugal add / remove", () => {
  let dir: string;
  let paths: Paths;
  let ctx: CommandContext;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "frugal-add-"));
    paths = pathsFor(dir);
    ctx = { paths, json: false };
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("enables a keyless provider", async () => {
    const code = await runAdd(ctx, "opencode-free", { prompter: new StubPrompter(), paths });
    expect(code).toBe(0);
    const user = await loadUserConfig(paths);
    expect(user.enabledProviders).toContain("opencode-free");
  });

  it("rejects an unknown provider", async () => {
    const code = await runAdd(ctx, "notaprovider", { prompter: new StubPrompter(), paths });
    expect(code).toBe(2);
  });

  it("stores a valid key and enables the provider", async () => {
    const code = await runAdd(ctx, "openrouter", {
      prompter: new StubPrompter("sk-or-valid"),
      paths,
      fetchImpl: okFetch(),
    });
    expect(code).toBe(0);
    expect(await hasProviderKey(paths, "openrouter")).toBe(true);
    const user = await loadUserConfig(paths);
    expect(user.enabledProviders).toContain("openrouter");
  });

  it("does not store a rejected key", async () => {
    const code = await runAdd(ctx, "groq", {
      prompter: new StubPrompter("bad"),
      paths,
      fetchImpl: rejectFetch(),
    });
    expect(code).toBe(1);
    expect(await hasProviderKey(paths, "groq")).toBe(false);
  });

  it("stores an unvalidatable provider key without validation", async () => {
    const code = await runAdd(ctx, "mistral", {
      prompter: new StubPrompter("mistral-key"),
      paths,
    });
    expect(code).toBe(0);
    expect(await hasProviderKey(paths, "mistral")).toBe(true);
  });

  it("refuses providers that need OAuth", async () => {
    const code = await runAdd(ctx, "kiro", { prompter: new StubPrompter(), paths });
    expect(code).toBe(1);
  });

  it("removes a provider and its key", async () => {
    await runAdd(ctx, "groq", {
      prompter: new StubPrompter("gsk-x"),
      paths,
      fetchImpl: okFetch(),
    });
    const code = await runRemove(ctx, "groq", paths);
    expect(code).toBe(0);
    expect(await hasProviderKey(paths, "groq")).toBe(false);
    const user = await loadUserConfig(paths);
    expect(user.enabledProviders).not.toContain("groq");
  });

  it("remove is idempotent", async () => {
    const code = await runRemove(ctx, "groq", paths);
    expect(code).toBe(0);
  });
});