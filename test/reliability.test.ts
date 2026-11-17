import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Paths } from "../src/core/config.js";
import {
  loadReliability,
  makeObservation,
  readObservations,
  recordObservation,
  reliabilityMap,
  summarizeObservations,
  type Observation,
} from "../src/core/reliability.js";

function pathsFor(dir: string): Paths {
  return {
    configDir: dir,
    userConfigPath: path.join(dir, "user.json"),
    statePath: path.join(dir, "state.json"),
    secretsPath: path.join(dir, "secrets.json"),
    backupDir: path.join(dir, "backups"),
  };
}

describe("reliability ledger", () => {
  let dir: string;
  let paths: Paths;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "frugal-rel-"));
    paths = pathsFor(dir);
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("records and reads observations, skipping corrupt lines", async () => {
    await recordObservation(paths, makeObservation({ provider: "openrouter", kind: "catalog", ok: true }));
    await fs.appendFile(path.join(dir, "observations.jsonl"), "not json\n");
    const observations = await readObservations(paths);
    expect(observations).toHaveLength(1);
    expect(observations[0]?.provider).toBe("openrouter");
  });

  it("returns an empty list when there is no ledger", async () => {
    expect(await readObservations(paths)).toEqual([]);
  });

  it("summarizes success rate, ewma, consecutive failures and latency", () => {
    const now = new Date("2026-11-17T12:00:00Z");
    const at = (minutesAgo: number): string =>
      new Date(now.getTime() - minutesAgo * 60_000).toISOString();
    const observations: Observation[] = [
      { ts: at(40), provider: "openrouter", model: "a", kind: "request", ok: true, latencyMs: 100 },
      { ts: at(30), provider: "openrouter", model: "a", kind: "request", ok: false },
      { ts: at(20), provider: "openrouter", model: "a", kind: "request", ok: true, latencyMs: 300 },
      { ts: at(10), provider: "openrouter", model: "a", kind: "request", ok: true, latencyMs: 200 },
      { ts: at(9), provider: "groq", model: "b", kind: "request", ok: false },
      { ts: at(8), provider: "groq", model: "b", kind: "request", ok: false },
    ];
    const summary = summarizeObservations(observations, { now, windowDays: 30 });
    const a = summary.entries.find((e) => e.model === "a");
    const b = summary.entries.find((e) => e.model === "b");
    const openrouter = summary.entries.find((e) => e.provider === "openrouter" && e.model == null);

    expect(a?.samples).toBe(4);
    expect(a?.successRate).toBe(0.75);
    expect(a?.medianLatencyMs).toBe(200);
    expect(a?.consecutiveFailures).toBe(0);
    expect(b?.consecutiveFailures).toBe(2);
    expect(b?.ewmaSuccess).toBe(0);
    expect(openrouter?.samples).toBe(4);
  });

  it("excludes observations outside the window", () => {
    const now = new Date("2026-11-17T12:00:00Z");
    const old = new Date(now.getTime() - 40 * 86_400_000).toISOString();
    const summary = summarizeObservations(
      [{ ts: old, provider: "openrouter", model: "a", kind: "request", ok: false }],
      { now, windowDays: 30 },
    );
    expect(summary.entries).toHaveLength(0);
  });

  it("only produces a signal map for entries with enough samples", () => {
    const now = new Date("2026-11-17T12:00:00Z");
    const recent = new Date(now.getTime() - 60_000).toISOString();
    const summary = summarizeObservations(
      [
        { ts: recent, provider: "openrouter", model: "x", kind: "request", ok: true },
        { ts: recent, provider: "openrouter", model: "x", kind: "request", ok: true },
        { ts: recent, provider: "openrouter", model: "x", kind: "request", ok: true },
        { ts: recent, provider: "openrouter", model: "y", kind: "request", ok: false },
      ],
      { now, windowDays: 30 },
    );
    const map = reliabilityMap(summary);
    expect(map.has("x")).toBe(true);
    expect(map.has("y")).toBe(false);
  });

  it("loadReliability reads the ledger", async () => {
    await recordObservation(paths, makeObservation({ provider: "local", model: "ollama", kind: "probe", ok: true }));
    const summary = await loadReliability(paths);
    expect(summary.entries.length).toBeGreaterThan(0);
  });
});