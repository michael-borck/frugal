import { describe, expect, it } from "vitest";
import { composeAndRegister } from "../src/core/compose.js";
import { defaultUserConfig } from "../src/core/config.js";
import type { RankingSource } from "../src/core/rankingSource.js";
import type { RouterClient, RouterCombo } from "../src/core/routerClient.js";
import type { ModelCandidate, PicksFile, ResultsFile } from "../src/core/types.js";

function candidate(partial: Partial<ModelCandidate> & { id: string }): ModelCandidate {
  return {
    provider: "openrouter",
    access: "free",
    contextTokens: 131_072,
    supportsTools: true,
    textOutput: true,
    promptPrice: 0,
    completionPrice: 0,
    ...partial,
  };
}

class FakeSource implements RankingSource {
  constructor(
    private readonly value: ModelCandidate[] | Error,
    private readonly resultsValue: ResultsFile | null = null,
    private readonly picksValue: PicksFile | null = null,
  ) {}
  async candidates(): Promise<ModelCandidate[]> {
    if (this.value instanceof Error) throw this.value;
    return this.value;
  }
  async results(): Promise<ResultsFile | null> {
    return this.resultsValue;
  }
  async picks(): Promise<PicksFile | null> {
    return this.picksValue;
  }
}

class FakeRouter implements RouterClient {
  upserts: RouterCombo[] = [];
  async health(): Promise<boolean> {
    return true;
  }
  async listCombos(): Promise<RouterCombo[]> {
    return [];
  }
  async upsertCombo(combo: RouterCombo): Promise<void> {
    this.upserts.push(combo);
  }
  async deleteCombo(): Promise<void> {}
}

describe("composeAndRegister", () => {
  it("builds and registers free-best from live candidates", async () => {
    const source = new FakeSource([
      candidate({ id: "vendor/a:free" }),
      candidate({ id: "vendor/b:free" }),
    ]);
    const router = new FakeRouter();
    const result = await composeAndRegister(defaultUserConfig(), source, router);

    expect(result.registered).toBe(true);
    expect(result.combos.map((c) => c.name)).toEqual(["free-best"]);
    expect(router.upserts).toHaveLength(1);
    expect(router.upserts[0]?.models).toEqual(["vendor/a:free", "vendor/b:free"]);
  });

  it("keeps the last good combo when candidate fetch fails", async () => {
    const source = new FakeSource(new Error("network down"));
    const router = new FakeRouter();
    const result = await composeAndRegister(defaultUserConfig(), source, router);

    expect(result.registered).toBe(false);
    expect(result.combos).toEqual([]);
    expect(result.registrationError).toContain("network down");
    expect(router.upserts).toEqual([]);
  });

  it("does not register an empty combo when no free candidates exist", async () => {
    const source = new FakeSource([]);
    const router = new FakeRouter();
    const result = await composeAndRegister(defaultUserConfig(), source, router);

    expect(result.registered).toBe(false);
    expect(result.combos).toEqual([]);
    expect(result.registrationError).toContain("no free model candidates");
    expect(router.upserts).toEqual([]);
  });

  it("registers budget-best and free-best on the budget tier", async () => {
    const user = defaultUserConfig();
    user.tier = "budget";
    const source = new FakeSource([
      candidate({ id: "vendor/free:free", access: "free" }),
      candidate({ id: "vendor/paid", access: "budget", provider: "opencode-go" }),
    ]);
    const router = new FakeRouter();
    const result = await composeAndRegister(user, source, router);

    expect(result.registered).toBe(true);
    expect(router.upserts.map((c) => c.name).sort()).toEqual(["budget-best", "free-best"]);
  });
});