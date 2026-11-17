import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runRefresh } from "../src/cli/commands/refresh.js";
import type { CommandContext } from "../src/cli/command.js";
import type { Paths } from "../src/core/config.js";
import type { SessionApi } from "../src/core/sessionClient.js";

function pathsFor(dir: string): Paths {
  return {
    configDir: path.join(dir, "frugal"),
    userConfigPath: path.join(dir, "frugal", "user.json"),
    statePath: path.join(dir, "frugal", "state.json"),
    secretsPath: path.join(dir, "frugal", "secrets.json"),
    backupDir: path.join(dir, "frugal", "backups"),
  };
}

function res(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as Response;
}

function fakeRouter(): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/v1/models")) {
      return res(200, { data: [{ id: "cf/a" }, { id: "cf/b" }, { id: "free-best" }] });
    }
    if (url.endsWith("/v1/chat/completions")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
      return body.model === "cf/a" ? res(200, {}) : res(404, { error: "nope" });
    }
    return res(404, {});
  }) as typeof fetch;
}

function makeSession(overrides: Partial<SessionApi> = {}): SessionApi {
  return {
    login: async () => ({ ok: true, detail: "" }),
    status: async () => true,
    catalogSync: async () => ({ ok: true, detail: "" }),
    getApiKey: async () => "sk-session",
    listModels: async () => ["cf/a", "cf/b", "free-best"],
    listCombos: async () => [],
    upsertCombo: async () => ({ created: false, id: "c1" }),
    ensureFallbackStrategy: async () => true,
    validateProvider: async () => ({ ok: true, detail: "" }),
    createProvider: async () => ({ ok: true, detail: "", already: false }),
    listProviderNodes: async () => [],
    ensureProviderNode: async (input) => ({ id: `node-${input.prefix}`, created: true }),
    ...overrides,
  };
}

describe("runRefresh", () => {
  let dir: string;
  let ctx: CommandContext;
  let originalKey: string | undefined;
  let originalPassword: string | undefined;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "frugal-refresh-"));
    originalKey = process.env.FRUGAL_ROUTER_KEY;
    originalPassword = process.env.FRUGAL_ROUTER_PASSWORD;
    delete process.env.FRUGAL_ROUTER_KEY;
    delete process.env.FRUGAL_ROUTER_PASSWORD;
    ctx = { paths: pathsFor(dir), json: true };
  });

  afterEach(async () => {
    if (originalKey == null) delete process.env.FRUGAL_ROUTER_KEY;
    else process.env.FRUGAL_ROUTER_KEY = originalKey;
    if (originalPassword == null) delete process.env.FRUGAL_ROUTER_PASSWORD;
    else process.env.FRUGAL_ROUTER_PASSWORD = originalPassword;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("verifies and applies free-best with a session", async () => {
    const calls: string[] = [];
    const session = makeSession({
      upsertCombo: async (name, models) => {
        calls.push(`upsert:${name}:${models.join(",")}`);
        return { created: false, id: "c1" };
      },
      ensureFallbackStrategy: async (name) => {
        calls.push(`strategy:${name}`);
        return true;
      },
    });
    const code = await runRefresh(ctx, { session, fetchImpl: fakeRouter(), limit: 5 });
    expect(code).toBe(0);
    expect(calls).toContain("upsert:free-best:cf/a");
    expect(calls).toContain("strategy:free-best");
  });

  it("does not apply with --no-apply", async () => {
    let applied = false;
    const session = makeSession({
      upsertCombo: async () => {
        applied = true;
        return { created: false, id: "c1" };
      },
    });
    const code = await runRefresh(ctx, {
      session,
      fetchImpl: fakeRouter(),
      limit: 5,
      apply: false,
    });
    expect(code).toBe(0);
    expect(applied).toBe(false);
  });

  it("verifies with only an API key and prints the order", async () => {
    const code = await runRefresh(ctx, {
      fetchImpl: fakeRouter(),
      key: "sk-router",
      limit: 5,
    });
    expect(code).toBe(0);
  });

  it("requires credentials", async () => {
    await expect(runRefresh(ctx, { fetchImpl: fakeRouter() })).rejects.toThrow(
      /FRUGAL_ROUTER_PASSWORD/,
    );
  });

  it("fails when applying the combo fails", async () => {
    const session = makeSession({
      upsertCombo: async () => {
        throw new Error("combo write failed");
      },
    });
    const code = await runRefresh(ctx, { session, fetchImpl: fakeRouter(), limit: 5 });
    expect(code).toBe(1);
  });
});