import {
  defaultPaths,
  loadUserConfig,
  saveUserConfig,
  type Paths,
} from "../../core/config.js";
import { isProviderId, providerIds, providerInfo } from "../../core/providers.js";
import { removeProviderKey, setProviderKey } from "../../core/secrets.js";
import { isValidatableProvider, validateProviderKey } from "../../core/validateKey.js";
import { makeObservation, recordObservation } from "../../core/reliability.js";
import type { ProviderId, UserConfig } from "../../core/types.js";
import { type Command, type CommandContext, jsonOut, out, UsageError } from "../command.js";
import { DefaultPrompter, ReadlinePrompter, type Prompter } from "../prompt.js";

export interface ProviderCommandDeps {
  prompter: Prompter;
  paths?: Paths;
  fetchImpl?: typeof fetch;
  /** Key supplied non-interactively (FRUGAL_PROVIDER_KEY). */
  envKey?: string;
}

function enable(user: UserConfig, id: ProviderId): void {
  if (!user.enabledProviders.includes(id)) {
    user.enabledProviders = [...user.enabledProviders, id];
  }
}

export async function runAdd(
  ctx: CommandContext,
  providerName: string,
  deps: ProviderCommandDeps,
): Promise<number> {
  const paths = deps.paths ?? ctx.paths ?? defaultPaths();
  const say = (message: string): void => {
    if (!ctx.json) out(ctx, message);
  };

  const info = providerInfo(providerName);
  if (!info || !isProviderId(providerName)) {
    say(`Unknown provider: ${providerName}`);
    say(`Known providers: ${providerIds().join(", ")}`);
    jsonOut(ctx, { provider: providerName, ok: false, error: "unknown-provider" });
    return 2;
  }

  const user = await loadUserConfig(paths);

  if (info.auth === "none") {
    enable(user, info.id);
    await saveUserConfig(paths, user);
    say(`${info.label} enabled (no key needed).`);
    jsonOut(ctx, { provider: info.id, ok: true, enabled: user.enabledProviders });
    return 0;
  }

  if (info.auth === "oauth") {
    say(`${info.label} uses guided OAuth, which is not wired yet. See the provider's own instructions.`);
    jsonOut(ctx, { provider: info.id, ok: false, error: "oauth-not-wired" });
    return 1;
  }

  const prompted = (await deps.prompter.secret(`${info.label} API key:`)).trim();
  const key = (prompted || (deps.envKey ?? process.env.FRUGAL_PROVIDER_KEY ?? "")).trim();
  if (!key) {
    say("No key provided.");
    say(`In a terminal, run: frugal add ${info.id}`);
    say("Or set FRUGAL_PROVIDER_KEY for non-interactive use.");
    jsonOut(ctx, { provider: info.id, ok: false, error: "missing-key" });
    return 1;
  }

  if (info.validatable && isValidatableProvider(info.id)) {
    const result = await validateProviderKey(info.id, key, deps.fetchImpl ?? fetch);
    await recordObservation(
      paths,
      makeObservation({
        provider: info.id,
        kind: "key",
        ok: result.ok,
        error: result.ok ? undefined : result.detail,
      }),
    );
    if (!result.ok) {
      say(`${result.detail}. The key was not stored.`);
      jsonOut(ctx, { provider: info.id, ok: false, error: "invalid-key", detail: result.detail });
      return 1;
    }
    say(`${info.label} key accepted.`);
  } else {
    say(`${info.label} key stored (not validated yet for this provider).`);
  }

  await setProviderKey(paths, info.id, key);
  enable(user, info.id);
  await saveUserConfig(paths, user);

  say(`${info.label} added. Run frugal refresh to rebuild the combo.`);
  jsonOut(ctx, { provider: info.id, ok: true, enabled: user.enabledProviders });
  return 0;
}

export async function runRemove(
  ctx: CommandContext,
  providerName: string,
  pathsInput?: Paths,
): Promise<number> {
  const paths = pathsInput ?? ctx.paths ?? defaultPaths();
  const say = (message: string): void => {
    if (!ctx.json) out(ctx, message);
  };

  if (!isProviderId(providerName)) {
    say(`Unknown provider: ${providerName}`);
    jsonOut(ctx, { provider: providerName, ok: false, error: "unknown-provider" });
    return 2;
  }

  const user = await loadUserConfig(paths);
  const wasEnabled = user.enabledProviders.includes(providerName);
  user.enabledProviders = user.enabledProviders.filter((id) => id !== providerName);
  await saveUserConfig(paths, user);
  const keyRemoved = await removeProviderKey(paths, providerName);

  if (!wasEnabled && !keyRemoved) {
    say(`${providerName} was not enabled.`);
  } else {
    say(`${providerName} removed${keyRemoved ? " and its key deleted" : ""}.`);
  }
  jsonOut(ctx, { provider: providerName, ok: true, enabled: user.enabledProviders });
  return 0;
}

function makePrompter(ctx: CommandContext): Prompter {
  const nonInteractive = ctx.json || !process.stdin.isTTY;
  return nonInteractive ? new DefaultPrompter() : new ReadlinePrompter();
}

export const addCommand: Command = {
  name: "add",
  summary: "Guided signup, key test and connection for a provider.",
  group: "Providers",
  async run(ctx: CommandContext, args: string[]) {
    const providerName = args[0];
    if (!providerName) throw new UsageError("frugal add <provider>");
    const prompter = makePrompter(ctx);
    try {
      return await runAdd(ctx, providerName, { prompter });
    } finally {
      prompter.close();
    }
  },
};

export const removeCommand: Command = {
  name: "remove",
  summary: "Disconnect a provider and delete its key.",
  group: "Providers",
  async run(ctx: CommandContext, args: string[]) {
    const providerName = args[0];
    if (!providerName) throw new UsageError("frugal remove <provider>");
    return runRemove(ctx, providerName);
  },
};