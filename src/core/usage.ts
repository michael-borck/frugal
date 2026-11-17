/**
 * Usage ranking input is deliberately schema-flexible because the authoritative
 * OpenRouter usage source is unverified. Supported payloads:
 *   - ["vendor/a:free", "vendor/b:free"]              order = rank
 *   - [{ "id": "vendor/a:free", "tokens": 12345 }, …]  rank by tokens desc
 *   - [{ "id": "vendor/a:free" }, …]                    order = rank
 *   - { "models": [...] } or { "data": [...] }          same as above
 *   - { "vendor/a:free": 12345, … }                     rank by value desc
 * Rank is 1-based; lower is more used (better).
 */

function numeric(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function rankByIds(ids: string[]): Map<string, number> {
  const ranks = new Map<string, number>();
  ids.forEach((id, index) => {
    if (!ranks.has(id)) ranks.set(id, index + 1);
  });
  return ranks;
}

function parseList(list: unknown[]): Map<string, number> {
  const objects = list.filter((item): item is Record<string, unknown> => typeof item === "object" && item != null);
  const hasWeights = objects.length === list.length && objects.every((item) => numeric(item.tokens ?? item.total_tokens ?? item.count) != null);

  if (hasWeights) {
    const weighted = objects
      .map((item) => ({
        id: String(item.id ?? item.model ?? ""),
        weight: numeric(item.tokens ?? item.total_tokens ?? item.count) ?? 0,
      }))
      .filter((entry) => entry.id.length > 0)
      .sort((a, b) => b.weight - a.weight);
    return rankByIds(weighted.map((entry) => entry.id));
  }

  const ids = list.map((item) => {
    if (typeof item === "string") return item;
    if (typeof item === "object" && item != null) {
      const record = item as Record<string, unknown>;
      return String(record.id ?? record.model ?? "");
    }
    return "";
  });
  return rankByIds(ids.filter((id) => id.length > 0));
}

export function parseUsageRanks(payload: unknown): Map<string, number> {
  if (Array.isArray(payload)) return parseList(payload);
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.models)) return parseList(record.models);
    if (Array.isArray(record.data)) return parseList(record.data);

    const weighted = Object.entries(record)
      .map(([id, value]) => ({ id, weight: numeric(value) }))
      .filter((entry): entry is { id: string; weight: number } => entry.weight != null)
      .sort((a, b) => b.weight - a.weight);
    if (weighted.length > 0) return rankByIds(weighted.map((entry) => entry.id));
  }
  return new Map();
}

export async function fetchUsageRanks(
  url: string | undefined,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 10_000,
): Promise<Map<string, number>> {
  if (!url) return new Map();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) return new Map();
    return parseUsageRanks(await response.json());
  } catch {
    return new Map();
  } finally {
    clearTimeout(timer);
  }
}