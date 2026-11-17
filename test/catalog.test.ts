import { describe, expect, it } from "vitest";
import { parseCatalog } from "../src/core/catalog.js";

const payload = {
  schema_version: "1.0",
  generated_at: "2026-11-17T00:00:00Z",
  providers: [
    {
      id: "openrouter",
      models: [
        { id: "a/free:free", access: "free", context: 131_072, tools: true, price_in: 0, price_out: 0 },
        { id: "a/paid", access: "budget", context: 200_000, tools: true, price_in: 1, price_out: 2 },
      ],
    },
    {
      id: "requesty",
      models: [
        { id: "b/free", access: "free", context: 131_072, tools: true, price_in: 0, price_out: 0 },
      ],
    },
    {
      id: "not-a-provider",
      models: [{ id: "c/free", access: "free", context: 131_072, tools: true }],
    },
  ],
};

describe("parseCatalog", () => {
  const candidates = parseCatalog(payload);
  const byId = new Map(candidates.map((c) => [c.id, c]));

  it("maps catalog models to candidates", () => {
    expect(candidates.map((c) => c.id).sort()).toEqual(["a/free:free", "a/paid", "b/free"]);
    expect(byId.get("a/free:free")?.provider).toBe("openrouter");
    expect(byId.get("b/free")?.provider).toBe("requesty");
    expect(byId.get("a/free:free")?.access).toBe("free");
    expect(byId.get("a/paid")?.access).toBe("budget");
    expect(byId.get("a/free:free")?.contextTokens).toBe(131_072);
    expect(byId.get("a/free:free")?.supportsTools).toBe(true);
  });

  it("ignores providers frugal does not know", () => {
    expect(candidates.some((c) => c.id === "c/free")).toBe(false);
  });

  it("deduplicates by model id", () => {
    const duplicated = parseCatalog({
      schema_version: "1.0",
      providers: [
        { id: "openrouter", models: [{ id: "dup", access: "free", context: 1, tools: true }] },
        { id: "kilo", models: [{ id: "dup", access: "free", context: 1, tools: true }] },
      ],
    });
    expect(duplicated).toHaveLength(1);
  });

  it("rejects a mismatched schema major and non-objects", () => {
    expect(parseCatalog({ schema_version: "9.0", providers: [] })).toEqual([]);
    expect(parseCatalog(null)).toEqual([]);
    expect(parseCatalog("nope")).toEqual([]);
  });
});