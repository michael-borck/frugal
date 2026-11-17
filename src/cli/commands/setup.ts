import {
  configExists,
  defaultPaths,
  loadState,
  loadUserConfig,
  saveState,
  saveUserConfig,
  type Paths,
} from "../../core/config.js";
import { HttpRouterClient, type RouterClient } from "../../core/routerClient.js";
import { HttpRankingSource, type RankingSource } from "../../core/rankingSource.js";
import { RouterManager, type RouterLifecycle } from "../../core/routerManager.js";
import { composeAndRegister, stateFromCombos } from "../../core/compose.js";
import { loadReliability, reliabilityMap } from "../../core/reliability.js";
import { DEFAULT_CATALOG_URL } from "../../core/catalog.js";
import { recommendedContextLimit } from "../../core/combos.js";
import { applyIntegrations, type ApplyOptions } from "../../core/integrations/index.js";
import type { IntegrationResult } from "../../core/integrations/base.js";
import { detectLocalServers, type LocalProbe } from "../../core/local.js";
import { validateProviderKey } from "../../core/validateKey.js";
import { setProviderKey } from "../../core/secrets.js";
import {
  DEFAULT_MAX_MONTHLY_USD,
  ROUTER_HOST,
  ROUTER_PORT,
  type LocalMode,
  type ProviderId,
  type Tier,
  type UserConfig,
} from "../../core/types.js";
import { type Command, type CommandContext, jsonOut } from "../command.js";
import { DefaultPrompter, ReadlinePrompter, type Prompter } from "../prompt.js";

const DEFAULT_RESULTS_URL = process.env.FRUGAL_RESULTS_URL;
const DEFAULT_PICKS_URL = process.env.FRUGAL_PICKS_URL;
const DEFAULT_USAGE_URL = process.env.FRUGAL_USAGE_URL;

export interface SetupDeps {
  prompter: Prompter;
  paths?: Paths;
  fetchImpl?: typeof fetch;
  router?: RouterClient;
  source?: RankingSource;
  applyFiles?: (options: ApplyOptions) => Promise<IntegrationResult[]>;
  detectLocal?: (fetchImpl?: typeof fetch) => Promise<LocalProbe[]>;
  /** When present, setup may install and start 9Router if it is not running. */
  routerManager?: RouterLifecycle;
}

export async function runSetup(ctx: CommandContext, deps: SetupDeps): Promise<number> {
  const paths = deps.paths ?? ctx.paths ?? defaultPaths();
  const prompter = deps.prompter;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const detectLocal = deps.detectLocal ?? ((f) => detectLocalServers(f));
  const applyFiles = deps.applyFiles ?? applyIntegrations;

  const say = (message: string): void => {
    if (!ctx.json) prompter.info(message);
  };

  const user = await loadUserConfig(paths);
  const existed = await configExists(paths);

  if (Number(process.versions.node.split(".")[0]) < 22) {
    say("Node 22 or newer is required. Install it from https://nodejs.org, then re-run frugal setup.");
    return 1;
  }

  say("frugal setup");
  say("");
  if (existed) say("Existing configuration found; it will be kept and extended (setup is safe to re-run).");
  say(
    "Privacy: free endpoints often log prompts and may use them for training. Do not paste credentials, personal data or private school material.",
  );
  say("");

  const tier = await prompter.select<Tier>(
    "Which tier do you want?",
    [
      { label: "free — free providers only ($0)", value: "free" },
      { label: "budget — free plus one paid plan under a cap", value: "budget" },
    ],
    user.tier,
  );

  let maxMonthlyUsd = user.maxMonthlyUsd;
  if (tier === "budget") {
    const raw = await prompter.text(`Monthly cap in USD (ceiling ${DEFAULT_MAX_MONTHLY_USD})`, {
      default: String(user.maxMonthlyUsd),
      validate: (value) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed < 0) return "Enter a number.";
        if (parsed > DEFAULT_MAX_MONTHLY_USD) return `The instructor's ceiling is $${DEFAULT_MAX_MONTHLY_USD}.`;
        return null;
      },
    });
    maxMonthlyUsd = Number(raw);
  }

  const local = await detectLocal(fetchImpl);
  let localMode: LocalMode = user.localMode;
  if (local.length > 0) {
    say(`Local model server detected: ${local.map((probe) => probe.engine).join(", ")}.`);
    localMode = await prompter.select<LocalMode>(
      "How should local models combine with cloud?",
      [
        { label: "fallback — cloud first, local last (recommended)", value: "fallback" },
        { label: "first — local primary, cloud overflow", value: "first" },
        { label: "only — never leave this machine", value: "only" },
      ],
      user.localMode,
    );
  } else {
    say("No local model server detected (optional; install Ollama or llama.cpp to add one later).");
    localMode = "fallback";
  }

  const enabled = new Set<ProviderId>(user.enabledProviders);
  enabled.add("opencode-free");
  if (local.length > 0) enabled.add("local");

  const openrouterKey = (await prompter.secret("OpenRouter API key (Enter to skip):")).trim();
  if (openrouterKey) {
    const result = await validateProviderKey("openrouter", openrouterKey, fetchImpl);
    if (result.ok) {
      await setProviderKey(paths, "openrouter", openrouterKey);
      enabled.add("openrouter");
      say("OpenRouter key accepted.");
    } else {
      say(`${result.detail}. Add it later with: frugal add openrouter`);
    }
  } else {
    say("Skipped OpenRouter. Add it later with: frugal add openrouter");
  }

  const groqKey = (await prompter.secret("Groq API key (optional, Enter to skip):")).trim();
  if (groqKey) {
    const result = await validateProviderKey("groq", groqKey, fetchImpl);
    if (result.ok) {
      await setProviderKey(paths, "groq", groqKey);
      enabled.add("groq");
      say("Groq key accepted.");
    } else {
      say(`${result.detail}. Add it later with: frugal add groq`);
    }
  }

  const nextUser: UserConfig = {
    ...user,
    tier,
    maxMonthlyUsd,
    localMode,
    enabledProviders: [...enabled],
  };
  await saveUserConfig(paths, nextUser);

  const rankingsConfigured = Boolean(nextUser.resultsUrl ?? DEFAULT_RESULTS_URL);
  if (!rankingsConfigured) {
    say("No hosted ranking files configured yet; ranking falls back to usage and name order.");
    say("Set them with: frugal rankings --results <url> --picks <url> --usage <url>");
  }

  const router = deps.router ?? new HttpRouterClient();
  let routerUp = await router.health();

  if (!routerUp && deps.routerManager) {
    const wants = await prompter.confirm(
      "9Router is not running. Install and start the pinned version now?",
      true,
    );
    if (wants) {
      say("Installing and starting 9Router (pinned). This can take a minute...");
      const start = await deps.routerManager.start();
      routerUp = await router.health();
      say(start.detail);
      if (!routerUp) {
        say("9Router is still not reachable. Check the router log, then run frugal start.");
      }
    }
  }

  say(
    `9Router: ${
      routerUp
        ? `reachable at ${ROUTER_HOST}:${ROUTER_PORT}`
        : "not running yet; run frugal start, then frugal refresh"
    }`,
  );

  let contextLimit: number | undefined;
  let comboSummary: Array<{ name: string; entries: number }> = [];

  if (routerUp) {
    const source =
      deps.source ??
      new HttpRankingSource({
        resultsUrl: nextUser.resultsUrl ?? DEFAULT_RESULTS_URL,
        picksUrl: nextUser.picksUrl ?? DEFAULT_PICKS_URL,
        usageUrl: nextUser.usageUrl ?? DEFAULT_USAGE_URL,
        catalogUrl: nextUser.catalogUrl ?? process.env.FRUGAL_CATALOG_URL ?? DEFAULT_CATALOG_URL,
      });
    const composed = await composeAndRegister(
      nextUser,
      source,
      router,
      reliabilityMap(await loadReliability(paths)),
    );
    if (composed.registered) {
      const state = await loadState(paths);
      await saveState(paths, stateFromCombos(state, composed.combos, []));
      comboSummary = composed.combos.map((combo) => ({
        name: combo.name,
        entries: combo.entries.length,
      }));
      for (const combo of comboSummary) say(`Combo ${combo.name}: ${combo.entries} models`);
      const free = composed.combos.find((c) => c.name === "free-best") ?? composed.combos[0];
      if (free) contextLimit = recommendedContextLimit(free);
    } else {
      say(
        `Could not build combos: ${composed.registrationError ?? "unknown error"}. Keeping the last good combo.`,
      );
    }
  } else {
    const state = await loadState(paths);
    if (state.lastGoodCombo) contextLimit = recommendedContextLimit(state.lastGoodCombo);
  }

  const applied = await applyFiles({ apiKey: "frugal-local", model: "free-best", contextLimit });
  if (contextLimit != null) {
    say(`Declaring a ${contextLimit}-token context window for free-best so compaction fires early enough.`);
  }
  for (const result of applied) {
    say(`[${result.changed ? "wired" : "guide"}] ${result.name}: ${result.detail}`);
  }

  jsonOut(ctx, {
    tier,
    max_monthly_usd: maxMonthlyUsd,
    local_mode: localMode,
    enabled_providers: [...enabled],
    router: routerUp ? "reachable" : "unreachable",
    combos: comboSummary,
    context_limit: contextLimit ?? null,
    integrations: applied.map((result) => ({
      name: result.name,
      changed: result.changed,
      detail: result.detail,
    })),
  });

  say("");
  say("Next: run frugal doctor to confirm everything works.");
  return 0;
}

export const setupCommand: Command = {
  name: "setup",
  summary: "First-time wizard: tier, providers, local model, combos and tool wiring. Safe to re-run.",
  group: "Everyday",
  async run(ctx: CommandContext, _args: string[]) {
    const nonInteractive = ctx.json || !process.stdin.isTTY;
    const prompter: Prompter = nonInteractive ? new DefaultPrompter() : new ReadlinePrompter();
    const deps: SetupDeps = { prompter };
    if (!nonInteractive) {
      deps.routerManager = new RouterManager({ configDir: ctx.paths.configDir });
    }
    try {
      return await runSetup(ctx, deps);
    } catch (error) {
      if ((error as Error).message === "cancelled") {
        process.stderr.write("Setup cancelled.\n");
        return 1;
      }
      throw error;
    } finally {
      prompter.close();
    }
  },
};