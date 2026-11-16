import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildCombos, allSnapshots } from "../src/core/combos.js";
import { defaultUserConfig } from "../src/core/config.js";
import type { ModelCandidate, ResultsFile, ScoreEntry } from "../src/core/types.js";
import {
  writeOpenCodeConfig,
  readOpenCodeConfig,
} from "../src/core/integrations/opencode.js";
import { writePiConfig } from "../src/core/integrations/pi.js";
import { writeMstyGuide, mstyGuide } from "../src/core/integrations/msty.js";

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

describe("buildCombos", () => {
  it("free tier produces only free-best", () => {
    const built = buildCombos({
      candidates: [candidate({ id: "a" })],
      user: defaultUserConfig(),
    });
    expect(built.free.name).toBe("free-best");
    expect(built.budget).toBeNull();
    expect(allSnapshots(built).map((c) => c.name)).toEqual(["free-best"]);
  });

  it("budget tier produces budget-best and free-best", () => {
    const user = defaultUserConfig();
    user.tier = "budget";
    const built = buildCombos({
      candidates: [
        candidate({ id: "free", access: "free" }),
        candidate({ id: "paid", access: "budget", provider: "opencode-go" }),
      ],
      results: results([entry({ id: "paid", access: "budget" })]),
      user,
    });
    expect(built.budget?.name).toBe("budget-best");
    const names = allSnapshots(built).map((c) => c.name);
    expect(names).toContain("free-best");
    expect(names).toContain("budget-best");
  });
});

describe("openCode integration", () => {
  let tmp: string;
  const originalHome = process.env.HOME;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "frugal-opencode-"));
    process.env.HOME = tmp;
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("writes an additive provider entry and sets the default model", async () => {
    const result = await writeOpenCodeConfig({ model: "free-best" });
    expect(result.changed).toBe(true);
    const config = await readOpenCodeConfig();
    expect(config?.provider?.frugal).toBeTruthy();
    expect(config?.model).toBe("frugal/free-best");
  });

  it("backs up the original once and preserves existing providers", async () => {
    const configPath = path.join(tmp, ".config", "opencode", "opencode.json");
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(
      configPath,
      JSON.stringify({ provider: { anthropic: { npm: "@ai-sdk/anthropic" } } }),
    );
    await writeOpenCodeConfig();
    const config = await readOpenCodeConfig();
    expect(config?.provider?.anthropic).toBeTruthy();
    expect(config?.provider?.frugal).toBeTruthy();
    // second run should not overwrite the first backup
    await writeOpenCodeConfig();
    const backup = await fs.readFile(`${configPath}.frugal-backup`, "utf8");
    expect(backup).toContain("anthropic");
    expect(backup).not.toContain("frugal");
  });
});

describe("pi integration", () => {
  it("writes the 9Router extension settings", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "frugal-pi-"));
    const originalHome = process.env.HOME;
    process.env.HOME = tmp;
    try {
      const result = await writePiConfig({ model: "free-best" });
      expect(result.changed).toBe(true);
      const file = path.join(tmp, ".pi", "agent", "9router-config.json");
      const written = JSON.parse(await fs.readFile(file, "utf8"));
      expect(written.url).toContain("/v1");
      expect(written.models).toContain("free-best");
    } finally {
      process.env.HOME = originalHome;
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

describe("msty integration", () => {
  it("returns a paste guide without writing a file", () => {
    const result = writeMstyGuide({ model: "budget-best" });
    expect(result.changed).toBe(false);
    expect(result.detail).toContain("budget-best");
    const guide = mstyGuide({ model: "budget-best" });
    expect(guide.steps.length).toBeGreaterThan(0);
  });
});