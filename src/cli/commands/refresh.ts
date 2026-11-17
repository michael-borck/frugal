import { defaultPaths, loadState, loadUserConfig, saveState } from "../../core/config.js";
import { HttpRouterClient } from "../../core/routerClient.js";
import { HttpRankingSource } from "../../core/rankingSource.js";
import { composeAndRegister, stateFromCombos } from "../../core/compose.js";
import { type Command, type CommandContext, jsonOut, out } from "../command.js";

const DEFAULT_RESULTS_URL = process.env.FRUGAL_RESULTS_URL;
const DEFAULT_PICKS_URL = process.env.FRUGAL_PICKS_URL;
const DEFAULT_USAGE_URL = process.env.FRUGAL_USAGE_URL;

export const refreshCommand: Command = {
  name: "refresh",
  summary: "Rebuild the combos now from the latest rankings and picks, and register them with 9Router.",
  group: "Everyday",
  async run(ctx: CommandContext, _args: string[]) {
    const paths = defaultPaths();
    const [user, state] = await Promise.all([loadUserConfig(paths), loadState(paths)]);

    const source = new HttpRankingSource({
      resultsUrl: user.resultsUrl ?? DEFAULT_RESULTS_URL,
      picksUrl: user.picksUrl ?? DEFAULT_PICKS_URL,
      usageUrl: user.usageUrl ?? DEFAULT_USAGE_URL,
    });
    const router = new HttpRouterClient();

    if (!(await router.health())) {
      const report = { refreshed: false, reason: "router-unreachable" };
      jsonOut(ctx, report);
      if (!ctx.json) out(ctx, "9Router is not reachable. Run frugal start, then frugal refresh.");
      return 1;
    }

    const result = await composeAndRegister(user, source, router);

    if (result.registered) {
      const nextState = stateFromCombos(
        state,
        result.combos,
        result.combos.flatMap((c) => c.entries.map((e) => e.id)),
      );
      await saveState(paths, nextState);
    }

    const report = {
      refreshed: result.registered,
      registered: result.registered,
      combos: result.combos.map((c) => ({ name: c.name, entries: c.entries.length })),
      dropped: result.dropped,
      registration_error: result.registrationError ?? null,
      kept_last_good: !result.registered && state.lastGoodCombo != null,
    };
    jsonOut(ctx, report);
    if (!ctx.json) {
      if (result.registered) {
        for (const combo of result.combos) {
          out(ctx, `${combo.name}: ${combo.entries.length} models`);
        }
      } else {
        out(ctx, "Refresh failed to register combos with 9Router.");
        if (result.registrationError) out(ctx, `  ${result.registrationError}`);
        if (state.lastGoodCombo) out(ctx, "Kept the last good combo.");
      }
    }
    return result.registered ? 0 : 1;
  },
};