import { type Command, type CommandContext, jsonOut, out } from "../command.js";

/**
 * 9Router owns combos and applies the fallback. frugal cannot rewrite them with
 * the API key (its /api needs a dashboard session), so refresh points the user
 * at verify plus the combo editor rather than pretending to register a combo.
 */
export const refreshCommand: Command = {
  name: "refresh",
  summary: "Show how to refresh the combo: run frugal verify, then update free-best in 9Router.",
  group: "Everyday",
  async run(ctx: CommandContext, _args: string[]) {
    const note =
      "9Router owns combos. Run 'frugal verify' to re-probe models and print an updated order, then edit free-best in 9Router (Strategy: Fallback).";
    jsonOut(ctx, { refreshed: false, next: "frugal verify", note });
    if (!ctx.json) out(ctx, note);
    return 0;
  },
};