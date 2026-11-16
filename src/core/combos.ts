import {
  COMBO_MAX_ENTRIES,
  FREE_COMBO_NAME,
  BUDGET_COMBO_NAME,
  type ComboEntry,
  type ComboSnapshot,
  type MergeInput,
  type MergeResult,
} from "./types.js";
import { mergeCandidates, toComboEntries } from "./ranking.js";

export interface BuiltCombos {
  free: ComboSnapshot;
  budget: ComboSnapshot | null;
  dropped: MergeResult["dropped"];
}

function snapshot(name: string, entries: ComboEntry[]): ComboSnapshot {
  return {
    name,
    generatedAt: new Date().toISOString(),
    entries: entries.slice(0, COMBO_MAX_ENTRIES),
  };
}

/**
 * Build the combos frugal writes to 9Router.
 *
 * The free tier gets one combo (free-best). The budget tier gets budget-best
 * (paid models first, then free overflow) plus a free-best for when the plan's
 * limit is reached. frugal never routes requests; it only produces these lists.
 */
export function buildCombos(input: MergeInput): BuiltCombos {
  const freeMerge = mergeCandidates({ ...input, user: { ...input.user, tier: "free" } });
  const free = snapshot(FREE_COMBO_NAME, toComboEntries(freeMerge.ordered, "free"));

  let budget: ComboSnapshot | null = null;
  let dropped = freeMerge.dropped;

  if (input.user.tier === "budget") {
    const budgetMerge = mergeCandidates(input);
    budget = snapshot(BUDGET_COMBO_NAME, toComboEntries(budgetMerge.ordered, "budget"));
    dropped = budgetMerge.dropped;
  }

  return { free, budget, dropped };
}

export function allSnapshots(built: BuiltCombos): ComboSnapshot[] {
  return built.budget ? [built.budget, built.free] : [built.free];
}