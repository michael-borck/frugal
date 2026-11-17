import { describe, expect, it } from "vitest";
import { parseUsageRanks, fetchUsageRanks } from "../src/core/usage.js";
import { HttpRankingSource } from "../src/core/rankingSource.js";

function jsonResponse(payload: unknown): Response {
  return { ok: true, status: 200, json: async () => payload } as Response;
}

describe("parseUsageRanks", () => {
  it("ranks an ordered list of ids", () => {
    const ranks = parseUsageRanks(["a", "b", "c"]);
    expect(ranks.get("a")).toBe(1);
    expect(ranks.get("c")).toBe(3);
  });

  it("ranks by token weight when present", () => {
    const ranks = parseUsageRanks([
      { id: "low", tokens: 10 },
      { id: "high", tokens: 1000 },
    ]);
    expect(ranks.get("high")).toBe(1);
    expect(ranks.get("low")).toBe(2);
  });

  it("accepts a models/data wrapper", () => {
    expect(parseUsageRanks({ models: ["x", "y"] }).get("y")).toBe(2);
    expect(parseUsageRanks({ data: [{ id: "x" }, { id: "y" }] }).get("x")).toBe(1);
  });

  it("accepts a map of id to counts", () => {
    const ranks = parseUsageRanks({ a: 5, b: 50 });
    expect(ranks.get("b")).toBe(1);
    expect(ranks.get("a")).toBe(2);
  });

  it("returns an empty map for unknown shapes", () => {
    expect(parseUsageRanks(null).size).toBe(0);
    expect(parseUsageRanks({ nope: "x" }).size).toBe(0);
  });
});

describe("fetchUsageRanks", () => {
  it("returns an empty map when no URL is configured", async () => {
    const ranks = await fetchUsageRanks(undefined, (async () => {
      throw new Error("should not be called");
    }) as unknown as typeof fetch);
    expect(ranks.size).toBe(0);
  });

  it("swallows fetch failures", async () => {
    const ranks = await fetchUsageRanks(
      "https://example.test/usage.json",
      (async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch,
    );
    expect(ranks.size).toBe(0);
  });
});

describe("candidates apply usage ranks", () => {
  it("sets usageRank from the configured usage source", async () => {
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("models")) {
        return jsonResponse({
          data: [
            {
              id: "vendor/a:free",
              context_length: 131_072,
              pricing: { prompt: "0", completion: "0" },
              supported_parameters: ["tools"],
              architecture: { output_modalities: ["text"] },
            },
          ],
        });
      }
      return jsonResponse(["vendor/a:free"]);
    }) as typeof fetch;

    const source = new HttpRankingSource({
      openRouterModelsUrl: "https://openrouter.test/models",
      usageUrl: "https://example.test/usage.json",
      fetchImpl,
    });
    const candidates = await source.candidates();
    expect(candidates[0]?.usageRank).toBe(1);
  });
});