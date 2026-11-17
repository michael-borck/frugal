import { SCHEMA_VERSION, type ModelCandidate, type PicksFile, type ResultsFile } from "./types.js";
import {
  OPENROUTER_MODELS_URL,
  parseOpenRouterFreeModels,
  type OpenRouterModelsResponse,
} from "./candidates.js";

export interface RankingSource {
  results(): Promise<ResultsFile | null>;
  picks(): Promise<PicksFile | null>;
  candidates(): Promise<ModelCandidate[]>;
}

export interface RankingSourceOptions {
  resultsUrl: string;
  picksUrl: string;
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
    const file = await fetchJson<ResultsFile>(
      this.options.resultsUrl,
      this.options.fetchImpl ?? fetch,
      this.options.timeoutMs ?? 10_000,
    );
    return compatible(file) ? file : null;
  }

  async picks(): Promise<PicksFile | null> {
    const file = await fetchJson<PicksFile>(
      this.options.picksUrl,
      this.options.fetchImpl ?? fetch,
      this.options.timeoutMs ?? 10_000,
    );
    return compatible(file) ? file : null;
  }

  async candidates(): Promise<ModelCandidate[]> {
    const payload = await fetchJson<OpenRouterModelsResponse>(
      this.options.openRouterModelsUrl ?? OPENROUTER_MODELS_URL,
      this.options.fetchImpl ?? fetch,
      this.options.timeoutMs ?? 10_000,
    );
    if (!payload) {
      throw new Error("could not fetch the OpenRouter model list");
    }
    return parseOpenRouterFreeModels(payload);
  }
}