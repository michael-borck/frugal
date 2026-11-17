import { defaultPaths } from "../../core/config.js";
import { RouterManager } from "../../core/routerManager.js";
import { ROUTER_HOST, ROUTER_PORT } from "../../core/types.js";
import { type Command, type CommandContext, jsonOut, out } from "../command.js";

export const startCommand: Command = {
  name: "start",
  summary:
    "Start the router service (installing the pinned 9Router locally on first use).",
  group: "Everyday",
  async run(ctx: CommandContext, _args: string[]) {
    const paths = defaultPaths();
    const manager = new RouterManager({ configDir: paths.configDir });
    const result = await manager.start();

    jsonOut(ctx, {
      running: result.started || result.alreadyRunning,
      already_running: result.alreadyRunning,
      pid: result.pid ?? null,
      detail: result.detail,
      host: ROUTER_HOST,
      port: ROUTER_PORT,
    });
    if (!ctx.json) {
      out(ctx, result.detail);
      if (!result.started && !result.alreadyRunning) {
        out(ctx, "Check the router log, or install it manually with: npm install -g 9router");
      }
    }
    return result.started || result.alreadyRunning ? 0 : 1;
  },
};

export const stopCommand: Command = {
  name: "stop",
  summary: "Stop the router service.",
  group: "Everyday",
  async run(ctx: CommandContext, _args: string[]) {
    const paths = defaultPaths();
    const manager = new RouterManager({ configDir: paths.configDir });
    const result = await manager.stop();
    jsonOut(ctx, { stopped: result.stopped, detail: result.detail });
    if (!ctx.json) out(ctx, result.detail);
    return result.stopped ? 0 : 1;
  },
};