import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runSetup } from "../src/cli/commands/setup.js";
import type { Prompter, SelectChoice } from "../src/cli/prompt.js";
import type { CommandContext } from "../src/cli/command.js";
import type { Paths } from "../src/core/config.js";
import { loadUserConfig } from "../src/core/config.js";
import { hasProviderKey } from "../src/core/secrets.js";
import type { RouterClient, RouterCombo } from "../src/core/routerClient.js";
import type { ApplyOptions } from "../src/core/integrations/index.js";
import type { IntegrationResult } from "../src/core/integrations/base.js";

class ScriptedPrompter implements Prompter {
  infos: string[] = [];
  constructor(
    private readonly answers: { selects?: string[]; texts?: string[]; secrets?: string[] } = {},
  ) {}

  text(_question: string, options?: { default?: string }): Promise<string> {
    const next = this.answers.texts?.shift();
    return Promise.resolve(next ?? options?.default ?? "");
  }
  secret(): Promise<string> {
    return Promise.resolve(this.answers.secrets?.shift() ?? "");
  }
  confirm(_question: string, defaultValue = false): Promise<boolean> {
    return Promise.resolve(defaultValue);
  }
  select<T extends string>(
    _question: string,
    choices: SelectChoice<T>[],
    defaultValue?: T,
  ): Promise<T> {
    const next = this.answers.selects?.shift();
    return Promise.resolve((next ?? defaultValue ?? choices[0]!.value) as T);
  }
  info(message: string): void {
    this.infos.push(message);
  }
  close(): void {}
}

class DownRouter implements RouterClient {
  async health(): Promise<boolean> {
    return false;
  }
  async listCombos(): Promise<RouterCombo[]> {
    return [];
  }
  async upsertCombo(): Promise<void> {}
  async deleteCombo(): Promise<void> {}
}

function okFetch(): typeof fetch {
  return (async () => ({ ok: true, status: 200 }) as Response) as typeof fetch;
}

function rejectingFetch(): typeof fetch {
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

describe("runSetup wizard", () => {
  let dir: string;
  let paths: Paths;
  let ctx: CommandContext;
  let applied: ApplyOptions[];

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "frugal-setup-"));
    paths = pathsFor(dir);
    ctx = { paths, json: false };
    applied = [];
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const applyFiles = async (options: ApplyOptions): Promise<IntegrationResult[]> => {
    applied.push(options);
    return [];
  };

  it("collects tier, cap and validated keys, and persists them", async () => {
    const prompter = new ScriptedPrompter({
      selects: ["budget"],
      texts: ["20"],
      secrets: ["sk-or-valid", "gsk-valid"],
    });

    const code = await runSetup(ctx, {
      prompter,
      paths,
      fetchImpl: okFetch(),
      router: new DownRouter(),
      applyFiles,
      detectLocal: async () => [],
    });

    expect(code).toBe(0);
    const user = await loadUserConfig(paths);
    expect(user.tier).toBe("budget");
    expect(user.maxMonthlyUsd).toBe(20);
    expect(user.localMode).toBe("fallback");
    expect(await hasProviderKey(paths, "openrouter")).toBe(true);
    expect(await hasProviderKey(paths, "groq")).toBe(true);
    expect(applied[0]?.model).toBe("free-best");
  });

  it("does not store a rejected key", async () => {
    const prompter = new ScriptedPrompter({ selects: ["free"], secrets: ["bad-key", "bad-key"] });

    await runSetup(ctx, {
      prompter,
      paths,
      fetchImpl: rejectingFetch(),
      router: new DownRouter(),
      applyFiles,
      detectLocal: async () => [],
    });

    expect(await hasProviderKey(paths, "openrouter")).toBe(false);
    expect(await hasProviderKey(paths, "groq")).toBe(false);
    expect(prompter.infos.join(" ")).toMatch(/rejected/);
  });

  it("skips keys when the student presses Enter", async () => {
    const prompter = new ScriptedPrompter({ selects: ["free"], secrets: ["", ""] });

    await runSetup(ctx, {
      prompter,
      paths,
      fetchImpl: okFetch(),
      router: new DownRouter(),
      applyFiles,
      detectLocal: async () => [],
    });

    expect(await hasProviderKey(paths, "openrouter")).toBe(false);
    expect(prompter.infos.join(" ")).toMatch(/Skipped OpenRouter/);
  });

  it("offers local modes when a local server is detected", async () => {
    const prompter = new ScriptedPrompter({ selects: ["free", "only"], secrets: ["", ""] });

    await runSetup(ctx, {
      prompter,
      paths,
      fetchImpl: okFetch(),
      router: new DownRouter(),
      applyFiles,
      detectLocal: async () => [
        { engine: "ollama", port: 11434, baseUrl: "http://127.0.0.1:11434", reachable: true, detail: "" },
      ],
    });

    const user = await loadUserConfig(paths);
    expect(user.localMode).toBe("only");
    expect(user.enabledProviders).toContain("local");
  });
});