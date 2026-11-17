import { SCHEMA_VERSION, type ModelCandidate, type PicksFile, type ResultsFile } from "./types.js";
import {
  OPENROUTER_MODELS_URL,
  parseOpenRouterFreeModels,
  type OpenRouterModelsResponse,
} from "./candidates.js";
import { parseCatalog } from "./catalog.js";
import { fetchUsageRanks } from "./usage.js";

export interface RankingSource {
  results(): Promise<ResultsFile | null>;
  picks(): Promise<PicksFile | null>;
  candidates(): Promise<ModelCandidate[]>;
}

export interface RankingSourceOptions {
  /** Optional: when absent, results are simply unavailable and ranking falls back. */
  resultsUrl?: string;
  picksUrl?: string;
  usageUrl?: string;
  /** Optional provider/model catalog; when absent, live OpenRouter is used. */
  catalogUrl?: string;
  openRouterModelsUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function major(version: string): string {
  return version.split(".")[0] ?? "";
}

function compatible(file: { schema_version?: unknown } | null): boolean {
  if (!file) return false;
  const version = file.schema_version;
  return typeof version === "string" && major(version) === major(SCHEMA_VERSION);
}

async function fetchJson<T>(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export class HttpRankingSource implements RankingSource {
  constructor(private readonly options: RankingSourceOptions) {}

  async results(): Promise<ResultsFile | null> {
    if (!this.options.resultsUrl) return null;
    const file = await fetchJson<ResultsFile>(
      this.options.resultsUrl,
      this.options.fetchImpl ?? fetch,
      this.options.timeoutMs ?? 10_000,
    );
    return compatible(file) ? file : null;
  }

  async picks(): Promise<PicksFile | null> {
    if (!this.options.picksUrl) return null;
    const file = await fetchJson<PicksFile>(
      this.options.picksUrl,
      this.options.fetchImpl ?? fetch,
      this.options.timeoutMs ?? 10_000,
    );
    return compatible(file) ? file : null;
  }

  async candidates(): Promise<ModelCandidate[]> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const timeoutMs = this.options.timeoutMs ?? 10_000;

    let candidates: ModelCandidate[] | null = null;

    if (this.options.catalogUrl) {
      const catalog = await fetchJson<unknown>(this.options.catalogUrl, fetchImpl, timeoutMs);
      if (catalog) {
        const parsed = parseCatalog(catalog);
        if (parsed.length > 0) candidates = parsed;
      }
    }

    if (!candidates) {
      // Fallback: live OpenRouter free-model discovery.
      const payload = await fetchJson<OpenRouterModelsResponse>(
        this.options.openRouterModelsUrl ?? OPENROUTER_MODELS_URL,
        fetchImpl,
        timeoutMs,
      );
      if (!payload) {
        throw new Error("could not fetch a model catalog or the OpenRouter model list");
      }
      candidates = parseOpenRouterFreeModels(payload);
    }

    const usage = await fetchUsageRanks(this.options.usageUrl, fetchImpl, timeoutMs);
    if (usage.size > 0) {
      for (const candidate of candidates) {
        const rank = usage.get(candidate.id);
        if (rank != null) candidate.usageRank = rank;
      }
    }
    return candidates;
  }
}