import { loadReliability } from "../../core/reliability.js";
import { type Command, type CommandContext, jsonOut, out } from "../command.js";

function parseDays(args: string[]): number {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg.startsWith("--days=")) {
      const value = Number.parseInt(arg.slice("--days=".length), 10);
      if (Number.isFinite(value) && value > 0) return value;
    }
    if (arg === "--days") {
      const value = Number.parseInt(args[index + 1] ?? "", 10);
      if (Number.isFinite(value) && value > 0) return value;
    }
  }
  return 30;
}

export const reliabilityCommand: Command = {
  name: "reliability",
  summary: "Show observed success and latency per provider and model over time.",
  group: "Upkeep",
  async run(ctx: CommandContext, args: string[]) {
    const windowDays = parseDays(args);
    const summary = await loadReliability(ctx.paths, { windowDays });

    jsonOut(ctx, summary);
    if (ctx.json) return 0;

    if (summary.entries.length === 0) {
      out(ctx, "No observations yet. frugal records outcomes as it validates keys, probes the router and detects local servers.");
      out(ctx, "Real request outcomes arrive with frugal watch (v0.2).");
      return 0;
    }

    out(ctx, `Observed reliability over the last ${windowDays} days:`);
    for (const entry of summary.entries) {
      const label = entry.model ? `${entry.provider}/${entry.model}` : `${entry.provider} (all)`;
      const rate = entry.successRate == null ? "n/a" : `${Math.round(entry.successRate * 100)}%`;
      const ewma = entry.ewmaSuccess == null ? "n/a" : entry.ewmaSuccess.toFixed(2);
      const latency = entry.medianLatencyMs == null ? "n/a" : `${entry.medianLatencyMs}ms`;
      const lastFail = entry.lastFailAt ?? "never";
      out(
        ctx,
        `  ${label}: ${rate} of ${entry.samples} (ewma ${ewma}), p50 ${latency}, last fail ${lastFail}`,
      );
    }
    return 0;
  },
};