import { describe, expect, it } from "vitest";
import { parseOpenRouterFreeModels } from "../src/core/candidates.js";

const payload = {
  data: [
    {
      id: "vendor/free:free",
      context_length: 131_072,
      pricing: { prompt: "0", completion: "0" },
      supported_parameters: ["tools", "temperature"],
      architecture: { output_modalities: ["text"] },
    },
    {
      id: "vendor/paid",
      context_length: 200_000,
      pricing: { prompt: "0.000001", completion: "0.000002" },
      supported_parameters: ["tools"],
      architecture: { output_modalities: ["text"] },
    },
    {
      id: "vendor/no-tools:free",
      context_length: 131_072,
      pricing: { prompt: "0", completion: "0" },
      supported_parameters: ["temperature"],
      architecture: { output_modalities: ["text"] },
    },
    {
      id: "vendor/image:free",
      context_length: 131_072,
      pricing: { prompt: "0", completion: "0" },
      supported_parameters: ["tools"],
      architecture: { output_modalities: ["image"] },
    },
    {
      id: "vendor/legacy:free",
      context_length: 131_072,
      pricing: { prompt: "0", completion: "0" },
      supported_parameters: ["tools"],
      architecture: { modality: "text->text" },
    },
    {
      id: "vendor/no-pricing:free",
      context_length: 131_072,
      supported_parameters: ["tools"],
      architecture: { output_modalities: ["text"] },
    },
  ],
};

describe("parseOpenRouterFreeModels", () => {
  const candidates = parseOpenRouterFreeModels(payload);

  it("keeps only $0 prompt and completion models", () => {
    const ids = candidates.map((c) => c.id);
    expect(ids).toContain("vendor/free:free");
    expect(ids).not.toContain("vendor/paid");
    expect(ids).not.toContain("vendor/no-pricing:free");
  });

  it("maps tool support, context and text output", () => {
    const byId = new Map(candidates.map((c) => [c.id, c]));
    expect(byId.get("vendor/free:free")?.supportsTools).toBe(true);
    expect(byId.get("vendor/no-tools:free")?.supportsTools).toBe(false);
    expect(byId.get("vendor/image:free")?.textOutput).toBe(false);
    expect(byId.get("vendor/legacy:free")?.textOutput).toBe(true);
    expect(byId.get("vendor/free:free")?.contextTokens).toBe(131_072);
    expect(byId.get("vendor/free:free")?.access).toBe("free");
    expect(byId.get("vendor/free:free")?.provider).toBe("openrouter");
  });

  it("returns an empty array for a malformed payload", () => {
    expect(parseOpenRouterFreeModels({})).toEqual([]);
    expect(parseOpenRouterFreeModels({ data: [] })).toEqual([]);
  });
});