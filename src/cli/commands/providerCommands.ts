import { isProviderId, providerIds, providerInfo } from "../../core/providers.js";
import { ROUTER_HOST, ROUTER_PORT } from "../../core/types.js";
import { type Command, type CommandContext, jsonOut, out, UsageError } from "../command.js";

function dashboardUrl(): string {
  return `http://${ROUTER_HOST}:${ROUTER_PORT}/dashboard`;
}

/**
 * Providers are connected in 9Router, which also stores their keys. frugal only
 * points at the right screen; it never prompts for or stores provider keys.
 */
export async function runAdd(ctx: CommandContext, providerName: string): Promise<number> {
  const info = providerInfo(providerName);
  const say = (message: string): void => {
    if (!ctx.json) out(ctx, message);
  };

  if (!info) {
    say(`Unknown provider: ${providerName}`);
    say(`Known providers: ${providerIds().join(", ")}`);
    jsonOut(ctx, { provider: providerName, ok: false, error: "unknown-provider" });
    return 2;
  }

  say(`${info.label} is managed by 9Router, not frugal.`);
  say(`Open ${dashboardUrl()} → Providers, then connect ${info.label}.`);
  if (info.auth === "key") {
    say("Paste the provider key on that screen; 9Router stores it, not frugal.");
  } else if (info.auth === "oauth") {
    say("This provider uses guided OAuth in 9Router.");
  } else {
    say("This provider needs no key.");
  }
  say("When it is connected, run: frugal verify");
  jsonOut(ctx, {
    provider: info.id,
    managed_by: "9router",
    dashboard: dashboardUrl(),
    ok: true,
  });
  return 0;
}

export async function runRemove(ctx: CommandContext, providerName: string): Promise<number> {
  const say = (message: string): void => {
    if (!ctx.json) out(ctx, message);
  };

  if (!isProviderId(providerName)) {
    say(`Unknown provider: ${providerName}`);
    jsonOut(ctx, { provider: providerName, ok: false, error: "unknown-provider" });
    return 2;
  }

  say(`${providerName} is managed by 9Router.`);
  say(`Disconnect it at ${dashboardUrl()} → Providers.`);
  jsonOut(ctx, {
    provider: providerName,
    managed_by: "9router",
    dashboard: dashboardUrl(),
    ok: true,
  });
  return 0;
}

export const addCommand: Command = {
  name: "add",
  summary: "Point to the 9Router provider screen (keys and connections live in 9Router).",
  group: "Providers",
  async run(ctx: CommandContext, args: string[]) {
    const providerName = args[0];
    if (!providerName) throw new UsageError("frugal add <provider>");
    return runAdd(ctx, providerName);
  },
};

export const removeCommand: Command = {
  name: "remove",
  summary: "Point to where to disconnect a provider in 9Router.",
  group: "Providers",
  async run(ctx: CommandContext, args: string[]) {
    const providerName = args[0];
    if (!providerName) throw new UsageError("frugal remove <provider>");
    return runRemove(ctx, providerName);
  },
};