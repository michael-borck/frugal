import type { ModelCandidate } from "./types.js";

export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

interface OpenRouterModel {
  id?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  supported_parameters?: string[];
  architecture?: {
    modality?: string;
    output_modalities?: string[];
  };
  top_provider?: { context_length?: number };
}

export interface OpenRouterModelsResponse {
  data?: OpenRouterModel[];
}

function price(value: string | undefined): number {
  if (value == null) return Number.POSITIVE_INFINITY;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function isFree(model: OpenRouterModel): boolean {
  return price(model.pricing?.prompt) === 0 && price(model.pricing?.completion) === 0;
}

function isTextOutput(model: OpenRouterModel): boolean {
  const outputs = model.architecture?.output_modalities;
  if (Array.isArray(outputs)) return outputs.includes("text");
  // Older payloads only carry the combined modality string, e.g. "text->text".
  if (typeof model.architecture?.modality === "string") {
    return model.architecture.modality.endsWith("text");
  }
  return true;
}

/**
 * Turn an OpenRouter /api/v1/models payload into free-model candidates.
 *
 * Keeps only models whose prompt and completion prices are $0. Every other
 * filter (tool calling, context floor) is applied later by the merge step, so
 * this function stays a faithful mapping of what the catalog offers.
 */
export function parseOpenRouterFreeModels(payload: OpenRouterModelsResponse): ModelCandidate[] {
  const models = Array.isArray(payload.data) ? payload.data : [];
  const candidates: ModelCandidate[] = [];

  for (const model of models) {
    if (!model.id || !isFree(model)) continue;
    const context = model.context_length ?? model.top_provider?.context_length ?? 0;
    candidates.push({
      id: model.id,
      provider: "openrouter",
      access: "free",
      contextTokens: context,
      supportsTools: Array.isArray(model.supported_parameters)
        ? model.supported_parameters.includes("tools")
        : false,
      textOutput: isTextOutput(model),
      promptPrice: 0,
      completionPrice: 0,
    });
  }

  return candidates;
}