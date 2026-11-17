import { promises as fs } from "node:fs";
import * as path from "node:path";
import {
  listRouterModels,
  providerPrefix,
  selectCandidates,
  suggestedCombo,
  verifyModels,
} from "../../core/verify.js";
import { makeObservation, recordObservation } from "../../core/reliability.js";
import { type Command, type CommandContext, jsonOut, out, UsageError } from "../command.js";

interface VerifyFlags {
  limit: number;
  provider?: string;
  key?: string;
  outp?: string;
}

function parseFlags(args: string[]): VerifyFlags {
  const flags: VerifyFlags = { limit: 12 };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--provider") {
      flags.provider = args[++index];
      if (!flags.provider) throw new UsageError("--provider needs a prefix, e.g. cf");
      continue;
    }
    if (arg.startsWith("--provider=")) {
      flags.provider = arg.slice("--provider=".length);
      continue;
    }
    if (arg === "--limit") {
      const value = Number.parseInt(args[++index] ?? "", 10);
      if (!Number.isFinite(value) || value <= 0) throw new UsageError("--limit needs a number");
      flags.limit = Math.min(value, 50);
      continue;
    }
    if (arg.startsWith("--limit=")) {
      const value = Number.parseInt(arg.slice("--limit=".length), 10);
      if (!Number.isFinite(value) || value <= 0) throw new UsageError("--limit needs a number");
      flags.limit = Math.min(value, 50);
      continue;
    }
    if (arg === "--key") {
      flags.key = args[++index];
      if (!flags.key) throw new UsageError("--key needs a value (prefer FRUGAL_ROUTER_KEY)");
      continue;
    }
    if (arg.startsWith("--key=")) {
      flags.key = arg.slice("--key=".length);
      continue;
    }
    if (arg === "--out") {
      flags.outp = args[++index];
      if (!flags.outp) throw new UsageError("--out needs a path");
      continue;
    }
    if (arg.startsWith("--out=")) {
      flags.outp = arg.slice("--out=".length);
      continue;
    }
    throw new UsageError(`unexpected argument: ${arg}`);
  }
  return flags;
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tmp, file);
}

export const verifyCommand: Command = {
  name: "verify",
  summary: "Probe the models 9Router advertises and keep only the ones that actually answer.",
  group: "Everyday",
  async run(ctx: CommandContext, args: string[]) {
    const flags = parseFlags(args);
    const key = (flags.key ?? process.env.FRUGAL_ROUTER_KEY ?? "").trim();
    if (!key) {
      throw new UsageError(
        'Set FRUGAL_ROUTER_KEY (e.g. export FRUGAL_ROUTER_KEY="$(cat ~/9router.txt)") or pass --key.',
      );
    }

    const allIds = await listRouterModels({ apiKey: key });
    const filtered = flags.provider
      ? allIds.filter((id) => providerPrefix(id) === flags.provider)
      : allIds;
    const candidates = selectCandidates(filtered, flags.limit);
    const results = await verifyModels(candidates, { apiKey: key });

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
    const combo = suggestedCombo(results);

    if (flags.outp) {
      await writeJson(flags.outp, {
        generated_at: new Date().toISOString(),
        router_models: allIds.length,
        probed: results.length,
        suggested_combo: combo,
        verified,
        failed,
      });
    }

    jsonOut(ctx, {
      router_models: allIds.length,
      probed: results.length,
      verified: verified.map((result) => ({ id: result.id, latency_ms: result.latencyMs })),
      failed: failed.map((result) => ({
        id: result.id,
        status: result.status,
        error: result.error,
      })),
      suggested_combo: combo,
      written_to: flags.outp ?? null,
    });

    if (!ctx.json) {
      out(ctx, `Probed ${results.length} of ${allIds.length} advertised models.`);
      out(ctx, `${verified.length} answered, ${failed.length} failed.`);
      for (const result of verified) {
        out(ctx, `  ok   ${result.id}${result.latencyMs != null ? ` (${result.latencyMs}ms)` : ""}`);
      }
      for (const result of failed) {
        const reason = result.status ?? "error";
        out(ctx, `  fail ${result.id} — ${reason}`);
      }
      if (combo.length > 0) {
        out(ctx, "");
        out(ctx, "Suggested free-best order (paste into 9Router → Combos → free-best):");
        combo.forEach((id, index) => out(ctx, `  ${index + 1}. ${id}`));
        out(ctx, "");
        out(
          ctx,
          "frugal cannot write combos yet: 9Router's /api needs a dashboard session, not the API key.",
        );
      } else {
        out(ctx, "No model answered. Check the 9Router connections before rebuilding the combo.");
      }
      out(ctx, "Probing spends a small amount of quota (one token per model).");
    }

    return verified.length > 0 ? 0 : 1;
  },
};