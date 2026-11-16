import { defaultPaths, loadUserConfig } from "../../core/config.js";
import { type Command, type CommandContext, jsonOut, out, UsageError } from "../command.js";

const OVERRIDES = ["prefer", "ban", "lock", "reset"] as const;
type Override = (typeof OVERRIDES)[number];

function isOverride(value: string): value is Override {
  return (OVERRIDES as readonly string[]).includes(value);
}

export const modelsCommand: Command = {
  name: "models",
  summary: "List the combo in order with source, score tier and state.",
  group: "Models",
  async run(ctx: CommandContext, _args: string[]) {
    const paths = defaultPaths();
    const user = await loadUserConfig(paths);
    jsonOut(ctx, {
      overrides: { pin: user.pin, ban: user.ban, lock: user.lock },
      note: "Combo listing needs a last-good combo (run frugal refresh).",
    });
    if (!ctx.json) {
      out(ctx, "Pins: " + (user.pin.join(", ") || "(none)"));
      out(ctx, "Bans: " + (user.ban.join(", ") || "(none)"));
      out(ctx, "Lock: " + (user.lock ?? "(none)"));
      out(ctx, "Run frugal refresh to populate the combo.");
    }
    return 0;
  },
};

export async function overrideCommand(
  ctx: CommandContext,
  override: Override,
  args: string[],
): Promise<number> {
  const paths = defaultPaths();
  const user = await loadUserConfig(paths);

  if (override === "reset") {
    if (args.length === 0) {
      user.pin = [];
      user.ban = [];
      user.lock = null;
    } else {
      const id = args[0]!;
      user.pin = user.pin.filter((p) => p !== id);
      user.ban = user.ban.filter((b) => b !== id);
      if (user.lock === id) user.lock = null;
    }
    const { saveUserConfig } = await import("../../core/config.js");
    await saveUserConfig(paths, user);
    out(ctx, "Overrides reset.");
    return 0;
  }

  const id = args[0];
  if (!id) throw new UsageError(`frugal ${override} <model>`);

  if (override === "prefer") {
    user.pin = [id, ...user.pin.filter((p) => p !== id)];
    user.ban = user.ban.filter((b) => b !== id);
  } else if (override === "ban") {
    user.ban = [id, ...user.ban.filter((b) => b !== id)];
    user.pin = user.pin.filter((p) => p !== id);
    if (user.lock === id) user.lock = null;
  } else if (override === "lock") {
    user.lock = id;
    out(ctx, "Warning: with a lock there is no failover; errors will follow when its quota runs out.");
  }

  const { saveUserConfig } = await import("../../core/config.js");
  await saveUserConfig(paths, user);
  out(ctx, `${override} ${id}`);
  return 0;
}

export function makeOverrideCommand(override: Override): Command {
  return {
    name: override,
    summary:
      override === "prefer"
        ? "Put the model first; failover continues beneath it."
        : override === "ban"
          ? "Remove the model from the combo."
          : override === "lock"
            ? "Use only this model with no failover."
            : "Clear one override, or all of them.",
    group: "Models",
    run: (ctx, args) => overrideCommand(ctx, override, args),
  };
}

export function isOverrideName(value: string): boolean {
  return isOverride(value);
}