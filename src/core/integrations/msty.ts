import { ROUTER_HOST, ROUTER_PORT } from "../types.js";
import type { IntegrationResult } from "./base.js";

/**
 * Msty: no known file-based config in the free version. frugal prints the three
 * values to paste into Msty's remote OpenAI-compatible provider screen and
 * copies the key to the clipboard. This adapter therefore returns a result with
 * `changed: false` and the values to display; it never writes a file.
 */

export interface MstyOptions {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

export interface MstyGuide {
  baseUrl: string;
  apiKey: string;
  model: string;
  steps: string[];
}

export function mstyGuide(options: MstyOptions = {}): MstyGuide {
  const baseUrl = options.baseUrl ?? `http://${ROUTER_HOST}:${ROUTER_PORT}/v1`;
  const apiKey = options.apiKey ?? "frugal-local";
  const model = options.model ?? "free-best";
  return {
    baseUrl,
    apiKey,
    model,
    steps: [
      "Open Msty and go to Settings → Remote Providers.",
      "Add a new provider of type OpenAI-compatible.",
      `Base URL: ${baseUrl}`,
      `API key: ${apiKey}`,
      `Model: ${model}`,
      "Save, then start a chat and send one short message to confirm it works.",
    ],
  };
}

export function writeMstyGuide(options: MstyOptions = {}): IntegrationResult {
  const guide = mstyGuide(options);
  return {
    name: "msty",
    changed: false,
    backedUp: false,
    configPath: "(no file — paste into Msty's UI)",
    detail: `Copy into Msty: base URL ${guide.baseUrl}, key ${guide.apiKey}, model ${guide.model}.`,
  };
}