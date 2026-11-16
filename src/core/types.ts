export type Tier = "free" | "budget";

export type LocalMode = "fallback" | "first" | "only";

export type ModelAccess = "free" | "budget";

export type ProviderId =
  | "opencode-free"
  | "openrouter"
  | "groq"
  | "github-copilot-student"
  | "mistral"
  | "google-gemini"
  | "cloudflare-workers-ai"
  | "nvidia-api-catalog"
  | "kiro"
  | "opencode-go"
  | "clinepass"
  | "z-ai-glm"
  | "kimi"
  | "chutes"
  | "local";

export type ScoreTier = "A" | "B" | "C";

export interface ModelCandidate {
  id: string;
  provider: ProviderId;
  access: ModelAccess;
  contextTokens: number;
  supportsTools: boolean;
  textOutput: boolean;
  promptPrice: number;
  completionPrice: number;
  usageRank?: number;
  score?: number;
  tier?: ScoreTier;
  scoreCi95?: [number, number];
  medianLatencyMs?: number;
}

/** results.json model entry (snake_case on the wire). */
export interface ScoreEntry {
  id: string;
  provider: ProviderId;
  tier: ScoreTier;
  score: number;
  score_ci95: [number, number];
  suites: {
    code: number;
    tools: number;
    availability: number;
    long_context: number;
  };
  median_latency_ms: number;
  context_tokens: number;
  gates_passed: boolean;
  last_full_run: string;
  last_seen_free: string;
  status: "active" | "removed";
  access?: ModelAccess;
}

export interface LocalScoreEntry {
  vram_class_gb: 6 | 8 | 12;
  model: string;
  quant: string;
  file_gb: number;
  context_tested: number;
  engine: "ollama" | "llama.cpp" | "kindi";
  score: number;
  score_ci95: [number, number];
  suites: { code: number; tools: number };
  speed: {
    gpu: string;
    tokens_per_second: number;
    source: "measured" | "community";
  };
  last_full_run: string;
}

export interface ResultsFile {
  schema_version: string;
  generated_at: string;
  suite_version: string;
  models: ScoreEntry[];
  local?: LocalScoreEntry[];
}

export interface PicksFile {
  schema_version: string;
  updated_at: string;
  pin: string[];
  prefer: string[];
  ban: string[];
  min_context_tokens?: number;
  notes?: string;
}

export interface UserConfig {
  schemaVersion: string;
  tier: Tier;
  maxMonthlyUsd: number;
  pin: string[];
  ban: string[];
  lock: string | null;
  localMode: LocalMode;
  enabledProviders: ProviderId[];
  picksUrl?: string;
  resultsUrl?: string;
}

export interface ComboSnapshot {
  name: string;
  generatedAt: string;
  entries: ComboEntry[];
}

/**
 * frugal-owned runtime state.
 *
 * frugal is a configurator, not a proxy: 9Router owns the request path
 * (failover, context guard, cooldowns, quota reads). This file records only
 * what frugal itself produced (the combos it wrote and when), never live
 * per-model runtime signals it does not own.
 */
export interface RuntimeState {
  schemaVersion: string;
  lastGoodCombo: ComboSnapshot | null;
  lastRefreshAt: string | null;
  lastFreeModelList: string[];
}

export interface ComboEntry {
  id: string;
  provider: ProviderId;
  access: ModelAccess;
  score?: number;
  source: "bench" | "usage" | "local" | "paid" | "pin";
}

export interface MergeInput {
  candidates: ModelCandidate[];
  results?: ResultsFile | null;
  picks?: PicksFile | null;
  user: UserConfig;
}

export interface MergeResult {
  ordered: ModelCandidate[];
  dropped: Array<{ id: string; reason: string }>;
}

export const SCHEMA_VERSION = "1.0";
export const DEFAULT_MAX_MONTHLY_USD = 40;
export const DEFAULT_MIN_CONTEXT_TOKENS = 131072;
export const LOCAL_MIN_CONTEXT_TOKENS = 8192;
export const COMBO_MIN_ENTRIES = 8;
export const COMBO_MAX_ENTRIES = 10;
export const ROUTER_HOST = "127.0.0.1";
export const ROUTER_PORT = 20128;
export const RESULTS_STALE_DAYS = 45;
export const COMBO_STALE_HOURS = 24;

/** The two combos frugal writes to 9Router. Students pick one by model name. */
export const FREE_COMBO_NAME = "free-best";
export const BUDGET_COMBO_NAME = "budget-best";

export function comboNameForTier(tier: Tier): string {
  return tier === "budget" ? BUDGET_COMBO_NAME : FREE_COMBO_NAME;
}

/** How many combos a given tier should expose. */
export function combosForTier(tier: Tier): string[] {
  return tier === "budget" ? [BUDGET_COMBO_NAME, FREE_COMBO_NAME] : [FREE_COMBO_NAME];
}