import { buildCombos, allSnapshots } from "./combos.js";
import type { ComboSnapshot, MergeInput, RuntimeState } from "./types.js";
import type { RouterClient } from "./routerClient.js";
import type { RankingSource } from "./rankingSource.js";

export interface ComposeResult {
  combos: ComboSnapshot[];
  dropped: Array<{ id: string; reason: string }>;
  registered: boolean;
  registrationError?: string;
}

/**
 * The core of frugal as a configurator:
 *   candidates + results + picks + user  ->  ranked combos  ->  9Router control API.
 *
 * If registration fails, the last good combo in state is left untouched; the
 * caller decides whether to keep it. frugal never forwards a request.
 */
export async function composeAndRegister(
  user: MergeInput["user"],
  source: RankingSource,
  router: RouterClient,
  reliability?: Map<string, number>,
): Promise<ComposeResult> {
  let candidates: MergeInput["candidates"];
  let results: MergeInput["results"];
  let picks: MergeInput["picks"];
  try {
    [candidates, results, picks] = await Promise.all([
      source.candidates(),
      source.results(),
      source.picks(),
    ]);
  } catch (error) {
    // Fail safe: do not touch the good combo when an input is unreachable.
    return {
      combos: [],
      dropped: [],
      registered: false,
      registrationError: (error as Error).message,
    };
  }

  if (candidates.length === 0) {
    return {
      combos: [],
      dropped: [],
      registered: false,
      registrationError: "no free model candidates found; kept the last good combo",
    };
  }

  const built = buildCombos({ candidates, results, picks, user, reliability });
  const combos = allSnapshots(built);

  let registered = false;
  let registrationError: string | undefined;
  try {
    for (const combo of combos) {
      await router.upsertCombo({ name: combo.name, models: combo.entries.map((e) => e.id) });
    }
    registered = true;
  } catch (error) {
    registrationError = (error as Error).message;
  }

  return { combos, dropped: built.dropped, registered, registrationError };
}

export function stateFromCombos(
  previous: RuntimeState,
  combos: ComboSnapshot[],
  freeModelList: string[],
): RuntimeState {
  const free = combos.find((c) => c.name === "free-best") ?? combos[0] ?? null;
  return {
    ...previous,
    lastGoodCombo: free,
    lastRefreshAt: new Date().toISOString(),
    lastFreeModelList: freeModelList,
  };
}