import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { Paths } from "./config.js";

export type ObservationKind = "catalog" | "key" | "health" | "request" | "probe";

/** One timestamped observation. Never contains prompts or keys. */
export interface Observation {
  ts: string;
  provider: string;
  model?: string;
  kind: ObservationKind;
  ok: boolean;
  status?: number;
  latencyMs?: number;
  error?: string;
}

export interface ReliabilityEntry {
  provider: string;
  model?: string;
  samples: number;
  successes: number;
  successRate: number | null;
  ewmaSuccess: number | null;
  consecutiveFailures: number;
  lastOkAt: string | null;
  lastFailAt: string | null;
  medianLatencyMs: number | null;
}

export interface ReliabilitySummary {
  schemaVersion: string;
  generatedAt: string;
  windowDays: number;
  entries: ReliabilityEntry[];
}

export const OBSERVATIONS_FILE = "observations.jsonl";
export const OBSERVATION_RETENTION_DAYS = 90;
const PRUNE_MARKER = "observations.pruned";
const EWMA_ALPHA = 0.2;
const MIN_SAMPLES_FOR_SIGNAL = 3;

function observationsPath(paths: Paths): string {
  return path.join(paths.configDir, OBSERVATIONS_FILE);
}

function pruneMarkerPath(paths: Paths): string {
  return path.join(paths.configDir, PRUNE_MARKER);
}

export function makeObservation(
  input: Omit<Observation, "ts"> & { ts?: string },
): Observation {
  return { ...input, ts: input.ts ?? new Date().toISOString() };
}

export async function recordObservation(paths: Paths, observation: Observation): Promise<void> {
  await fs.mkdir(paths.configDir, { recursive: true });
  await fs.appendFile(observationsPath(paths), `${JSON.stringify(observation)}\n`, "utf8");
  await maybePrune(paths);
}

/**
 * Drop observations older than the retention window (default 90 days) and any
 * corrupt lines. Returns how many lines were removed.
 */
export async function pruneObservations(
  paths: Paths,
  retentionDays = OBSERVATION_RETENTION_DAYS,
  now: Date = new Date(),
): Promise<number> {
  const file = observationsPath(paths);
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }

  const cutoff = now.getTime() - retentionDays * 86_400_000;
  const lines = raw.split("\n");
  const kept: string[] = [];
  let removed = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as Observation;
      if (typeof parsed.provider === "string" && typeof parsed.ok === "boolean") {
        const ts = Date.parse(parsed.ts);
        if (Number.isFinite(ts) && ts >= cutoff) {
          kept.push(JSON.stringify(parsed));
          continue;
        }
      }
      removed += 1;
    } catch {
      removed += 1;
    }
  }

  if (removed === 0) return 0;
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, kept.length > 0 ? `${kept.join("\n")}\n` : "", "utf8");
  await fs.rename(tmp, file);
  return removed;
}

/** Prune at most once per UTC day, tracked by a small marker file. */
async function maybePrune(paths: Paths, now: Date = new Date()): Promise<void> {
  const today = now.toISOString().slice(0, 10);
  try {
    const last = (await fs.readFile(pruneMarkerPath(paths), "utf8")).trim();
    if (last === today) return;
  } catch {
    // No marker yet: prune below.
  }
  await pruneObservations(paths, OBSERVATION_RETENTION_DAYS, now);
  await fs.writeFile(pruneMarkerPath(paths), today, "utf8");
}

export async function readObservations(
  paths: Paths,
  sinceMs?: number,
): Promise<Observation[]> {
  let raw: string;
  try {
    raw = await fs.readFile(observationsPath(paths), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const observations: Observation[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as Observation;
      if (typeof parsed.provider !== "string" || typeof parsed.ok !== "boolean") continue;
      if (sinceMs != null && Date.parse(parsed.ts) < sinceMs) continue;
      observations.push(parsed);
    } catch {
      // Skip a corrupt line rather than losing the whole ledger.
    }
  }
  return observations;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
  }
  return sorted[mid]!;
}

function summarizeKey(
  provider: string,
  model: string | undefined,
  observations: Observation[],
): ReliabilityEntry {
  const ordered = [...observations].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const samples = ordered.length;
  const successes = ordered.filter((o) => o.ok).length;

  let ewma: number | null = null;
  for (const observation of ordered) {
    const value = observation.ok ? 1 : 0;
    ewma = ewma == null ? value : EWMA_ALPHA * value + (1 - EWMA_ALPHA) * ewma;
  }

  let consecutiveFailures = 0;
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    if (ordered[index]!.ok) break;
    consecutiveFailures += 1;
  }

  const lastOk = [...ordered].reverse().find((o) => o.ok);
  const lastFail = [...ordered].reverse().find((o) => !o.ok);
  const latencies = ordered
    .filter((o) => o.ok && typeof o.latencyMs === "number")
    .map((o) => o.latencyMs as number);

  return {
    provider,
    model,
    samples,
    successes,
    successRate: samples > 0 ? Math.round((successes / samples) * 1000) / 1000 : null,
    ewmaSuccess: ewma == null ? null : Math.round(ewma * 1000) / 1000,
    consecutiveFailures,
    lastOkAt: lastOk?.ts ?? null,
    lastFailAt: lastFail?.ts ?? null,
    medianLatencyMs: median(latencies),
  };
}

export function summarizeObservations(
  observations: Observation[],
  options: { now?: Date; windowDays?: number } = {},
): ReliabilitySummary {
  const windowDays = options.windowDays ?? 30;
  const now = options.now ?? new Date();
  const sinceMs = now.getTime() - windowDays * 86_400_000;
  const recent = observations.filter((o) => Date.parse(o.ts) >= sinceMs);

  const byModel = new Map<string, Observation[]>();
  const byProvider = new Map<string, Observation[]>();
  for (const observation of recent) {
    const providerKey = observation.provider;
    byProvider.set(providerKey, [...(byProvider.get(providerKey) ?? []), observation]);
    if (observation.model) {
      const modelKey = `${observation.provider}\u0000${observation.model}`;
      byModel.set(modelKey, [...(byModel.get(modelKey) ?? []), observation]);
    }
  }

  const entries: ReliabilityEntry[] = [];
  for (const observation of byProvider.values()) {
    if (observation.length === 0) continue;
    entries.push(summarizeKey(observation[0]!.provider, undefined, observation));
  }
  for (const observationsForModel of byModel.values()) {
    const first = observationsForModel[0]!;
    entries.push(summarizeKey(first.provider, first.model, observationsForModel));
  }
  entries.sort((a, b) => {
    if (a.provider !== b.provider) return a.provider.localeCompare(b.provider);
    return (a.model ?? "").localeCompare(b.model ?? "");
  });

  return {
    schemaVersion: "1.0",
    generatedAt: now.toISOString(),
    windowDays,
    entries,
  };
}

/**
 * Map of model id (and provider id as a fallback) to a recency-weighted success
 * score in [0, 1]. Only keys with enough samples are included, so one bad day
 * does not poison the ranking.
 */
export function reliabilityMap(summary: ReliabilitySummary): Map<string, number> {
  const map = new Map<string, number>();
  for (const entry of summary.entries) {
    if (entry.samples < MIN_SAMPLES_FOR_SIGNAL || entry.ewmaSuccess == null) continue;
    const key = entry.model ?? entry.provider;
    map.set(key, entry.ewmaSuccess);
  }
  return map;
}

export async function loadReliability(
  paths: Paths,
  options: { now?: Date; windowDays?: number } = {},
): Promise<ReliabilitySummary> {
  const now = options.now ?? new Date();
  const windowDays = options.windowDays ?? 30;
  const observations = await readObservations(paths, now.getTime() - windowDays * 86_400_000);
  return summarizeObservations(observations, { now, windowDays });
}