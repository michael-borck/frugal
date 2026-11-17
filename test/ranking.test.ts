import { describe, expect, it } from "vitest";
import { mergeCandidates, toComboEntries, assertRankingInputs } from "../src/core/ranking.js";
import { defaultUserConfig } from "../src/core/config.js";
import type {
  ModelCandidate,
  PicksFile,
  ResultsFile,
  ScoreEntry,
} from "../src/core/types.js";

function candidate(partial: Partial<ModelCandidate> & { id: string }): ModelCandidate {
  return {
    provider: "openrouter",
    access: "free",
    contextTokens: 200_000,
    supportsTools: true,
    textOutput: true,
    promptPrice: 0,
    completionPrice: 0,
    ...partial,
  };
}

function entry(partial: Partial<ScoreEntry> & { id: string }): ScoreEntry {
  return {
    provider: "openrouter",
    tier: "A",
    score: 0.5,
    score_ci95: [0.4, 0.6],
    suites: { code: 0.5, tools: 0.5, availability: 1, long_context: 0.5 },
    median_latency_ms: 1000,
    context_tokens: 200_000,
    gates_passed: true,
    last_full_run: "2026-11-01",
    last_seen_free: "2026-11-16",
    status: "active",
    access: "free",
    ...partial,
  };
}

function results(entries: ScoreEntry[]): ResultsFile {
  return {
    schema_version: "1.0",
    generated_at: "2026-11-16T00:00:00Z",
    suite_version: "2026.11",
    models: entries,
  };
}

describe("mergeCandidates", () => {
  it("drops models that do not support tools or have small context", () => {
    const input = {
      candidates: [
        candidate({ id: "a" }),
        candidate({ id: "b", supportsTools: false }),
        candidate({ id: "c", contextTokens: 4096 }),
        candidate({ id: "d", textOutput: false }),
      ],
      user: defaultUserConfig(),
    };
    const { ordered, dropped } = mergeCandidates(input);
    expect(ordered.map((c) => c.id)).toEqual(["a"]);
    expect(dropped.map((d) => d.id).sort()).toEqual(["b", "c", "d"]);
  });

  it("orders by tier, then usage rank", () => {
    const input = {
      candidates: [candidate({ id: "y", usageRank: 1 }), candidate({ id: "x", usageRank: 2 })],
      results: results([entry({ id: "x", tier: "A" }), entry({ id: "y", tier: "B" })]),
      user: defaultUserConfig(),
    };
    const { ordered } = mergeCandidates(input);
    expect(ordered.map((c) => c.id)).toEqual(["x", "y"]);
  });

  it("places student pins before instructor pins, then applies instructor prefer bonus", () => {
    const input = {
      candidates: [candidate({ id: "a" }), candidate({ id: "b" }), candidate({ id: "c" })],
      results: results([
        entry({ id: "a" }),
        entry({ id: "b" }),
        entry({ id: "c" }),
      ]),
      picks: {
        schema_version: "1.0",
        updated_at: "2026-11-16",
        pin: ["b"],
        prefer: ["a"],
        ban: [],
      } satisfies PicksFile,
      user: { ...defaultUserConfig(), pin: ["c"] },
    };
    const { ordered } = mergeCandidates(input);
    expect(ordered.map((c) => c.id)).toEqual(["c", "b", "a"]);
  });

  it("drops pinned models that are not in the free list", () => {
    const user = defaultUserConfig();
    user.pin = ["missing"];
    const { ordered, dropped } = mergeCandidates({
      candidates: [candidate({ id: "a" })],
      user,
    });
    expect(ordered.map((c) => c.id)).toEqual(["a"]);
    expect(
      dropped.some((d) => d.id === "missing" && d.reason === "pinned-model-not-in-free-list"),
    ).toBe(true);
  });

  it("filters out budget-access models on the free tier", () => {
    const { ordered } = mergeCandidates({
      candidates: [
        candidate({ id: "free", access: "free" }),
        candidate({ id: "paid", access: "budget" }),
      ],
      user: defaultUserConfig(),
    });
    expect(ordered.map((c) => c.id)).toEqual(["free"]);
  });

  it("orders within a tier by bench availability, then reliability", () => {
    const res = results([
      entry({ id: "solid", tier: "A", suites: { code: 0.5, tools: 0.8, availability: 0.95, long_context: 0.5 } }),
      entry({ id: "flaky", tier: "A", suites: { code: 0.5, tools: 0.8, availability: 0.4, long_context: 0.5 } }),
      entry({ id: "mid", tier: "A", suites: { code: 0.5, tools: 0.8, availability: 0.7, long_context: 0.5 } }),
    ]);
    const { ordered } = mergeCandidates({
      candidates: [candidate({ id: "flaky" }), candidate({ id: "mid" }), candidate({ id: "solid" })],
      results: res,
      user: defaultUserConfig(),
    });
    expect(ordered.map((c) => c.id)).toEqual(["solid", "mid", "flaky"]);
  });

  it("uses observed reliability to break an availability tie", () => {
    const res = results([
      entry({ id: "steady", tier: "A", suites: { code: 0.5, tools: 0.8, availability: 0.9, long_context: 0.5 } }),
      entry({ id: "shaky", tier: "A", suites: { code: 0.5, tools: 0.8, availability: 0.9, long_context: 0.5 } }),
    ]);
    const { ordered } = mergeCandidates({
      candidates: [candidate({ id: "shaky" }), candidate({ id: "steady" })],
      results: res,
      user: defaultUserConfig(),
      reliability: new Map([
        ["steady", 0.95],
        ["shaky", 0.2],
      ]),
    });
    expect(ordered.map((c) => c.id)).toEqual(["steady", "shaky"]);
  });

  it("drops models from providers the student has not enabled", () => {
    const { ordered, dropped } = mergeCandidates({
      candidates: [
        candidate({ id: "or-model" }),
        candidate({ id: "req-model", provider: "requesty" }),
      ],
      user: defaultUserConfig(),
    });
    expect(ordered.map((c) => c.id)).toEqual(["or-model"]);
    expect(dropped.some((d) => d.id === "req-model" && d.reason === "provider-not-enabled")).toBe(true);
  });

  it("caps the combo at the maximum entry count", () => {
    const many = Array.from({ length: 20 }, (_, i) => candidate({ id: `m${i}` }));
    const { ordered } = mergeCandidates({ candidates: many, user: defaultUserConfig() });
    expect(ordered.length).toBeLessThanOrEqual(10);
  });
});

describe("toComboEntries", () => {
  it("labels free combo entries by their source", () => {
    const entries = toComboEntries(
      [candidate({ id: "a", tier: "A", score: 0.5 }), candidate({ id: "b", provider: "local" })],
      "free",
    );
    expect(entries[0]?.source).toBe("bench");
    expect(entries[1]?.source).toBe("local");
  });
});

describe("assertRankingInputs", () => {
  it("rejects an invalid tier", () => {
    expect(() =>
      assertRankingInputs({
        candidates: [],
        user: { ...defaultUserConfig(), tier: "bogus" as never },
      }),
    ).toThrow();
  });
});