import { defaultPaths, loadUserConfig, saveUserConfig, configExists } from "../../core/config.js";
import { HttpRouterClient } from "../../core/routerClient.js";
import { HttpRankingSource } from "../../core/rankingSource.js";
import { composeAndRegister, stateFromCombos } from "../../core/compose.js";
import { recommendedContextLimit } from "../../core/combos.js";
import { applyIntegrations } from "../../core/integrations/index.js";
import { ROUTER_HOST, ROUTER_PORT } from "../../core/types.js";
import { loadState, saveState } from "../../core/config.js";
import { type Command, type CommandContext, out } from "../command.js";

const DEFAULT_RESULTS_URL =
  process.env.FRUGAL_RESULTS_URL ?? "https://example.invalid/frugal/results.json";
const DEFAULT_PICKS_URL =
  process.env.FRUGAL_PICKS_URL ?? "https://example.invalid/frugal/picks.json";

export const setupCommand: Command = {
  name: "setup",
  summary: "First-time wizard: configure 9Router combos and wire the student's tools. Safe to re-run.",
  group: "Everyday",
  async run(ctx: CommandContext, _args: string[]) {
    const paths = defaultPaths();
    const existing = await configExists(paths);
    const user = await loadUserConfig(paths);

    out(ctx, "frugal setup");
    out(ctx, "");

    if (Number(process.versions.node.split(".")[0]) < 22) {
      out(ctx, "Node 22 or newer is required. Install it from https://nodejs.org, then re-run frugal setup.");
      return 1;
    }

    if (existing) {
      out(ctx, "Existing configuration found; it will be kept and extended (setup is safe to re-run).");
    }

    out(ctx, "");
    out(ctx, "Privacy: free endpoints often log prompts and may use them for training. Do not paste credentials, personal data or private school material.");
    out(ctx, "");
    out(ctx, "The interactive prompts (OpenRouter key, Groq signup, tier, local model) are not wired yet in this scaffold.");

    const router = new HttpRouterClient();
    const routerUp = await router.health();
    out(ctx, `9Router: ${routerUp ? `reachable at ${ROUTER_HOST}:${ROUTER_PORT}` : `not reachable at ${ROUTER_HOST}:${ROUTER_PORT}`}`);

    let contextLimit: number | undefined;

    if (routerUp) {
      const source = new HttpRankingSource({
        resultsUrl: user.resultsUrl ?? DEFAULT_RESULTS_URL,
        picksUrl: user.picksUrl ?? DEFAULT_PICKS_URL,
      });
      const composed = await composeAndRegister(user, source, router);
      if (composed.registered) {
        const state = await loadState(paths);
        await saveState(paths, stateFromCombos(state, composed.combos, []));
        for (const combo of composed.combos) {
          out(ctx, `Combo ${combo.name}: ${combo.entries.length} models`);
        }
        const free = composed.combos.find((c) => c.name === "free-best") ?? composed.combos[0];
        if (free) contextLimit = recommendedContextLimit(free);
      } else {
        out(ctx, "Could not build combos yet (candidate fetch/registration is a spike item).");
        if (composed.registrationError) out(ctx, `  ${composed.registrationError}`);
      }
    }

    if (contextLimit == null) {
      const state = await loadState(paths);
      if (state.lastGoodCombo) contextLimit = recommendedContextLimit(state.lastGoodCombo);
    }

    const applied = await applyIntegrations({
      apiKey: "frugal-local",
      model: "free-best",
      contextLimit,
    });
    out(ctx, "");
    if (contextLimit != null) {
      out(ctx, `Declaring a ${contextLimit}-token context window for free-best so compaction fires early enough.`);
    }
    for (const result of applied) {
      out(ctx, `[${result.changed ? "wired" : "guide"}] ${result.name}: ${result.detail}`);
    }

    await saveUserConfig(paths, user);
    out(ctx, "");
    out(ctx, "Next: run frugal doctor to see what remains.");
    return 0;
  },
};