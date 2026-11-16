import { defaultPaths, loadState, saveState } from "../../core/config.js";
import { type Command, type CommandContext, jsonOut, out } from "../command.js";

export const refreshCommand: Command = {
  name: "refresh",
  summary: "Rebuild the combos now from the latest rankings and picks.",
  group: "Everyday",
  async run(ctx: CommandContext, _args: string[]) {
    const paths = defaultPaths();
    const state = await loadState(paths);
    const now = new Date().toISOString();

    const report = {
      refreshed: true,
      at: now,
      combo: state.lastGoodCombo?.name ?? null,
      entries: state.lastGoodCombo?.entries.length ?? 0,
      note: "Candidate fetch and 9Router registration are not wired yet (spike item).",
    };
    jsonOut(ctx, report);
    if (!ctx.json) {
      out(ctx, `Refresh marked at ${now}.`);
      out(ctx, report.note);
    }

    state.lastRefreshAt = now;
    await saveState(paths, state);
    return 0;
  },
};