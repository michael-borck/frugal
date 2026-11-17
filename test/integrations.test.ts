import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { writeOpenCodeConfig, readOpenCodeConfig } from "../src/core/integrations/opencode.js";
import { writePiConfig } from "../src/core/integrations/pi.js";
import { writeMstyGuide, mstyGuide } from "../src/core/integrations/msty.js";

describe("openCode integration", () => {
  let tmp: string;
  let configPath: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "frugal-opencode-"));
    configPath = path.join(tmp, "opencode.json");
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("writes an additive provider entry and sets the default model", async () => {
    const result = await writeOpenCodeConfig({ model: "free-best", apiKey: "sk", configPath });
    expect(result.changed).toBe(true);
    const config = await readOpenCodeConfig(configPath);
    expect(config?.provider?.router9).toBeTruthy();
    expect(config?.model).toBe("router9/free-best");
  });

  it("backs up the original once and preserves existing providers", async () => {
    await fs.writeFile(
      configPath,
      JSON.stringify({ provider: { anthropic: { npm: "@ai-sdk/anthropic" } } }),
    );
    await writeOpenCodeConfig({ configPath });
    const config = await readOpenCodeConfig(configPath);
    expect(config?.provider?.anthropic).toBeTruthy();
    expect(config?.provider?.router9).toBeTruthy();
    await writeOpenCodeConfig({ configPath });
    const backup = await fs.readFile(`${configPath}.frugal-backup`, "utf8");
    expect(backup).toContain("anthropic");
    expect(backup).not.toContain("router9");
  });

  it("writes auto-compaction defaults and a declared context limit", async () => {
    await writeOpenCodeConfig({ model: "free-best", contextLimit: 131_072, configPath });
    const config = await readOpenCodeConfig(configPath);
    expect(config?.compaction?.auto).toBe(true);
    expect(config?.compaction?.buffer).toBe("20%");
    const modelEntry = (config?.provider?.router9 as { models: Record<string, unknown> }).models[
      "free-best"
    ] as { limit?: { context: number; output: number } };
    expect(modelEntry.limit?.context).toBe(131_072);
    expect(modelEntry.limit?.output).toBeLessThanOrEqual(131_072);
  });

  it("keeps a student's existing compaction settings", async () => {
    await fs.writeFile(
      configPath,
      JSON.stringify({ compaction: { auto: false, keep: { tokens: 40000 } } }),
    );
    await writeOpenCodeConfig({ configPath });
    const config = await readOpenCodeConfig(configPath);
    expect(config?.compaction?.auto).toBe(false);
    expect(config?.compaction?.keep?.tokens).toBe(40000);
  });
});

describe("pi integration", () => {
  it("adds a 9router provider and preserves existing Pi providers", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "frugal-pi-"));
    const configPath = path.join(tmp, "models.json");
    try {
      await fs.writeFile(
        configPath,
        JSON.stringify({
          providers: {
            ollama: { baseUrl: "http://localhost:11434/v1", models: [{ id: "qwen3:8b" }] },
            "ollama-shared": {
              baseUrl: "https://ollama.example/v1",
              models: [{ id: "granite4.2:3b" }],
            },
          },
        }),
      );

      const result = await writePiConfig({
        apiKey: "sk-router",
        model: "free-best",
        models: ["cf/a"],
        configPath,
      });
      expect(result.changed).toBe(true);

      const written = JSON.parse(await fs.readFile(configPath, "utf8"));
      expect(written.providers.ollama).toBeTruthy();
      expect(written.providers["ollama-shared"]).toBeTruthy();
      expect(written.providers["9router"].apiKey).toBe("sk-router");
      expect(written.providers["9router"].api).toBe("openai-completions");
      const ids = written.providers["9router"].models.map((m: { id: string }) => m.id);
      expect(ids).toEqual(["free-best", "cf/a"]);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

describe("msty integration", () => {
  it("returns a paste guide without writing a file", () => {
    const result = writeMstyGuide({ model: "best" });
    expect(result.changed).toBe(false);
    expect(result.detail).toContain("best");
    const guide = mstyGuide({ model: "best" });
    expect(guide.steps.length).toBeGreaterThan(0);
  });
});