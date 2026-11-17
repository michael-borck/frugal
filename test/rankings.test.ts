import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { isAllowedRankingUrl, runRankings } from "../src/cli/commands/rankings.js";
import type { CommandContext } from "../src/cli/command.js";
import { loadUserConfig, type Paths } from "../src/core/config.js";

function pathsFor(dir: string): Paths {
  return {
    configDir: dir,
    userConfigPath: path.join(dir, "user.json"),
    statePath: path.join(dir, "state.json"),
    secretsPath: path.join(dir, "secrets.json"),
    backupDir: path.join(dir, "backups"),
  };
}

describe("isAllowedRankingUrl", () => {
  it("accepts https and localhost http", () => {
    expect(isAllowedRankingUrl("https://example.test/r.json")).toBeNull();
    expect(isAllowedRankingUrl("http://localhost:8080/r.json")).toBeNull();
    expect(isAllowedRankingUrl("http://127.0.0.1:8080/r.json")).toBeNull();
  });

  it("rejects remote http and invalid URLs", () => {
    expect(isAllowedRankingUrl("http://example.test/r.json")).toMatch(/https/);
    expect(isAllowedRankingUrl("not a url")).toMatch(/valid/);
  });
});

describe("runRankings", () => {
  let dir: string;
  let paths: Paths;
  let ctx: CommandContext;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "frugal-rankings-"));
    paths = pathsFor(dir);
    ctx = { paths, json: true };
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("sets results, picks, usage and catalog URLs", async () => {
    const code = await runRankings(
      ctx,
      [
        "--results",
        "https://example.test/results.json",
        "--picks=https://example.test/picks.json",
        "--usage",
        "https://example.test/usage.json",
        "--catalog",
        "https://example.test/catalog.json",
      ],
      paths,
    );
    expect(code).toBe(0);
    const user = await loadUserConfig(paths);
    expect(user.resultsUrl).toBe("https://example.test/results.json");
    expect(user.picksUrl).toBe("https://example.test/picks.json");
    expect(user.usageUrl).toBe("https://example.test/usage.json");
    expect(user.catalogUrl).toBe("https://example.test/catalog.json");
  });

  it("clears configured URLs", async () => {
    await runRankings(ctx, ["--results", "https://example.test/r.json", "--catalog", "https://example.test/c.json"], paths);
    await runRankings(ctx, ["--clear"], paths);
    const user = await loadUserConfig(paths);
    expect(user.resultsUrl).toBeUndefined();
    expect(user.catalogUrl).toBeUndefined();
  });

  it("rejects a bad URL", async () => {
    await expect(runRankings(ctx, ["--results", "http://example.test/r.json"], paths)).rejects.toThrow();
  });

  it("rejects an unknown flag", async () => {
    await expect(runRankings(ctx, ["--bogus", "x"], paths)).rejects.toThrow();
  });
});