import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  credentialsFor,
  guideFor,
  loadProviderKeys,
  providerSteps,
} from "../src/core/providerGuide.js";

describe("provider guide", () => {
  it("finds providers by id or normalized id", () => {
    expect(guideFor("openrouter")?.label).toBe("OpenRouter");
    expect(guideFor("cloudflareai")?.id).toBe("cloudflare-ai");
    expect(guideFor("nope")).toBeUndefined();
  });

  it("explains Cloudflare's two values", () => {
    const guide = guideFor("cloudflare-ai")!;
    expect(guide.envKey).toBe("CLOUDFLARE_API_TOKEN");
    expect(guide.envAccount).toBe("CLOUDFLARE_ACCOUNT_ID");
    expect(providerSteps(guide).join(" ")).toMatch(/Account ID/);
  });

  it("resolves credentials from env-style keys", () => {
    const keys = new Map([
      ["OPENROUTER_API_KEY", "sk-or"],
      ["CLOUDFLARE_API_TOKEN", "cf-token"],
      ["CLOUDFLARE_ACCOUNT_ID", "acct"],
      ["GOOGLE_API_KEY", "g-key"],
    ]);
    expect(credentialsFor(guideFor("openrouter")!, keys).apiKey).toBe("sk-or");
    const cf = credentialsFor(guideFor("cloudflare-ai")!, keys);
    expect(cf.apiKey).toBe("cf-token");
    expect(cf.accountId).toBe("acct");
    expect(credentialsFor(guideFor("gemini")!, keys).apiKey).toBe("g-key");
  });

  it("reports missing values", () => {
    const missing = credentialsFor(guideFor("cloudflare-ai")!, new Map());
    expect(missing.missing).toEqual(["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"]);
  });
});

describe("loadProviderKeys", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "frugal-keys-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("reads a KEY=VALUE file and lets env override it", async () => {
    const file = path.join(dir, "providers.env");
    await fs.writeFile(
      file,
      ["# comment", "OPENROUTER_API_KEY=from-file", "export GROQ_API_KEY='gsk-x'", ""].join("\n"),
    );
    const keys = loadProviderKeys(file, { OPENROUTER_API_KEY: "from-env" } as NodeJS.ProcessEnv);
    expect(keys.get("OPENROUTER_API_KEY")).toBe("from-env");
    expect(keys.get("GROQ_API_KEY")).toBe("gsk-x");
  });

  it("throws a clear error for a missing file", () => {
    expect(() => loadProviderKeys(path.join(dir, "missing.env"))).toThrow(/could not read keys file/);
  });
});