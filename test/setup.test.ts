import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runSetup } from "../src/cli/commands/setup.js";
import type { Prompter, SelectChoice } from "../src/cli/prompt.js";
import type { CommandContext } from "../src/cli/command.js";
import type { Paths } from "../src/core/config.js";
import type { SessionApi } from "../src/core/sessionClient.js";

class ScriptedPrompter implements Prompter {
  infos: string[] = [];
  constructor(
    private readonly answers: {
      confirms?: boolean[];
      secrets?: string[];
      selects?: string[];
    } = {},
  ) {}
  text(_question: string, options?: { default?: string }): Promise<string> {
    return Promise.resolve(options?.default ?? "");
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

function jsonResponse(status: number, payload: unknown, cookies: string[] = []): Response {
  const headers = new Headers();
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as Response;
}

function fakeRouter(): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/v1/models")) {
      return jsonResponse(200, { data: [{ id: "cf/a" }, { id: "cf/b" }, { id: "free-best" }] });
    }
    if (url.endsWith("/v1/chat/completions")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
      return body.model === "cf/a" ? jsonResponse(200, {}) : jsonResponse(404, { error: "nope" });
    }
    return jsonResponse(404, {});
  }) as typeof fetch;
}

function sessionFetch(): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.endsWith("/api/auth/login")) {
      return jsonResponse(200, { success: true }, ["auth_token=abc; Path=/; HttpOnly"]);
    }
    if (url.endsWith("/api/models/catalog-sync")) return jsonResponse(200, { success: true });
    if (url.endsWith("/api/keys") && method === "GET") {
      return jsonResponse(200, { keys: [{ key: "sk-session", name: "frugal", isActive: true }] });
    }
    if (url.endsWith("/api/models")) {
      return jsonResponse(200, {
        models: [{ routedModel: "cf/a" }, { routedModel: "cf/b" }, { routedModel: "free-best" }],
      });
    }
    if (url.endsWith("/api/combos") && method === "GET") return jsonResponse(200, { combos: [] });
    if (url.endsWith("/api/combos") && method === "POST") return jsonResponse(201, { id: "c1" });
    if (url.endsWith("/api/settings") && method === "GET") {
      return jsonResponse(200, { comboStrategies: {} });
    }
    if (url.endsWith("/api/settings") && method === "PATCH") return jsonResponse(200, {});
    if (url.endsWith("/v1/chat/completions")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
      return body.model === "cf/a" ? jsonResponse(200, {}) : jsonResponse(404, {});
    }
    return jsonResponse(404, {});
  }) as typeof fetch;
}

describe("runSetup (thin)", () => {
  let dir: string;
  let home: string;
  let ctx: CommandContext;
  let originalHome: string | undefined;
  let originalKey: string | undefined;
  let originalPassword: string | undefined;
  let originalXdg: string | undefined;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "frugal-setup-"));
    home = path.join(dir, "home");
    await fs.mkdir(path.join(home, ".pi", "agent"), { recursive: true });
    originalHome = process.env.HOME;
    originalKey = process.env.FRUGAL_ROUTER_KEY;
    originalPassword = process.env.FRUGAL_ROUTER_PASSWORD;
    originalXdg = process.env.XDG_CONFIG_HOME;
    process.env.HOME = home;
    process.env.XDG_CONFIG_HOME = path.join(home, ".config");
    delete process.env.FRUGAL_ROUTER_KEY;
    delete process.env.FRUGAL_ROUTER_PASSWORD;
    ctx = { paths: pathsFor(dir), json: false };
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    if (originalXdg == null) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = originalXdg;
    if (originalKey == null) delete process.env.FRUGAL_ROUTER_KEY;
    else process.env.FRUGAL_ROUTER_KEY = originalKey;
    if (originalPassword == null) delete process.env.FRUGAL_ROUTER_PASSWORD;
    else process.env.FRUGAL_ROUTER_PASSWORD = originalPassword;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("logs in, refreshes catalogs, writes free-best, and wires Pi", async () => {
    const prompter = new ScriptedPrompter({
      confirms: [true, true],
      secrets: ["dashboard-pw"],
      selects: ["pi"],
    });
    const code = await runSetup(ctx, {
      prompter,
      paths: ctx.paths,
      fetchImpl: sessionFetch(),
      detectLocal: async () => [],
    });

    expect(code).toBe(0);
    const models = JSON.parse(
      await fs.readFile(path.join(home, ".pi", "agent", "models.json"), "utf8"),
    );
    expect(models.providers["9router"].apiKey).toBe("sk-session");
    const ids = models.providers["9router"].models.map((m: { id: string }) => m.id);
    expect(ids).toEqual(["free-best", "cf/a"]);
    expect(prompter.infos.join("\n")).toMatch(/Updated free-best/);
  });

  it("falls back to an API key when no session is used", async () => {
    process.env.FRUGAL_ROUTER_KEY = "sk-router";
    const prompter = new ScriptedPrompter({ confirms: [true, false], selects: ["opencode"] });
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

  it("uses an injected session and applies the combo", async () => {
    const calls: string[] = [];
    const session: SessionApi = {
      login: async () => ({ ok: true, detail: "" }),
      status: async () => true,
      catalogSync: async () => {
        calls.push("catalogSync");
        return { ok: true, detail: "" };
      },
      getApiKey: async () => "sk-injected",
      listModels: async () => ["cf/a", "free-best"],
      listCombos: async () => [],
      upsertCombo: async (name, models) => {
        calls.push(`upsert:${name}:${models.join(",")}`);
        return { created: false, id: "c1" };
      },
      ensureFallbackStrategy: async (name) => {
        calls.push(`strategy:${name}`);
        return true;
      },
    };
    const prompter = new ScriptedPrompter({ confirms: [true, true], selects: ["pi"] });
    const code = await runSetup(ctx, {
      prompter,
      paths: ctx.paths,
      fetchImpl: fakeRouter(),
      detectLocal: async () => [],
      session,
    });
    expect(code).toBe(0);
    expect(calls).toContain("catalogSync");
    expect(calls).toContain("upsert:free-best:cf/a");
    expect(calls).toContain("strategy:free-best");
  });

  it("returns an error when there are no credentials", async () => {
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
});