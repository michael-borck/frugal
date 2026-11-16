import { defaultPaths, loadState, loadUserConfig } from "../../core/config.js";
import { COMBO_STALE_HOURS } from "../../core/types.js";
import { type Command, type CommandContext, jsonOut, out } from "../command.js";

function hoursSince(iso: string | null): number | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  return (Date.now() - then) / 3_600_000;
}

export const statusCommand: Command = {
  name: "status",
  summary: "Show mode, combo order, active model, cooldowns, quota and a next step.",
  group: "Everyday",
  async run(_ctx: CommandContext, _args: string[]) {
    const paths = defaultPaths();
    const [user, state] = await Promise.all([loadUserConfig(paths), loadState(paths)]);
    const comboAge = hoursSince(state.lastRefreshAt);
    const stale = comboAge == null || comboAge > COMBO_STALE_HOURS;
    const cooldowns = Object.entries(state.cooldowns).filter(
      ([, until]) => Date.parse(until) > Date.now(),
    );

    const report = {
      tier: user.tier,
      local_mode: user.localMode,
      combo: state.lastGoodCombo?.name ?? null,
      combo_entries: state.lastGoodCombo?.entries.length ?? 0,
      combo_age_hours: comboAge == null ? null : Math.round(comboAge * 10) / 10,
      combo_stale: stale,
      cooldowns: cooldowns.map(([id, until]) => ({ id, until })),
      enabled_providers: user.enabledProviders,
      next_step: stale
        ? "frugal refresh"
        : "frugal doctor",
    };

    jsonOut(_ctx, report);
    if (!_ctx.json) {
      out(_ctx, `Tier: ${report.tier} · Local mode: ${report.local_mode}`);
      out(
        _ctx,
        `Combo: ${report.combo ?? "(none)"} · ${report.combo_entries} models · ${
          comboAge == null ? "never refreshed" : `${report.combo_age_hours}h ago`
        }`,
      );
      if (report.cooldowns.length > 0) {
        out(_ctx, `Cooling down: ${report.cooldowns.map((c) => c.id).join(", ")}`);
      }
      out(_ctx, report.next_step);
    }
    return 0;
  },
};