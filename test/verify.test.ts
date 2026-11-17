import { describe, expect, it } from "vitest";
import {
  listRouterModels,
  probeModel,
  providerPrefix,
  selectCandidates,
  suggestedCombo,
  verifyModels,
  type ProbeResult,
} from "../src/core/verify.js";

function jsonResponse(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as Response;
}

describe("listRouterModels", () => {
  it("reads ids from a /v1/models payload", async () => {
    const fetchImpl = (async () =>
      jsonResponse(200, { data: [{ id: "cf/a" }, { id: "kgw/b" }] })) as typeof fetch;
    expect(await listRouterModels({ apiKey: "k", fetchImpl })).toEqual(["cf/a", "kgw/b"]);
  });

  it("throws when the router rejects the request", async () => {
    const fetchImpl = (async () => jsonResponse(401, {})) as typeof fetch;
    await expect(listRouterModels({ apiKey: "k", fetchImpl })).rejects.toThrow(/401/);
  });
});

describe("selectCandidates", () => {
  it("spreads across providers and skips combo names", () => {
    const picked = selectCandidates(
      ["free-best", "cf/a", "cf/b", "kgw/c", "nvidia/d"],
      3,
    );
    expect(picked).toEqual(["cf/a", "kgw/c", "nvidia/d"]);
  });

  it("respects the limit", () => {
    expect(selectCandidates(["cf/a", "cf/b", "cf/c"], 2)).toHaveLength(2);
  });
});

describe("probeModel", () => {
  it("marks a 200 as ok", async () => {
    const fetchImpl = (async () => jsonResponse(200, { choices: [] })) as typeof fetch;
    const result = await probeModel("cf/a", { apiKey: "k", fetchImpl });
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
  });

  it("marks a 429 as failed with the status", async () => {
    const fetchImpl = (async () => jsonResponse(429, { error: "rate limited" })) as typeof fetch;
    const result = await probeModel("cf/a", { apiKey: "k", fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(429);
  });

  it("handles a network error", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const result = await probeModel("cf/a", { apiKey: "k", fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.status).toBeNull();
    expect(result.error).toMatch(/ECONNREFUSED/);
  });
});

describe("verifyModels", () => {
  it("probes every candidate", async () => {
    const fetchImpl = (async (input: string | URL | Request) => {
      const body = String((input as Request).url ?? input);
      const ok = body.includes("good");
      return jsonResponse(ok ? 200 : 404, {});
    }) as unknown as typeof fetch;
    const results = await verifyModels(["good/1", "bad/2"], { apiKey: "k", fetchImpl });
    // fake ignores body; just ensure two results
    expect(results).toHaveLength(2);
  });
});

describe("suggestedCombo", () => {
  it("orders responders by latency, excludes failures, and caps", () => {
    const results: ProbeResult[] = [
      { id: "a", ok: true, status: 200, latencyMs: 900, error: null },
      { id: "b", ok: true, status: 200, latencyMs: 300, error: null },
      { id: "c", ok: false, status: 404, latencyMs: 10, error: "nope" },
    ];
    expect(suggestedCombo(results)).toEqual(["b", "a"]);
  });
});

describe("providerPrefix", () => {
  it("returns the prefix or 'router'", () => {
    expect(providerPrefix("cf/@cf/meta/llama")).toBe("cf");
    expect(providerPrefix("free-best")).toBe("router");
  });
});