export type ValidatableProvider = "openrouter" | "groq";

export interface KeyValidation {
  ok: boolean;
  detail: string;
}

const ENDPOINTS: Record<ValidatableProvider, string> = {
  openrouter: "https://openrouter.ai/api/v1/key",
  groq: "https://api.groq.com/openai/v1/models",
};

export function isValidatableProvider(value: string): value is ValidatableProvider {
  return value === "openrouter" || value === "groq";
}

/**
 * Validate a provider key with a cheap authenticated call. The key is never
 * logged; only the provider name and the outcome are returned.
 */
export async function validateProviderKey(
  provider: ValidatableProvider,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 10_000,
): Promise<KeyValidation> {
  const url = ENDPOINTS[provider];
  if (!url) return { ok: false, detail: `no key validator for ${provider}` };
  if (!apiKey) return { ok: false, detail: `${provider} key is empty` };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (response.ok) return { ok: true, detail: `${provider} key accepted` };
    if (response.status === 401 || response.status === 403) {
      return { ok: false, detail: `${provider} rejected the key` };
    }
    return { ok: false, detail: `${provider} returned status ${response.status}` };
  } catch {
    return { ok: false, detail: `could not reach ${provider} to validate the key` };
  } finally {
    clearTimeout(timer);
  }
}