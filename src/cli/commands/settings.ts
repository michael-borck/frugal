import { defaultPaths, loadUserConfig, saveUserConfig } from "../../core/config.js";
import { DEFAULT_MAX_MONTHLY_USD, type LocalMode, type Tier } from "../../core/types.js";
import { detectLocalServers, probeLocalServers } from "../../core/local.js";
import { type Command, type CommandContext, jsonOut, out, UsageError } from "../command.js";

export const tierCommand: Command = {
  name: "tier",
  summary: "Switch tier; budget asks the student to confirm the price against the cap.",
  group: "Settings",
  async run(ctx: CommandContext, args: string[]) {
    const value = args[0];
    if (value !== "free" && value !== "budget") {
      throw new UsageError("frugal tier free|budget");
    }
    const paths = defaultPaths();
    const user = await loadUserConfig(paths);
    user.tier = value as Tier;
    if (value === "budget") {
      out(
        ctx,
        `Budget tier selected. Confirm the plan's monthly price is within the cap of $${user.maxMonthlyUsd}.`,
      );
    }
    await saveUserConfig(paths, user);
    out(ctx, `Tier set to ${value}.`);
    return 0;
  },
};

export const localCommand: Command = {
  name: "local",
  summary: "Set local_mode (fallback|first|only) or benchmark the local model.",
  group: "Settings",
  async run(ctx: CommandContext, args: string[]) {
    const sub = args[0];
    if (sub === "detect") {
      const probes = await probeLocalServers();
      const detected = probes.filter((p) => p.reachable);
      jsonOut(ctx, {
        detected: detected.map(({ engine, port, baseUrl }) => ({ engine, port, baseUrl })),
        probes: probes.map(({ engine, port, reachable, detail }) => ({
          engine,
          port,
          reachable,
          detail,
        })),
      });
      if (!ctx.json) {
        for (const probe of probes) {
          out(ctx, `[${probe.reachable ? "found" : "  -  "}] ${probe.engine}: ${probe.detail}`);
        }
        if (detected.length === 0) {
          out(ctx, "No local server found. Start Ollama, llama.cpp server, or Kindi, then re-run.");
        }
      }
      return 0;
    }
    if (sub === "check") {
      const detected = await detectLocalServers();
      jsonOut(ctx, {
        detected: detected.map(({ engine, port, baseUrl }) => ({ engine, port, baseUrl })),
        note: "GPU/VRAM detection and the 10-task subset are not wired yet (spike item).",
      });
      if (!ctx.json) {
        out(
          ctx,
          detected.length > 0
            ? `Local server found: ${detected.map((d) => `${d.engine} on ${d.port}`).join(", ")}. GPU benchmark is not wired yet.`
            : "No local server found. Start one first, then re-run frugal local check.",
        );
      }
      return 0;
    }
    const mode = sub;
    if (mode !== "fallback" && mode !== "first" && mode !== "only") {
      throw new UsageError("frugal local mode fallback|first|only");
    }
    const paths = defaultPaths();
    const user = await loadUserConfig(paths);
    user.localMode = mode as LocalMode;
    await saveUserConfig(paths, user);
    out(ctx, `Local mode set to ${mode}.`);
    return 0;
  },
};

export const providersCommand: Command = {
  name: "providers",
  summary: "List enabled providers and whether each key works.",
  group: "Providers",
  async run(ctx: CommandContext, _args: string[]) {
    const paths = defaultPaths();
    const user = await loadUserConfig(paths);
    jsonOut(ctx, {
      enabled: user.enabledProviders,
      note: "Key validation is not wired yet (spike item).",
    });
    if (!ctx.json) {
      out(ctx, `Enabled providers: ${user.enabledProviders.join(", ") || "(none)"}`);
    }
    return 0;
  },
};

export const reportCommand: Command = {
  name: "report",
  summary: "Open the instructor's published benchmark reference.",
  group: "Upkeep",
  async run(ctx: CommandContext, _args: string[]) {
    out(ctx, "The published reference URL is not configured yet. Set results_url in user.json.");
    return 0;
  },
};

export const updateCommand: Command = {
  name: "update",
  summary: "Update frugal itself; each release pins its own tested 9Router version.",
  group: "Upkeep",
  async run(ctx: CommandContext, _args: string[]) {
    out(ctx, "Self-update is not wired yet in this scaffold. Run: npm i -g frugalrouter@latest");
    return 0;
  },
};

export const uninstallCommand: Command = {
  name: "uninstall",
  summary: "Stop everything and restore each tool's original config from backup.",
  group: "Upkeep",
  async run(ctx: CommandContext, _args: string[]) {
    out(ctx, "Uninstall is not wired yet in this scaffold (backup restore is a spike item).");
    return 0;
  },
};

export { DEFAULT_MAX_MONTHLY_USD };