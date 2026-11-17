import type { ProviderId } from "./types.js";

export type ProviderAuth = "none" | "key" | "oauth";

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  auth: ProviderAuth;
  /** Whether a key can be validated with a cheap authenticated call. */
  validatable: boolean;
}

/** The providers frugal knows about. Keyless ones need no account. */
export const PROVIDERS: ProviderInfo[] = [
  { id: "opencode-free", label: "OpenCode Free", auth: "none", validatable: false },
  { id: "openrouter", label: "OpenRouter", auth: "key", validatable: true },
  { id: "groq", label: "Groq", auth: "key", validatable: true },
  { id: "github-copilot-student", label: "GitHub Copilot Student", auth: "none", validatable: false },
  { id: "mistral", label: "Mistral", auth: "key", validatable: false },
  { id: "google-gemini", label: "Google Gemini", auth: "key", validatable: false },
  { id: "cloudflare-workers-ai", label: "Cloudflare Workers AI", auth: "key", validatable: false },
  { id: "nvidia-api-catalog", label: "NVIDIA API Catalog", auth: "key", validatable: false },
  { id: "kiro", label: "Kiro", auth: "oauth", validatable: false },
  { id: "opencode-go", label: "OpenCode Go", auth: "key", validatable: false },
  { id: "clinepass", label: "ClinePass", auth: "key", validatable: false },
  { id: "z-ai-glm", label: "Z.ai GLM", auth: "key", validatable: false },
  { id: "kimi", label: "Kimi", auth: "key", validatable: false },
  { id: "chutes", label: "Chutes", auth: "key", validatable: false },
  { id: "crowllm", label: "CrowLLM", auth: "key", validatable: false },
  { id: "requesty", label: "Requesty", auth: "key", validatable: false },
  { id: "kilo", label: "Kilo AI Gateway", auth: "key", validatable: false },
  { id: "local", label: "Local model server", auth: "none", validatable: false },
];

export function providerInfo(id: string): ProviderInfo | undefined {
  return PROVIDERS.find((provider) => provider.id === id);
}

export function isProviderId(value: string): value is ProviderId {
  return PROVIDERS.some((provider) => provider.id === value);
}

export function providerIds(): string[] {
  return PROVIDERS.map((provider) => provider.id);
}