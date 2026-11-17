import { defaultPaths, loadUserConfig, saveUserConfig, type Paths } from "../../core/config.js";
import type { UserConfig } from "../../core/types.js";
import { type Command, type CommandContext, jsonOut, out, UsageError } from "../command.js";

export function isAllowedRankingUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "not a valid URL";
  }
  if (url.protocol === "https:") return null;
  if (url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)) return null;
  return "use https (or http on localhost)";
}

type Field = "resultsUrl" | "picksUrl" | "usageUrl" | "catalogUrl";
const FLAG_TO_FIELD: Record<string, Field> = {
  results: "resultsUrl",
  picks: "picksUrl",
  usage: "usageUrl",
  catalog: "catalogUrl",
};

interface Parsed {
  values: Partial<Record<Field, string>>;
  clear: boolean;
  error?: string;
}

function parseArgs(args: string[]): Parsed {
  const parsed: Parsed = { values: {}, clear: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--clear") {
      parsed.clear = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      parsed.error = `unexpected argument: ${arg}`;
      return parsed;
    }
    const withoutDashes = arg.slice(2);
    const eq = withoutDashes.indexOf("=");
    const name = eq >= 0 ? withoutDashes.slice(0, eq) : withoutDashes;
    const field = FLAG_TO_FIELD[name];
    if (!field) {
      parsed.error = `unknown flag: --${name}`;
      return parsed;
    }
    const value = eq >= 0 ? withoutDashes.slice(eq + 1) : args[++index];
    if (value == null || value === "") {
      parsed.error = `--${name} needs a URL`;
      return parsed;
    }
    const problem = isAllowedRankingUrl(value);
    if (problem) {
      parsed.error = `--${name}: ${problem}`;
      return parsed;
    }
    parsed.values[field] = value;
  }
  return parsed;
}

function effective(user: UserConfig, field: Field, env: string | undefined): string | null {
  return user[field] ?? env ?? null;
}

export async function runRankings(
  ctx: CommandContext,
  args: string[],
  pathsInput?: Paths,
): Promise<number> {
  const paths = pathsInput ?? ctx.paths ?? defaultPaths();
  const user = await loadUserConfig(paths);
  const parsed = parseArgs(args);
  if (parsed.error) throw new UsageError(parsed.error);

  const changed = parsed.clear || Object.keys(parsed.values).length > 0;

  if (parsed.clear) {
    user.resultsUrl = undefined;
    user.picksUrl = undefined;
    user.usageUrl = undefined;
    user.catalogUrl = undefined;
  }
  for (const [field, value] of Object.entries(parsed.values) as Array<[Field, string]>) {
    user[field] = value;
  }
  if (changed) await saveUserConfig(paths, user);

  const catalogUrl = effective(user, "catalogUrl", process.env.FRUGAL_CATALOG_URL);
  const report = {
    results_url: effective(user, "resultsUrl", process.env.FRUGAL_RESULTS_URL),
    picks_url: effective(user, "picksUrl", process.env.FRUGAL_PICKS_URL),
    usage_url: effective(user, "usageUrl", process.env.FRUGAL_USAGE_URL),
    catalog_url: catalogUrl,
    catalog_overridden: catalogUrl != null,
    configured: effective(user, "resultsUrl", process.env.FRUGAL_RESULTS_URL) != null,
  };

  jsonOut(ctx, report);
  if (!ctx.json) {
    out(ctx, `results.json: ${report.results_url ?? "(not configured)"}`);
    out(ctx, `picks.json:   ${report.picks_url ?? "(not configured)"}`);
    out(ctx, `usage rank:   ${report.usage_url ?? "(not configured)"}`);
    out(ctx, `catalog.json: ${catalogUrl ?? "(not configured)"}`);
    if (!report.configured) {
      out(ctx, "");
      out(ctx, "Without a hosted results.json, quality ranking falls back to availability, reliability and usage.");
      out(ctx, "Set sources with: frugal rankings --results <url> --picks <url> --usage <url> --catalog <url>");
    }
    if (changed) out(ctx, "Saved.");
  }
  return 0;
}

export const rankingsCommand: Command = {
  name: "rankings",
  summary: "Configure the hosted catalog, results, picks and usage ranking URLs.",
  group: "Settings",
  async run(ctx: CommandContext, args: string[]) {
    return runRankings(ctx, args);
  },
};