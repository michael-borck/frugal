import { describe, expect, it } from "vitest";
import { RouterSession } from "../src/core/sessionClient.js";

function response(status: number, payload: unknown, cookies: string[] = []): Response {
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

describe("RouterSession", () => {
  it("logs in, captures the cookie and reports status", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const cookie = new Headers(init?.headers).get("cookie") ?? "";
      seen.push(`${url} ${cookie}`);
      if (url.endsWith("/api/auth/login")) {
        return response(200, { success: true }, ["auth_token=abc; Path=/; HttpOnly"]);
      }
      if (url.endsWith("/api/auth/status")) {
        return response(200, { authenticated: cookie.includes("auth_token=abc") });
      }
      return response(404, {});
    }) as typeof fetch;

    const session = new RouterSession({ fetchImpl });
    const login = await session.login("pw");
    expect(login.ok).toBe(true);
    expect(await session.status()).toBe(true);
    expect(seen.some((entry) => entry.endsWith("auth_token=abc"))).toBe(true);
  });

  it("reports a rejected password", async () => {
    const fetchImpl = (async () =>
      response(401, { error: "Invalid password" })) as typeof fetch;
    const session = new RouterSession({ fetchImpl });
    const login = await session.login("bad");
    expect(login.ok).toBe(false);
    expect(login.detail).toMatch(/Invalid password/);
  });

  it("reuses an existing API key", async () => {
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/api/keys")) {
        return response(200, {
          keys: [
            { key: "sk-x", name: "frugal", isActive: true },
            { key: "sk-y", name: "other", isActive: true },
          ],
        });
      }
      return response(404, {});
    }) as typeof fetch;
    const session = new RouterSession({ fetchImpl });
    expect(await session.getApiKey("frugal")).toBe("sk-x");
  });

  it("creates an API key when none exists", async () => {
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/keys") && (init?.method ?? "GET") === "GET") {
        return response(200, { keys: [] });
      }
      if (url.endsWith("/api/keys") && init?.method === "POST") {
        return response(201, { key: "sk-new", name: "frugal" });
      }
      return response(404, {});
    }) as typeof fetch;
    const session = new RouterSession({ fetchImpl });
    expect(await session.getApiKey("frugal")).toBe("sk-new");
  });

  it("lists routed model ids", async () => {
    const fetchImpl = (async (input: string | URL | Request) =>
      String(input).endsWith("/api/models")
        ? response(200, { models: [{ routedModel: "cf/a" }, { fullModel: "kgw/b" }] })
        : response(404, {})) as typeof fetch;
    const session = new RouterSession({ fetchImpl });
    expect(await session.listModels()).toEqual(["cf/a", "kgw/b"]);
  });

  it("updates an existing combo by id", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/api/combos") && (init?.method ?? "GET") === "GET") {
        return response(200, { combos: [{ id: "c1", name: "free-best", models: [] }] });
      }
      if (url.includes("/api/combos/c1") && init?.method === "PUT") {
        return response(200, { id: "c1" });
      }
      return response(404, {});
    }) as typeof fetch;
    const session = new RouterSession({ fetchImpl });
    const result = await session.upsertCombo("free-best", ["cf/a"]);
    expect(result).toEqual({ created: false, id: "c1" });
    expect(calls).toContain("PUT http://127.0.0.1:20128/api/combos/c1");
  });

  it("creates a combo when it does not exist", async () => {
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/combos") && (init?.method ?? "GET") === "GET") {
        return response(200, { combos: [] });
      }
      if (url.endsWith("/api/combos") && init?.method === "POST") {
        return response(201, { id: "c2" });
      }
      return response(404, {});
    }) as typeof fetch;
    const session = new RouterSession({ fetchImpl });
    expect(await session.upsertCombo("free-best", ["cf/a"])).toEqual({
      created: true,
      id: "c2",
    });
  });

  it("sets a per-combo fallback strategy while preserving others", async () => {
    let patched: unknown = null;
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/settings") && (init?.method ?? "GET") === "GET") {
        return response(200, {
          comboStrategies: { other: { fallbackStrategy: "round-robin" } },
        });
      }
      if (url.endsWith("/api/settings") && init?.method === "PATCH") {
        patched = JSON.parse(String(init.body));
        return response(200, {});
      }
      return response(404, {});
    }) as typeof fetch;
    const session = new RouterSession({ fetchImpl });
    expect(await session.ensureFallbackStrategy("free-best")).toBe(true);
    const body = patched as { comboStrategies: Record<string, { fallbackStrategy: string }> };
    expect(body.comboStrategies.other?.fallbackStrategy).toBe("round-robin");
    expect(body.comboStrategies["free-best"]?.fallbackStrategy).toBe("fallback");
  });

  it("does not patch when the strategy is already fallback", async () => {
    let patched = false;
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/settings") && (init?.method ?? "GET") === "GET") {
        return response(200, { comboStrategies: { "free-best": { fallbackStrategy: "fallback" } } });
      }
      if (init?.method === "PATCH") patched = true;
      return response(404, {});
    }) as typeof fetch;
    const session = new RouterSession({ fetchImpl });
    expect(await session.ensureFallbackStrategy("free-best")).toBe(false);
    expect(patched).toBe(false);
  });

  it("runs a catalog sync", async () => {
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) =>
      String(input).endsWith("/api/models/catalog-sync") && init?.method === "POST"
        ? response(200, { success: true })
        : response(404, {})) as typeof fetch;
    const session = new RouterSession({ fetchImpl });
    expect((await session.catalogSync()).ok).toBe(true);
  });

  it("validates and creates a provider connection", async () => {
    const bodies: unknown[] = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/providers/validate") && init?.method === "POST") {
        bodies.push(JSON.parse(String(init.body)));
        return response(200, { valid: true });
      }
      if (url.endsWith("/api/providers") && init?.method === "POST") {
        bodies.push(JSON.parse(String(init.body)));
        return response(201, { connection: { id: "p1" } });
      }
      return response(404, {});
    }) as typeof fetch;
    const session = new RouterSession({ fetchImpl });
    expect(await session.validateProvider("openrouter", "sk")).toEqual({
      ok: true,
      detail: "key accepted",
    });
    expect(await session.createProvider("openrouter", "sk")).toEqual({
      ok: true,
      detail: "openrouter connected",
      already: false,
    });
    expect(bodies).toEqual([
      { provider: "openrouter", apiKey: "sk" },
      { provider: "openrouter", apiKey: "sk" },
    ]);
  });

  it("passes providerSpecificData (Cloudflare account id)", async () => {
    let body: unknown = null;
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith("/api/providers") && init?.method === "POST") {
        body = JSON.parse(String(init.body));
        return response(201, { connection: { id: "p1" } });
      }
      return response(404, {});
    }) as typeof fetch;
    const session = new RouterSession({ fetchImpl });
    await session.createProvider("cloudflare-ai", "token", { accountId: "acct" });
    expect(body).toEqual({
      provider: "cloudflare-ai",
      apiKey: "token",
      providerSpecificData: { accountId: "acct" },
    });
  });

  it("treats a 409 as already connected", async () => {
    const fetchImpl = (async () => response(409, { error: "exists" })) as typeof fetch;
    const session = new RouterSession({ fetchImpl });
    expect(await session.createProvider("openrouter", "sk")).toEqual({
      ok: true,
      detail: "already connected",
      already: true,
    });
  });
});