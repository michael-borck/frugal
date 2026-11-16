import type { IntegrationResult } from "./base.js";
import { writeOpenCodeConfig } from "./opencode.js";
import { writePiConfig } from "./pi.js";
import { mstyGuide, writeMstyGuide } from "./msty.js";
import { ROUTER_HOST, ROUTER_PORT } from "../types.js";

export interface HarnessSelection {
  opencode: boolean;
  pi: boolean;
  msty: boolean;
}

export const DEFAULT_HARNESSES: HarnessSelection = {
  opencode: true,
  pi: true,
  msty: false,
};

export interface ApplyOptions {
  harnesses?: HarnessSelection;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export async function applyIntegrations(options: ApplyOptions = {}): Promise<IntegrationResult[]> {
  const harnesses = options.harnesses ?? DEFAULT_HARNESSES;
  const baseUrl = options.baseUrl ?? `http://${ROUTER_HOST}:${ROUTER_PORT}/v1`;
  const apiKey = options.apiKey ?? "frugal-local";
  const model = options.model ?? "free-best";
  const results: IntegrationResult[] = [];

  if (harnesses.opencode) results.push(await writeOpenCodeConfig({ baseUrl, apiKey, model }));
  if (harnesses.pi) results.push(await writePiConfig({ baseUrl, apiKey, model }));
  if (harnesses.msty) results.push(writeMstyGuide({ baseUrl, apiKey, model }));

  return results;
}

export { writeOpenCodeConfig, writePiConfig, writeMstyGuide, mstyGuide };
export type { IntegrationResult };