import { defaultPaths, loadState, loadUserConfig } from "../../core/config.js";
import { COMBO_STALE_HOURS, combosForTier } from "../../core/types.js";
import { HttpRouterClient } from "../../core/routerClient.js";
import { type Command, type CommandContext, jsonOut, out } from "../command.js";

function hoursSince(iso: string | null): number | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  return (Date.now() - then) / 3_600_000;
}

export const statusCommand: Command = {
  name: "status",
  summary: "Show tier, configured combos and a next step (frugal configures; 9Router routes).",
  group: "Everyday",
  async run(ctx: CommandContext, _args: string[]) {
    const paths = defaultPaths();
    const [user, state] = await Promise.all([loadUserConfig(paths), loadState(paths)]);
    const comboAge = hoursSince(state.lastRefreshAt);
    const stale = comboAge == null || comboAge > COMBO_STALE_HOURS;
    const router = new HttpRouterClient();
    const routerUp = await router.health();

    const report = {
      tier: user.tier,
      local_mode: user.localMode,
      combos: combosForTier(user.tier),
      last_built: state.lastGoodCombo?.name ?? null,
      last_built_entries: state.lastGoodCombo?.entries.length ?? 0,
      last_built_at: state.lastRefreshAt,
      combo_age_hours: comboAge == null ? null : Math.round(comboAge * 10) / 10,
      combo_stale: stale,
      router: routerUp ? "reachable" : "unreachable",
      enabled_providers: user.enabledProviders,
      next_step: !routerUp ? "frugal start" : stale ? "frugal refresh" : "frugal doctor",
    };

    jsonOut(ctx, report);
    if (!ctx.json) {
      out(ctx, `Tier: ${report.tier} · Local mode: ${report.local_mode}`);
      out(ctx, `Combos: ${report.combos.join(", ")}`);
      out(
        ctx,
        `Last built: ${report.last_built ?? "(none)"} · ${report.last_built_entries} models · ${
          comboAge == null ? "never" : `${report.combo_age_hours}h ago`
        }`,
      );
      out(ctx, `9Router: ${report.router}`);
      out(ctx, report.next_step);
    }
    return 0;
  },
};