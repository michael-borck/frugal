import { readFileSync } from "node:fs";

export type ProviderAuth = "none" | "key" | "cloudflare" | "custom";


export interface ProviderGuide {
  id: string;
  label: string;
  auth: ProviderAuth;
  signupUrl?: string;
  keyUrl?: string;
  envKey?: string;
  envAliases?: string[];
  envAccount?: string;
  note?: string;
  /** For auth "custom": register an OpenAI-compatible provider node. */
  baseUrl?: string;
  prefix?: string;
  apiType?: "chat" | "responses";
}

/** One thin guide per free provider: where to sign up, where the key is, env var. */
export const PROVIDER_GUIDE: ProviderGuide[] = [
  {
    id: "opencode",
    label: "OpenCode Free",
    auth: "none",
    note: "no key needed",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    auth: "key",
    signupUrl: "https://openrouter.ai",
    keyUrl: "https://openrouter.ai/settings/keys",
    envKey: "OPENROUTER_API_KEY",
  },
  {
    id: "groq",
    label: "Groq",
    auth: "key",
    signupUrl: "https://console.groq.com",
    keyUrl: "https://console.groq.com/keys",
    envKey: "GROQ_API_KEY",
  },
  {
    id: "cloudflare-ai",
    label: "Cloudflare Workers AI",
    auth: "cloudflare",
    signupUrl: "https://dash.cloudflare.com",
    keyUrl: "https://dash.cloudflare.com/profile/api-tokens",
    envKey: "CLOUDFLARE_API_TOKEN",
    envAccount: "CLOUDFLARE_ACCOUNT_ID",
    note: "API token + Account ID",
  },
  {
    id: "kilo-gateway",
    label: "Kilo Gateway",
    auth: "key",
    signupUrl: "https://kilo.ai",
    envKey: "KILO_API_KEY",
    note: "free models",
  },
  {
    id: "nvidia",
    label: "NVIDIA NIM",
    auth: "key",
    signupUrl: "https://build.nvidia.com",
    envKey: "NVIDIA_API_KEY",
    note: "free tier",
  },
  {
    id: "mistral",
    label: "Mistral",
    auth: "key",
    signupUrl: "https://console.mistral.ai",
    keyUrl: "https://console.mistral.ai/api-keys",
    envKey: "MISTRAL_API_KEY",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    auth: "key",
    signupUrl: "https://aistudio.google.com",
    keyUrl: "https://aistudio.google.com/apikey",
    envKey: "GEMINI_API_KEY",
    envAliases: ["GOOGLE_API_KEY"],
  },
  {
    id: "requesty",
    label: "Requesty",
    auth: "custom",
    signupUrl: "https://requesty.ai",
    keyUrl: "https://app.requesty.ai/api-keys",
    envKey: "REQUESTY_API_KEY",
    baseUrl: "https://router.requesty.ai/v1",
    prefix: "requesty",
    apiType: "chat",
    note: "OpenAI-compatible gateway",
  },
  {
    id: "crowllm",
    label: "CrowLLM",
    auth: "custom",
    signupUrl: "https://crowllm.com",
    envKey: "CROWLLM_API_KEY",
    baseUrl: "https://crowllm.com/v1",
    prefix: "crowllm",
    apiType: "chat",
    note: "no published pricing; verify models",
  },
];

export function guideFor(value: string): ProviderGuide | undefined {
  const key = value.trim().toLowerCase();
  return PROVIDER_GUIDE.find(
    (provider) => provider.id === key || provider.id.replace(/-/g, "") === key.replace(/-/g, ""),
  );
}

export function providerSteps(guide: ProviderGuide): string[] {
  if (guide.auth === "none") {
    return [`Open 9Router → Providers → ${guide.label}.`, "Connect it; no key is needed."];
  }
  if (guide.auth === "cloudflare") {
    return [
      "Open the Cloudflare dashboard → My Profile → API Tokens.",
      "Create a token with Workers AI access; it is shown once, so copy it.",
      "Copy your Account ID from the dashboard overview.",
      `Paste both when frugal asks, or set ${guide.envKey} and ${guide.envAccount}.`,
    ];
  }
  if (guide.auth === "custom") {
    const steps: string[] = [];
    if (guide.signupUrl) steps.push(`Create an account or sign in at ${guide.signupUrl}.`);
    if (guide.keyUrl) {
      steps.push(`Open ${guide.keyUrl} and create a key; copy it (often shown once).`);
    } else {
      steps.push("Find the API keys section in the provider's dashboard and create a key.");
    }
    steps.push(
      `frugal registers it as an OpenAI-compatible provider at ${guide.baseUrl ?? "(base URL)"}.`,
    );
    steps.push(`Paste it when frugal asks, or set ${guide.envKey}.`);
    return steps;
  }
  const steps: string[] = [];
  if (guide.signupUrl) steps.push(`Create an account or sign in at ${guide.signupUrl}.`);
  if (guide.keyUrl) {
    steps.push(`Open ${guide.keyUrl} and create a key; it is often shown once, so copy it.`);
  } else {
    steps.push("Find the API keys section in the provider's dashboard and create a key.");
  }
  const aliases = guide.envAliases?.length ? ` (or ${guide.envAliases.join(", ")})` : "";
  steps.push(`Paste it when frugal asks, or set ${guide.envKey}${aliases}.`);
  return steps;
}

function parseEnvFile(file: string): Record<string, string> {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    throw new Error(`could not read keys file: ${file}`);
  }
  const values: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    let key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (key.startsWith("export ")) key = key.slice("export ".length).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) values[key] = value;
  }
  return values;
}

/** File first, then the real environment (env wins). */
export function loadProviderKeys(
  file?: string,
  env: NodeJS.ProcessEnv = process.env,
): Map<string, string> {
  const values = new Map<string, string>();
  if (file) {
    for (const [key, value] of Object.entries(parseEnvFile(file))) {
      if (value) values.set(key, value);
    }
  }
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string" && value.trim()) values.set(key, value.trim());
  }
  return values;
}

export interface ProviderCredentials {
  apiKey?: string;
  accountId?: string;
  missing: string[];
}

export function credentialsFor(
  guide: ProviderGuide,
  keys: Map<string, string>,
): ProviderCredentials {
  const envId = `${guide.id.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`;
  const keyCandidates = [guide.envKey, ...(guide.envAliases ?? []), envId, guide.id];
  const apiKey = keyCandidates
    .map((name) => (name ? keys.get(name) : undefined))
    .find((value): value is string => typeof value === "string" && value.length > 0);

  const accountCandidates = [guide.envAccount, "CLOUDFLARE_ACCOUNT_ID", "CF_ACCOUNT_ID"];
  const accountId = accountCandidates
    .map((name) => (name ? keys.get(name) : undefined))
    .find((value): value is string => typeof value === "string" && value.length > 0);

  const missing: string[] = [];
  if (guide.auth !== "none" && !apiKey) missing.push(guide.envKey ?? "API key");
  if (guide.auth === "cloudflare" && !accountId) {
    missing.push(guide.envAccount ?? "Account ID");
  }
  return { apiKey, accountId, missing };
}