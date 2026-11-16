import { defaultPaths, loadState, loadUserConfig } from "../../core/config.js";
import { ROUTER_HOST, ROUTER_PORT } from "../../core/types.js";
import { HttpRouterClient } from "../../core/routerClient.js";
import { type Command, type CommandContext, jsonOut, out } from "../command.js";

export const doctorCommand: Command = {
  name: "doctor",
  summary: "Check every link in the chain and print the fix.",
  group: "Everyday",
  async run(ctx: CommandContext, args: string[]) {
    const applyFixes = args.includes("--fix");
    const paths = defaultPaths();
    const [user, state] = await Promise.all([loadUserConfig(paths), loadState(paths)]);
    const router = new HttpRouterClient();

    type Check = {
      name: string;
      ok: boolean;
      detail: string;
      fix?: string;
      autoFixable?: boolean;
    };
    const checks: Check[] = [];

    checks.push({
      name: "node",
      ok: Number(process.versions.node.split(".")[0]) >= 20,
      detail: `Node ${process.versions.node}`,
      fix: "Install Node 20 or newer from https://nodejs.org",
    });

    const routerUp = await router.health();
    checks.push({
      name: "router",
      ok: routerUp,
      detail: routerUp
        ? `9Router reachable at ${ROUTER_HOST}:${ROUTER_PORT}`
        : `9Router not reachable at ${ROUTER_HOST}:${ROUTER_PORT}`,
      fix: "Run frugal start",
    });

    checks.push({
      name: "config",
      ok: user.enabledProviders.length > 0,
      detail: `${user.enabledProviders.length} providers enabled`,
      fix: "Run frugal setup",
    });

    checks.push({
      name: "combo",
      ok: state.lastGoodCombo != null,
      detail: state.lastGoodCombo
        ? `combo ${state.lastGoodCombo.name} with ${state.lastGoodCombo.entries.length} models`
        : "no last-good combo",
      fix: "Run frugal refresh",
    });

    const resultsStale = null;
    checks.push({
      name: "ranking_freshness",
      ok: resultsStale == null,
      detail: resultsStale == null ? "results.json age unknown" : `${resultsStale} days old`,
      fix: "frugal refresh",
    });

    const failed = checks.filter((c) => !c.ok);
    jsonOut(ctx, {
      ok: failed.length === 0,
      checks: checks.map(({ name, ok, detail, fix }) => ({ name, ok, detail, fix: fix ?? null })),
    });
    if (!ctx.json) {
      for (const check of checks) {
        const mark = check.ok ? "ok  " : "FAIL";
        out(ctx, `[${mark}] ${check.name}: ${check.detail}`);
        if (!check.ok && check.fix) out(ctx, `        → ${check.fix}`);
      }
      if (applyFixes) {
        out(ctx, "(--fix requested; no automatic fixes available yet)");
      }
      out(ctx, failed.length === 0 ? "All checks passed." : `${failed.length} check(s) need attention.`);
    }
    return failed.length === 0 ? 0 : 1;
  },
};