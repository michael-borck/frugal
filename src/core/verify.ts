import { ROUTER_HOST, ROUTER_PORT } from "./types.js";

export interface ProbeResult {
  id: string;
  ok: boolean;
  status: number | null;
  latencyMs: number | null;
  error: string | null;
}

export interface RouterRequestOptions {
  baseUrl?: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function apiBase(baseUrl?: string): string {
  return baseUrl ?? `http://${ROUTER_HOST}:${ROUTER_PORT}`;
}

/** Read the model ids 9Router advertises. Unknown/stale ids are expected. */
export async function listRouterModels(options: RouterRequestOptions): Promise<string[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
  try {
    const response = await fetchImpl(`${apiBase(options.baseUrl)}/v1/models`, {
      headers: { authorization: `Bearer ${options.apiKey}` },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`/v1/models returned ${response.status}`);
    const payload = (await response.json()) as {
      data?: Array<{ id?: unknown }>;
      models?: Array<{ id?: unknown }>;
    };
    const list = payload.data ?? payload.models ?? [];
    return list
      .map((entry) => (typeof entry.id === "string" ? entry.id : ""))
      .filter((id) => id.length > 0);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pick a spread of candidates across providers instead of the first N, which
 * would all come from whichever provider 9Router happens to list first.
 * Combo names (no slash) are skipped; probing a combo would recurse.
 */
export function selectCandidates(ids: string[], limit: number): string[] {
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    if (!id.includes("/")) continue;
    const prefix = id.split("/")[0]!;
    const group = groups.get(prefix) ?? [];
    group.push(id);
    groups.set(prefix, group);
  }
  const queues = [...groups.values()];
  const picked: string[] = [];
  let index = 0;
  while (picked.length < limit && queues.some((queue) => index < queue.length)) {
    for (const queue of queues) {
      if (picked.length >= limit) break;
      const id = queue[index];
      if (id != null) picked.push(id);
    }
    index += 1;
  }
  return picked;
}

export async function probeModel(
  id: string,
  options: RouterRequestOptions,
): Promise<ProbeResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 45_000);
  const startedAt = Date.now();
  try {
    const response = await fetchImpl(`${apiBase(options.baseUrl)}/v1/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${options.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: id,
        messages: [{ role: "user", content: "ok" }],
        max_tokens: 1,
      }),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - startedAt;
    if (response.ok) {
      return { id, ok: true, status: response.status, latencyMs, error: null };
    }
    let detail = "";
    try {
      const text = await response.text();
      detail = text.slice(0, 200);
    } catch {
      detail = "";
    }
    return { id, ok: false, status: response.status, latencyMs, error: detail || null };
  } catch (error) {
    return {
      id,
      ok: false,
      status: null,
      latencyMs: Date.now() - startedAt,
      error: (error as Error).message,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function verifyModels(
  ids: string[],
  options: RouterRequestOptions,
): Promise<ProbeResult[]> {
  const results: ProbeResult[] = [];
  for (const id of ids) {
    results.push(await probeModel(id, options));
  }
  return results;
}

/** A paste-ready order for a 9Router combo: responders, fastest first. */
export function suggestedCombo(results: ProbeResult[], max = 10): string[] {
  return results
    .filter((result) => result.ok)
    .sort((a, b) => {
      const aLatency = a.latencyMs ?? Number.MAX_SAFE_INTEGER;
      const bLatency = b.latencyMs ?? Number.MAX_SAFE_INTEGER;
      if (aLatency !== bLatency) return aLatency - bLatency;
      return a.id.localeCompare(b.id);
    })
    .slice(0, max)
    .map((result) => result.id);
}

export function providerPrefix(id: string): string {
  return id.includes("/") ? id.split("/")[0]! : "router";
}