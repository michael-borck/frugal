import { PROVIDER_GUIDE, providerSteps } from "../../core/providerGuide.js";
import { type Command, type CommandContext, jsonOut, out, UsageError } from "../command.js";

export const guideCommand: Command = {
  name: "guide",
  summary: "Where to create each free provider's API key, and the env var to use.",
  group: "Providers",
  async run(ctx: CommandContext, args: string[]) {
    const topic = args[0] ?? "providers";
    if (topic !== "providers") throw new UsageError("frugal guide providers");

    const providers = PROVIDER_GUIDE.map((guide) => ({
      id: guide.id,
      label: guide.label,
      auth: guide.auth,
      signup: guide.signupUrl ?? null,
      key_page: guide.keyUrl ?? null,
      env_key: guide.envKey ?? null,
      env_aliases: guide.envAliases ?? [],
      env_account: guide.envAccount ?? null,
      base_url: guide.baseUrl ?? null,
      prefix: guide.prefix ?? null,
      steps: providerSteps(guide),
    }));

    jsonOut(ctx, { providers });
    if (!ctx.json) {
      for (const provider of providers) {
        const kind =
          provider.auth === "none"
            ? "no key"
            : provider.auth === "cloudflare"
              ? "API token + Account ID"
              : provider.auth === "custom"
                ? `custom OpenAI-compatible (${provider.base_url})`
                : "API key";
        out(ctx, `${provider.label} (${provider.id}) — ${kind}`);
        for (const step of provider.steps) out(ctx, `  - ${step}`);
        out(ctx, "");
      }
      out(ctx, "Paste keys in 9Router → Providers, or set env vars and run:");
      out(
        ctx,
        "  frugal setup --yes --provider openrouter,groq --keys-file ~/.config/frugal/providers.env",
      );
      out(ctx, "Keys file format: one KEY=VALUE per line (comments with #).");
    }
    return 0;
  },
};