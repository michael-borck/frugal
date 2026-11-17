import {
  listRouterModels,
  providerPrefix,
  selectCandidates,
  suggestedCombo,
  verifyModels,
  type ProbeResult,
} from "../../core/verify.js";
import { makeObservation, recordObservation } from "../../core/reliability.js";
import { RouterSession, type SessionApi } from "../../core/sessionClient.js";
import { ROUTER_HOST, ROUTER_PORT } from "../../core/types.js";
import { type Command, type CommandContext, jsonOut, out, UsageError } from "../command.js";
import { ReadlinePrompter } from "../prompt.js";

const DEFAULT_LIMIT = 10;

export interface RefreshDeps {
  session?: SessionApi;
  fetchImpl?: typeof fetch;
  key?: string;
  password?: string;
  limit?: number;
  apply?: boolean;
}

function parseFlags(args: string[]): { limit: number; apply: boolean } {
  let limit = DEFAULT_LIMIT;
  let apply = true;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--no-apply") {
      apply = false;
      continue;
    }
    if (arg === "--limit") {
      const value = Number.parseInt(args[++index] ?? "", 10);
      if (!Number.isFinite(value) || value <= 0) throw new UsageError("--limit needs a number");
      limit = Math.min(value, 50);
      continue;
    }
    if (arg.startsWith("--limit=")) {
      const value = Number.parseInt(arg.slice("--limit=".length), 10);
      if (!Number.isFinite(value) || value <= 0) throw new UsageError("--limit needs a number");
      limit = Math.min(value, 50);
      continue;
    }
    throw new UsageError(`unexpected argument: ${arg}`);
  }
  return { limit, apply };
}

/**
 * The daily check: refresh provider catalogs, probe a spread of models through
 * 9Router, then update free-best with the responders and Strategy: Fallback.
 * Needs a dashboard session to apply; without one it prints a paste-ready order.
 */
export async function runRefresh(ctx: CommandContext, deps: RefreshDeps = {}): Promise<number> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const limit = deps.limit ?? DEFAULT_LIMIT;
  const apply = deps.apply ?? true;

  let session: SessionApi | undefined = deps.session;
  let key = (deps.key ?? process.env.FRUGAL_ROUTER_KEY ?? "").trim();
  let password = (deps.password ?? process.env.FRUGAL_ROUTER_PASSWORD ?? "").trim();

  if (!session && !key && !password && process.stdin.isTTY) {
    const prompter = new ReadlinePrompter();
    try {
      password = (await prompter.secret("9Router dashboard password (Enter to skip):")).trim();
    } finally {
      prompter.close();
    }
  }

  if (!session && password) {
    const candidate = new RouterSession({ fetchImpl });
    try {
      const login = await candidate.login(password);
      if (login.ok) {
        session = candidate;
      } else {
        out(ctx, `Could not log in (${login.detail}); continuing without a session.`);
      }
    } catch (error) {
      out(ctx, `Could not log in: ${(error as Error).message}; continuing without a session.`);
    }
  }

  if (!session && !key) {
    throw new UsageError(
      "Set FRUGAL_ROUTER_PASSWORD (to update the combo) or FRUGAL_ROUTER_KEY (verify only).",
    );
  }

  let catalogSynced = false;
  if (session) {
    try {
      const sync = await session.catalogSync();
      catalogSynced = sync.ok;
      if (!ctx.json) {
        out(ctx, sync.ok ? "Refreshed 9Router's provider catalogs." : `Catalog sync failed: ${sync.detail}`);
      }
    } catch (error) {
      if (!ctx.json) out(ctx, `Catalog sync failed: ${(error as Error).message}`);
    }
  }

  if (!key && session) {
    try {
      key = await session.getApiKey("frugal");
    } catch (error) {
      throw new UsageError(`Could not get a 9Router API key: ${(error as Error).message}`);
    }
  }
  if (!key) throw new UsageError("No 9Router API key available.");

  let ids: string[] = [];
  try {
    ids = session ? await session.listModels() : [];
    if (ids.length === 0) ids = await listRouterModels({ apiKey: key, fetchImpl });
  } catch (error) {
    throw new UsageError(`Could not read models from 9Router: ${(error as Error).message}`);
  }
  if (ids.length === 0) {
    throw new UsageError("9Router reports no models. Connect providers first.");
  }

  const candidates = selectCandidates(ids, limit);
  if (!ctx.json) out(ctx, `Probing ${candidates.length} of ${ids.length} models...`);
  const results: ProbeResult[] = await verifyModels(candidates, { apiKey: key, fetchImpl });
  for (const result of results) {
    await recordObservation(
      ctx.paths,
      makeObservation({
        provider: providerPrefix(result.id),
        model: result.id,
        kind: "probe",
        ok: result.ok,
        status: result.status ?? undefined,
        latencyMs: result.latencyMs ?? undefined,
        error: result.error ?? undefined,
      }),
    );
  }

  const verified = results.filter((result) => result.ok);
  const failed = results.filter((result) => !result.ok);
  const combo = suggestedCombo(results, 10);

  let applied = false;
  let strategy = false;
  let applyError: string | null = null;
  if (session && combo.length > 0 && apply) {
    try {
      await session.upsertCombo("free-best", combo);
      strategy = await session.ensureFallbackStrategy("free-best");
      applied = true;
    } catch (error) {
      applyError = (error as Error).message;
    }
  }

  const report = {
    refreshed_at: new Date().toISOString(),
    catalog_synced: catalogSynced,
    session: session != null,
    probed: results.length,
    verified: verified.map((result) => ({ id: result.id, latency_ms: result.latencyMs })),
    failed: failed.map((result) => ({ id: result.id, status: result.status })),
    combo,
    applied,
    strategy_fallback: strategy,
    apply_error: applyError,
  };
  jsonOut(ctx, report);

  if (!ctx.json) {
    out(ctx, `${verified.length} answered, ${failed.length} failed.`);
    if (combo.length === 0) {
      out(ctx, "No model answered; the combo was left unchanged.");
    } else if (applied) {
      out(ctx, `Updated free-best with ${combo.length} models${strategy ? ", Strategy: Fallback" : ""}.`);
    } else {
      out(ctx, "free-best order (not applied):");
      combo.forEach((id, index) => out(ctx, `  ${index + 1}. ${id}`));
      if (applyError) out(ctx, `Could not apply: ${applyError}`);
      else if (!apply) out(ctx, "Dry run (--no-apply).");
      else out(ctx, "Log in with FRUGAL_ROUTER_PASSWORD to apply automatically.");
    }
  }

  if (verified.length === 0) return 1;
  if (session && apply && combo.length > 0 && !applied) return 1;
  return 0;
}

export const refreshCommand: Command = {
  name: "refresh",
  summary: "Daily check: refresh catalogs, verify models, update free-best.",
  group: "Everyday",
  async run(ctx: CommandContext, args: string[]) {
    const flags = parseFlags(args);
    return runRefresh(ctx, flags);
  },
};