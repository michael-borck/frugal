import { defaultPaths, loadUserConfig, saveUserConfig, configExists } from "../../core/config.js";
import { type Command, type CommandContext, out } from "../command.js";

export const setupCommand: Command = {
  name: "setup",
  summary: "First-time wizard: install, keys, tier, local detection and tool wiring.",
  group: "Everyday",
  async run(ctx: CommandContext, _args: string[]) {
    const paths = defaultPaths();
    const existing = await configExists(paths);
    out(ctx, "frugal setup");
    out(ctx, "");

    if (Number(process.versions.node.split(".")[0]) < 20) {
      out(ctx, "Node 20 or newer is required. Install it from https://nodejs.org, then re-run frugal setup.");
      return 1;
    }

    const user = await loadUserConfig(paths);
    if (existing) {
      out(ctx, "Existing configuration found; it will be kept and extended (setup is safe to re-run).");
    }

    out(ctx, "");
    out(ctx, "Privacy: free endpoints often log prompts and may use them for training. Do not paste credentials, personal data or private school material.");
    out(ctx, "");
    out(ctx, "The interactive prompts (OpenRouter key, Groq signup, tier, local model) are not wired yet in this scaffold.");
    out(ctx, `Default tier: ${user.tier}; local_mode: ${user.localMode}; max_monthly_usd: ${user.maxMonthlyUsd}.`);
    out(ctx, "");
    out(ctx, "Next: run frugal doctor to see what remains.");

    await saveUserConfig(paths, user);
    return 0;
  },
};