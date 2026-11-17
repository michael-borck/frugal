import {
  DEFAULT_MIN_CONTEXT_TOKENS,
  LOCAL_MIN_CONTEXT_TOKENS,
  COMBO_MAX_ENTRIES,
  COMBO_MIN_ENTRIES,
  type ComboEntry,
  type MergeInput,
  type MergeResult,
  type ModelCandidate,
  type ScoreEntry,
  type ScoreTier,
} from "./types.js";

export class RankingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RankingError";
  }
}

function scoreIndex(results?: MergeInput["results"]): Map<string, ScoreEntry> {
  const map = new Map<string, ScoreEntry>();
  for (const entry of results?.models ?? []) {
    map.set(entry.id, entry);
  }
  return map;
}

function passesFilters(
  candidate: ModelCandidate,
  minContextTokens: number,
  banned: Set<string>,
): string | null {
  if (banned.has(candidate.id)) return "banned";
  if (!candidate.textOutput) return "no-text-output";
  if (!candidate.supportsTools) return "no-tool-calling";
  // Local models use their own lower floor; the cloud minimum and the
  // instructor's min_context_tokens apply to cloud models only.
  const floor =
    candidate.provider === "local"
      ? LOCAL_MIN_CONTEXT_TOKENS
      : Math.max(minContextTokens, DEFAULT_MIN_CONTEXT_TOKENS);
  if (candidate.contextTokens < floor) {
    return `context-${candidate.contextTokens}-below-${floor}`;
  }
  return null;
}

const TIER_ORDER: Record<ScoreTier, number> = { A: 0, B: 1, C: 2 };

const NEUTRAL_SIGNAL = 0.5;

function compareRest(
  a: ModelCandidate,
  b: ModelCandidate,
  preferred: Set<string>,
): number {
  const tierDiff = (TIER_ORDER[a.tier ?? "C"] ?? 3) - (TIER_ORDER[b.tier ?? "C"] ?? 3);
  if (tierDiff !== 0) return tierDiff;

  const aPref = preferred.has(a.id) ? 0 : 1;
  const bPref = preferred.has(b.id) ? 0 : 1;
  if (aPref !== bPref) return aPref - bPref;

  // Within a tier: bench availability, then locally observed reliability,
  // then usage rank. Unknown signals are neutral rather than penalised.
  const aAvailability = a.availability ?? NEUTRAL_SIGNAL;
  const bAvailability = b.availability ?? NEUTRAL_SIGNAL;
  if (aAvailability !== bAvailability) return bAvailability - aAvailability;

  const aReliability = a.reliability ?? NEUTRAL_SIGNAL;
  const bReliability = b.reliability ?? NEUTRAL_SIGNAL;
  if (aReliability !== bReliability) return bReliability - aReliability;

  const aUsage = a.usageRank ?? Number.MAX_SAFE_INTEGER;
  const bUsage = b.usageRank ?? Number.MAX_SAFE_INTEGER;
  if (aUsage !== bUsage) return aUsage - bUsage;

  return a.id.localeCompare(b.id);
}

export function mergeCandidates(input: MergeInput): MergeResult {
  const { candidates, results, picks, user } = input;
  const byId = scoreIndex(results);
  const studentBan = new Set(user.ban);
  const instructorBan = new Set(picks?.ban ?? []);
  const minContext = picks?.min_context_tokens ?? DEFAULT_MIN_CONTEXT_TOKENS;

  const dropped: MergeResult["dropped"] = [];
  const kept: ModelCandidate[] = [];

  for (const candidate of candidates) {
    const reason = passesFilters(candidate, minContext, new Set([...studentBan, ...instructorBan]));
    if (reason) {
      dropped.push({ id: candidate.id, reason });
      continue;
    }
    if (!user.enabledProviders.includes(candidate.provider)) {
      dropped.push({ id: candidate.id, reason: "provider-not-enabled" });
      continue;
    }
    const scored = byId.get(candidate.id);
    const reliability =
      input.reliability?.get(candidate.id) ?? input.reliability?.get(candidate.provider);
    const enriched: ModelCandidate = {
      ...candidate,
      ...(reliability != null ? { reliability } : {}),
      ...(scored
        ? {
            score: scored.score,
            tier: scored.tier,
            scoreCi95: scored.score_ci95,
            medianLatencyMs: scored.median_latency_ms,
            availability: scored.suites.availability,
          }
        : {}),
    };
    kept.push(enriched);
  }

  const tierEligible = kept.filter((c) => user.tier === "budget" || c.access === "free");

  const studentPins: ModelCandidate[] = [];
  const instructorPins: ModelCandidate[] = [];
  const preferred = new Set(picks?.prefer ?? []);
  const rest: ModelCandidate[] = [];

  const byIdKept = new Map(tierEligible.map((c) => [c.id, c]));

  for (const id of user.pin) {
    const found = byIdKept.get(id);
    if (found) {
      studentPins.push(found);
      byIdKept.delete(id);
    } else {
      dropped.push({ id, reason: "pinned-model-not-in-free-list" });
    }
  }
  for (const id of picks?.pin ?? []) {
    const found = byIdKept.get(id);
    if (found) {
      instructorPins.push(found);
      byIdKept.delete(id);
    }
  }
  for (const candidate of byIdKept.values()) rest.push(candidate);

  rest.sort((a, b) => compareRest(a, b, preferred));

  const ordered = [...studentPins, ...instructorPins, ...rest].slice(0, COMBO_MAX_ENTRIES);

  if (ordered.length < COMBO_MIN_ENTRIES) {
    // Not fatal: a small provider pool is legitimate. Callers surface the count.
  }

  return { ordered, dropped };
}

export function toComboEntries(
  ordered: ModelCandidate[],
  tier: "free" | "budget",
): ComboEntry[] {
  return ordered.map((candidate) => ({
    id: candidate.id,
    provider: candidate.provider,
    access: candidate.access,
    score: candidate.score,
    contextTokens: candidate.contextTokens,
    source:
      candidate.tier != null && candidate.score != null
        ? "bench"
        : candidate.provider === "local"
          ? "local"
          : tier === "budget" && candidate.access === "budget"
            ? "paid"
            : "usage",
  }));
}

export function assertRankingInputs(input: MergeInput): void {
  if (!Array.isArray(input.candidates)) {
    throw new RankingError("candidates must be an array");
  }
  if (input.user.tier !== "free" && input.user.tier !== "budget") {
    throw new RankingError(`unknown tier: ${String(input.user.tier)}`);
  }
}