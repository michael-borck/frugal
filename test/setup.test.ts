import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runSetup } from "../src/cli/commands/setup.js";
import type { Prompter, SelectChoice } from "../src/cli/prompt.js";
import type { CommandContext } from "../src/cli/command.js";
import type { Paths } from "../src/core/config.js";

class ScriptedPrompter implements Prompter {
  infos: string[] = [];
  constructor(
    private readonly answers: {
      confirms?: boolean[];
      secrets?: string[];
      selects?: string[];
      texts?: string[];
    } = {},
  ) {}

  text(_question: string, options?: { default?: string }): Promise<string> {
    return Promise.resolve(this.answers.texts?.shift() ?? options?.default ?? "");
  }
  secret(): Promise<string> {
    return Promise.resolve(this.answers.secrets?.shift() ?? "");
  }
  confirm(): Promise<boolean> {
    return Promise.resolve(this.answers.confirms?.shift() ?? false);
  }
  select<T extends string>(
    _question: string,
    choices: SelectChoice<T>[],
    defaultValue?: T,
  ): Promise<T> {
    return Promise.resolve((this.answers.selects?.shift() ?? defaultValue ?? choices[0]!.value) as T);
  }
  info(message: string): void {
    this.infos.push(message);
  }
  close(): void {}
}

function pathsFor(dir: string): Paths {
  return {
    configDir: path.join(dir, "frugal"),
    userConfigPath: path.join(dir, "frugal", "user.json"),
    statePath: path.join(dir, "frugal", "state.json"),
    secretsPath: path.join(dir, "frugal", "secrets.json"),
    backupDir: path.join(dir, "frugal", "backups"),
  };
}

function routerJson(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as Response;
}

function fakeRouter(): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/v1/models")) {
      return routerJson(200, { data: [{ id: "cf/a" }, { id: "cf/b" }, { id: "free-best" }] });
    }
    if (url.endsWith("/v1/chat/completions")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
      return body.model === "cf/a" ? routerJson(200, {}) : routerJson(404, { error: "nope" });
    }
    return routerJson(404, {});
  }) as typeof fetch;
}

describe("runSetup (thin)", () => {
  let dir: string;
  let home: string;
  let ctx: CommandContext;
  let originalHome: string | undefined;
  let originalKey: string | undefined;
  let originalXdg: string | undefined;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "frugal-setup-"));
    home = path.join(dir, "home");
    await fs.mkdir(path.join(home, ".pi", "agent"), { recursive: true });
    originalHome = process.env.HOME;
    originalKey = process.env.FRUGAL_ROUTER_KEY;
    originalXdg = process.env.XDG_CONFIG_HOME;
    process.env.HOME = home;
    process.env.XDG_CONFIG_HOME = path.join(home, ".config");
    delete process.env.FRUGAL_ROUTER_KEY;
    ctx = { paths: pathsFor(dir), json: false };
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    if (originalXdg == null) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = originalXdg;
    if (originalKey != null) process.env.FRUGAL_ROUTER_KEY = originalKey;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("writes a Pi 9router provider and preserves existing providers", async () => {
    const modelsPath = path.join(home, ".pi", "agent", "models.json");
    await fs.writeFile(
      modelsPath,
      JSON.stringify({
        providers: {
          ollama: { baseUrl: "http://localhost:11434/v1", models: [{ id: "qwen3:8b" }] },
        },
      }),
    );

    const prompter = new ScriptedPrompter({
      confirms: [true, true],
      secrets: ["sk-router"],
      selects: ["pi"],
    });
    const code = await runSetup(ctx, {
      prompter,
      paths: ctx.paths,
      fetchImpl: fakeRouter(),
      detectLocal: async () => [],
    });

    expect(code).toBe(0);
    const written = JSON.parse(await fs.readFile(modelsPath, "utf8"));
    expect(written.providers.ollama).toBeTruthy();
    expect(written.providers["9router"].apiKey).toBe("sk-router");
    expect(written.providers["9router"].baseUrl).toBe("http://127.0.0.1:20128/v1");
    const ids = written.providers["9router"].models.map((m: { id: string }) => m.id);
    expect(ids).toContain("free-best");
    expect(ids).toContain("cf/a");
    expect(prompter.infos.join("\n")).toMatch(/Suggested free-best order/);
  });

  it("returns an error when no 9Router key is provided", async () => {
    const prompter = new ScriptedPrompter({ confirms: [true], secrets: [""] });
    const code = await runSetup(ctx, {
      prompter,
      paths: ctx.paths,
      fetchImpl: fakeRouter(),
      detectLocal: async () => [],
    });
    expect(code).toBe(1);
    await expect(
      fs.access(path.join(home, ".pi", "agent", "models.json")),
    ).rejects.toBeTruthy();
  });

  it("can configure OpenCode instead of Pi", async () => {
    const prompter = new ScriptedPrompter({
      confirms: [true, false],
      secrets: ["sk-router"],
      selects: ["opencode"],
    });
    const code = await runSetup(ctx, {
      prompter,
      paths: ctx.paths,
      fetchImpl: fakeRouter(),
      detectLocal: async () => [],
    });
    expect(code).toBe(0);
    const config = JSON.parse(
      await fs.readFile(path.join(home, ".config", "opencode", "opencode.json"), "utf8"),
    );
    expect(config.provider.router9.options.apiKey).toBe("sk-router");
    expect(config.model).toBe("router9/free-best");
  });
});