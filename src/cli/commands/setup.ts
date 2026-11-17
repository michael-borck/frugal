import { defaultPaths, type Paths } from "../../core/config.js";
import { RouterManager, type RouterLifecycle } from "../../core/routerManager.js";
import { detectLocalServers, type LocalProbe } from "../../core/local.js";
import {
  listRouterModels,
  providerPrefix,
  selectCandidates,
  suggestedCombo,
  verifyModels,
  type ProbeResult,
} from "../../core/verify.js";
import { makeObservation, recordObservation } from "../../core/reliability.js";
import { RouterSession, type SessionApi } from "../../core/sessionClient.js";
import { writePiConfig, PI_PROVIDER_ID } from "../../core/integrations/pi.js";
import { writeOpenCodeConfig } from "../../core/integrations/opencode.js";
import { mstyGuide } from "../../core/integrations/msty.js";
import type { IntegrationResult } from "../../core/integrations/base.js";
import { ROUTER_HOST, ROUTER_PORT } from "../../core/types.js";
import { type Command, type CommandContext, jsonOut, UsageError } from "../command.js";
import { DefaultPrompter, ReadlinePrompter, type Prompter } from "../prompt.js";

const PROBE_LIMIT = 10;

interface GuidedProvider {
  id: string;
  label: string;
  auth: "none" | "key" | "cloudflare";
  keyUrl?: string;
  note?: string;
}

const GUIDED_PROVIDERS: GuidedProvider[] = [
  { id: "opencode", label: "OpenCode Free", auth: "none", note: "no key needed" },
  {
    id: "openrouter",
    label: "OpenRouter",
    auth: "key",
    keyUrl: "https://openrouter.ai/settings/keys",
  },
  { id: "groq", label: "Groq", auth: "key", keyUrl: "https://console.groq.com/keys" },
  {
    id: "cloudflare-ai",
    label: "Cloudflare Workers AI",
    auth: "cloudflare",
    keyUrl: "https://dash.cloudflare.com/profile/api-tokens",
    note: "API token + Account ID",
  },
  { id: "kilo-gateway", label: "Kilo Gateway", auth: "key", note: "free models" },
  { id: "nvidia", label: "NVIDIA NIM", auth: "key", note: "free tier" },
  { id: "mistral", label: "Mistral", auth: "key", keyUrl: "https://console.mistral.ai" },
  {
    id: "gemini",
    label: "Google Gemini",
    auth: "key",
    keyUrl: "https://aistudio.google.com/apikey",
  },
];

export interface SetupDeps {
  prompter: Prompter;
  paths?: Paths;
  fetchImpl?: typeof fetch;
  routerManager?: RouterLifecycle;
  detectLocal?: (fetchImpl?: typeof fetch) => Promise<LocalProbe[]>;
  /** Injected for tests; otherwise a RouterSession is created after login. */
  session?: SessionApi;
  /** Skip all prompts; requires FRUGAL_ROUTER_PASSWORD or FRUGAL_ROUTER_KEY. */
  nonInteractive?: boolean;
  harness?: "pi" | "opencode" | "both" | "msty" | "none";
  verify?: boolean;
}

function routerBase(): string {
  return `http://${ROUTER_HOST}:${ROUTER_PORT}`;
}

async function addProviders(
  session: SessionApi,
  prompter: Prompter,
  say: (message: string) => void,
): Promise<void> {
  const added = new Set<string>();
  for (;;) {
    const choice = await prompter.select<string>(
      "Add a free provider to 9Router, or finish:",
      [
        ...GUIDED_PROVIDERS.map((provider) => ({
          label: `${provider.label}${added.has(provider.id) ? " (added)" : ""}${
            provider.note ? ` — ${provider.note}` : ""
          }`,
          value: provider.id,
        })),
        { label: "Done adding providers", value: "done" },
      ],
      "done",
    );
    if (choice === "done") return;

    const provider = GUIDED_PROVIDERS.find((entry) => entry.id === choice);
    if (!provider) continue;
    if (provider.keyUrl) say(`Get a key: ${provider.keyUrl}`);

    if (provider.auth === "none") {
      const result = await session.createProvider(provider.id, "no-auth");
      if (result.ok) {
        added.add(provider.id);
        say(`${provider.label} connected${result.already ? " (already)" : ""}.`);
      } else {
        say(`Could not connect ${provider.label}: ${result.detail}. Add it in the dashboard.`);
      }
      continue;
    }

    if (provider.auth === "cloudflare") {
      const token = (await prompter.secret("Cloudflare API token:")).trim();
      const accountId = (await prompter.text("Cloudflare Account ID:")).trim();
      if (!token || !accountId) {
        say("Skipped Cloudflare (needs both the API token and the Account ID).");
        continue;
      }
      const data = { accountId };
      const validation = await session.validateProvider(provider.id, token, data);
      if (!validation.ok) {
        say(`Cloudflare: ${validation.detail}`);
        continue;
      }
      const result = await session.createProvider(provider.id, token, data);
      if (result.ok) {
        added.add(provider.id);
        say(`Cloudflare connected${result.already ? " (already)" : ""}.`);
      } else {
        say(`Could not connect Cloudflare: ${result.detail}. Add it in the dashboard.`);
      }
      continue;
    }

    const key = (await prompter.secret(`${provider.label} API key:`)).trim();
    if (!key) {
      say("Skipped.");
      continue;
    }
    const validation = await session.validateProvider(provider.id, key);
    if (!validation.ok) {
      say(`${provider.label}: ${validation.detail}`);
      continue;
    }
    const result = await session.createProvider(provider.id, key);
    if (result.ok) {
      added.add(provider.id);
      say(`${provider.label} connected${result.already ? " (already)" : ""}.`);
    } else {
      say(`Could not connect ${provider.label}: ${result.detail}. Add it in the dashboard.`);
    }
  }
}

export async function runSetup(ctx: CommandContext, deps: SetupDeps): Promise<number> {
  const paths = deps.paths ?? ctx.paths ?? defaultPaths();
  const prompter = deps.prompter;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const detectLocal = deps.detectLocal ?? ((f) => detectLocalServers(f));
  const nonInteractive = deps.nonInteractive ?? false;
  const say = (message: string): void => {
    if (!ctx.json) prompter.info(message);
  };

  if (Number(process.versions.node.split(".")[0]) < 22) {
    say("Node 22 or newer is required. Install it from https://nodejs.org, then re-run frugal setup.");
    return 1;
  }

  say("frugal setup");
  say("");
  say(
    "Privacy: free endpoints often log prompts and may use them for training. Do not paste credentials, personal data or private school material.",
  );
  say("");

  if (deps.routerManager) {
    if (await deps.routerManager.isRunning()) {
      say(`9Router is running at ${routerBase()}.`);
    } else if (nonInteractive) {
      say("Starting 9Router (pinned)... this can take a minute.");
      const started = await deps.routerManager.start();
      say(started.detail);
      if (!started.started && !started.alreadyRunning) return 1;
    } else {
      const install = await prompter.confirm(
        "9Router is not running. Install and start the pinned version now?",
        true,
      );
      if (install) {
        say("Installing and starting 9Router (pinned). This can take a minute...");
        const started = await deps.routerManager.start();
        say(started.detail);
      } else {
        say("Start 9Router yourself, then re-run frugal setup.");
        return 1;
      }
    }
  }

  let session: SessionApi | undefined = deps.session;
  let key = (process.env.FRUGAL_ROUTER_KEY ?? "").trim();

  if (!session && !key) {
    const envPassword = (process.env.FRUGAL_ROUTER_PASSWORD ?? "").trim();
    if (!envPassword && nonInteractive) {
      say("Non-interactive setup needs FRUGAL_ROUTER_PASSWORD or FRUGAL_ROUTER_KEY.");
      return 1;
    }
    const password =
      envPassword ||
      (await prompter.secret("9Router dashboard password (Enter to skip session):")).trim();
    if (password) {
      const candidate = new RouterSession({ fetchImpl });
      try {
        const login = await candidate.login(password);
        if (login.ok) {
          session = candidate;
          say("Logged in to 9Router.");
        } else {
          say(`Could not log in (${login.detail}). Falling back to the browser/API-key path.`);
        }
      } catch (error) {
        say(`Could not log in: ${(error as Error).message}. Falling back to the browser/API-key path.`);
      }
    }
  }
  say("");

  if (session) {
    if (nonInteractive) {
      say("Skipping provider setup (non-interactive). Add providers in 9Router, then re-run.");
    } else {
      say("Add free providers now; keys go straight to 9Router, not frugal.");
      await addProviders(session, prompter, say);
    }
  } else {
    say("Connect free providers in 9Router (keys are stored in 9Router, not frugal):");
    for (const provider of GUIDED_PROVIDERS) {
      const link = provider.keyUrl ? ` — ${provider.keyUrl}` : "";
      say(`  - ${provider.label}${provider.note ? ` (${provider.note})` : ""}${link}`);
    }
    say(`  Dashboard: ${routerBase()}/dashboard → Providers`);
    if (!nonInteractive) {
      await prompter.confirm(
        "Have you connected at least one provider? (You can add more later)",
        true,
      );
    }
  }

  say("");
  say(
    "Paid plans (OpenCode Go, Z.ai, ClinePass): connect them in 9Router's dashboard and make your own budget-best combo. frugal stays free-only.",
  );
  say("");

  const local = await detectLocal(fetchImpl);
  if (local.length > 0) {
    say(`Local server detected: ${local.map((probe) => probe.engine).join(", ")}. It stays available to Pi.`);
  }

  let catalogSynced = false;
  if (session) {
    try {
      const sync = await session.catalogSync();
      catalogSynced = sync.ok;
      say(sync.ok ? "Refreshed 9Router's provider catalogs." : `Catalog sync failed: ${sync.detail}`);
    } catch (error) {
      say(`Catalog sync failed: ${(error as Error).message}`);
    }
    if (!key) {
      try {
        key = await session.getApiKey("frugal");
        say("Using a 9Router API key (reused or created).");
      } catch (error) {
        say(`Could not get an API key: ${(error as Error).message}`);
      }
    }
  }

  if (!key) {
    key = (await prompter.secret("9Router API key (from the dashboard):")).trim();
  }
  if (!key) {
    say("No 9Router credentials. Re-run with FRUGAL_ROUTER_PASSWORD or FRUGAL_ROUTER_KEY set.");
    return 1;
  }

  let ids: string[];
  try {
    ids = session ? await session.listModels() : [];
    if (ids.length === 0) ids = await listRouterModels({ apiKey: key, fetchImpl });
  } catch (error) {
    say(`Could not read models from 9Router: ${(error as Error).message}`);
    return 1;
  }
  const prefixes = [
    ...new Set(ids.filter((id) => id.includes("/")).map((id) => providerPrefix(id))),
  ].sort();
  say(`9Router advertises ${ids.length} models across: ${prefixes.join(", ") || "(none)"}.`);

  const shouldVerify =
    deps.verify ??
    (nonInteractive
      ? false
      : await prompter.confirm(
          `Verify a spread of models now? (up to ${PROBE_LIMIT} tiny requests)`,
          !ctx.json && Boolean(process.stdin.isTTY),
        ));
  let results: ProbeResult[] = [];
  if (shouldVerify) {
    const candidates = selectCandidates(ids, PROBE_LIMIT);
    say(`Probing ${candidates.length} models...`);
    results = await verifyModels(candidates, { apiKey: key, fetchImpl });
    for (const result of results) {
      await recordObservation(
        paths,
        makeObservation({
          provider: providerPrefix(result.id),
          model: result.id,
          kind: "probe",
          ok: result.ok,
          status: result.status ?? undefined,
          latencyMs: result.latencyMs ?? undefined,
          error: result.error ?? undefined,
        }),
      );
    }
    const ok = results.filter((result) => result.ok).length;
    say(`${ok} answered, ${results.length - ok} failed.`);
  }
  const combo = suggestedCombo(results, 10);

  let comboApplied = false;
  if (combo.length > 0 && session) {
    try {
      const upserted = await session.upsertCombo("free-best", combo);
      const strategy = await session.ensureFallbackStrategy("free-best");
      comboApplied = true;
      say("");
      say(
        `Updated free-best (${upserted.created ? "created" : "updated"}) with ${combo.length} models${
          strategy ? ", Strategy: Fallback" : ""
        }.`,
      );
    } catch (error) {
      say(`Could not write the combo: ${(error as Error).message}`);
    }
  }

  if (combo.length > 0) {
    say("");
    say("free-best order:");
    combo.forEach((id, index) => say(`  ${index + 1}. ${id}`));
    if (!comboApplied) {
      say(
        "Paste this into 9Router → Combos → free-best, Strategy: Fallback. (Log in at setup to apply it automatically.)",
      );
    }
  } else {
    say("No models verified yet. Connect providers, then run frugal verify to build the order.");
  }

  const harness =
    deps.harness ??
    (nonInteractive
      ? "pi"
      : await prompter.select<"pi" | "opencode" | "both" | "msty">(
          "Which harness should frugal configure?",
          [
            { label: "Pi (recommended for older laptops)", value: "pi" },
            { label: "OpenCode", value: "opencode" },
            { label: "Both", value: "both" },
            { label: "Msty guide only", value: "msty" },
          ],
          "pi",
        ));

  const applied: IntegrationResult[] = [];
  const baseUrl = `${routerBase()}/v1`;
  if (harness === "pi" || harness === "both") {
    applied.push(
      await writePiConfig({ baseUrl, apiKey: key, model: "free-best", models: combo }),
    );
  }
  if (harness === "opencode" || harness === "both") {
    applied.push(await writeOpenCodeConfig({ baseUrl, apiKey: key, model: "free-best" }));
  }

  say("");
  for (const entry of applied) say(`[wired] ${entry.name}: ${entry.detail}`);
  const msty = mstyGuide({ baseUrl, apiKey: key, model: "free-best" });
  if (harness === "msty" || harness === "both") {
    say("");
    say("Msty: paste these into Settings → Remote Providers (OpenAI-compatible):");
    for (const step of msty.steps) say(`  ${step}`);
  } else if (harness !== "none") {
    say(`Msty (optional): base ${msty.baseUrl}, model ${msty.model}, key from the 9Router dashboard.`);
  }

  say("");
  if (harness === "pi" || harness === "both") {
    say(`Restart Pi, then: pi --provider ${PI_PROVIDER_ID} --model free-best`);
    say("Your existing Ollama and shared-server providers are left untouched.");
  }
  if (harness === "opencode" || harness === "both") {
    say("Restart OpenCode and choose Router9 (local) → free-best.");
  }
  say("Next: frugal verify to refresh, or frugal status.");

  jsonOut(ctx, {
    router: routerBase(),
    session: session != null,
    catalog_synced: catalogSynced,
    combo_applied: comboApplied,
    providers: prefixes,
    models: ids.length,
    verified: results.filter((result) => result.ok).map((result) => result.id),
    suggested_combo: combo,
    harness,
    integrations: applied.map((entry) => ({ name: entry.name, detail: entry.detail })),
  });
  return 0;
}

interface SetupFlags {
  yes: boolean;
  verify: boolean;
  harness?: "pi" | "opencode" | "both" | "msty" | "none";
}

function parseSetupFlags(args: string[]): SetupFlags {
  const flags: SetupFlags = { yes: false, verify: false };
  const harnesses = new Set(["pi", "opencode", "both", "msty", "none"]);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--yes" || arg === "-y") {
      flags.yes = true;
      continue;
    }
    if (arg === "--verify") {
      flags.verify = true;
      continue;
    }
    if (arg === "--harness") {
      const value = args[++index];
      if (!value || !harnesses.has(value)) {
        throw new UsageError("--harness needs pi|opencode|both|msty|none");
      }
      flags.harness = value as SetupFlags["harness"];
      continue;
    }
    if (arg.startsWith("--harness=")) {
      const value = arg.slice("--harness=".length);
      if (!harnesses.has(value)) {
        throw new UsageError("--harness needs pi|opencode|both|msty|none");
      }
      flags.harness = value as SetupFlags["harness"];
      continue;
    }
    throw new UsageError(`unexpected argument: ${arg}`);
  }
  return flags;
}

export const setupCommand: Command = {
  name: "setup",
  summary: "Opinionated 9Router setup: connect providers, verify models, wire a harness.",
  group: "Everyday",
  async run(ctx: CommandContext, args: string[]) {
    const flags = parseSetupFlags(args);
    const nonInteractive = flags.yes || ctx.json || !process.stdin.isTTY;
    const prompter: Prompter = nonInteractive ? new DefaultPrompter() : new ReadlinePrompter();
    const deps: SetupDeps = {
      prompter,
      nonInteractive,
      harness: flags.harness,
      verify: flags.verify,
    };
    if (!ctx.json) {
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