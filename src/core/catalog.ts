import { isProviderId } from "./providers.js";
import { SCHEMA_VERSION, type ModelCandidate } from "./types.js";

/**
 * Turn a catalog.json published by frugal-bench into candidates.
 *
 * The catalog is provider-agnostic: each provider slice lists its models with a
 * computed free/budget access, context and capability flags. Unknown providers
 * and mismatched schema majors are ignored so a bad catalog cannot break frugal.
 */
export function parseCatalog(payload: unknown): ModelCandidate[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as { schema_version?: unknown; providers?: unknown };
  const version = root.schema_version;
  if (
    typeof version !== "string" ||
    version.split(".")[0] !== SCHEMA_VERSION.split(".")[0]
  ) {
    return [];
  }

  const providers = Array.isArray(root.providers) ? root.providers : [];
  const seen = new Set<string>();
  const candidates: ModelCandidate[] = [];

  for (const slice of providers) {
    if (!slice || typeof slice !== "object") continue;
    const providerRecord = slice as { id?: unknown; models?: unknown };
    const source = typeof providerRecord.id === "string" ? providerRecord.id : "";
    if (!isProviderId(source)) continue;
    const models = Array.isArray(providerRecord.models) ? providerRecord.models : [];

    for (const model of models) {
      if (!model || typeof model !== "object") continue;
      const record = model as Record<string, unknown>;
      const id = typeof record.id === "string" ? record.id : "";
      if (!id || seen.has(id)) continue;
      seen.add(id);
      candidates.push({
        id,
        provider: source,
        access: record.access === "free" ? "free" : "budget",
        contextTokens: typeof record.context === "number" ? record.context : 0,
        supportsTools: record.tools === true,
        textOutput: true,
        promptPrice: typeof record.price_in === "number" ? record.price_in : 0,
        completionPrice: typeof record.price_out === "number" ? record.price_out : 0,
      });
    }
  }

  return candidates;
}