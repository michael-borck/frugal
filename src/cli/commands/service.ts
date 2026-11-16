import { defaultPaths, loadState, saveState } from "../../core/config.js";
import { ROUTER_HOST, ROUTER_PORT } from "../../core/types.js";
import { HttpRouterClient } from "../../core/routerClient.js";
import { type Command, type CommandContext, jsonOut, out } from "../command.js";

export const startCommand: Command = {
  name: "start",
  summary: "Start or stop the router service; start refreshes the combo if it is older than 24 hours.",
  group: "Everyday",
  async run(ctx: CommandContext, _args: string[]) {
    const router = new HttpRouterClient();
    const up = await router.health();
    jsonOut(ctx, { router: up ? "running" : "stopped", host: ROUTER_HOST, port: ROUTER_PORT });
    if (!ctx.json) {
      out(
        ctx,
        up
          ? `9Router is running at http://${ROUTER_HOST}:${ROUTER_PORT}.`
          : `9Router is not running. (Service launch is not wired yet in this scaffold.)`,
      );
    }
    if (up) {
      const state = await loadState(defaultPaths());
      state.lastRefreshAt ??= new Date().toISOString();
      await saveState(defaultPaths(), state);
    }
    return up ? 0 : 1;
  },
};

export const stopCommand: Command = {
  name: "stop",
  summary: "Stop the router service.",
  group: "Everyday",
  async run(ctx: CommandContext, _args: string[]) {
    out(ctx, "Stop is not wired yet in this scaffold. (Service management is a spike item.)");
    return 0;
  },
};