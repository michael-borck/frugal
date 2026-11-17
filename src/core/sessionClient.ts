import { ROUTER_HOST, ROUTER_PORT } from "./types.js";

export interface ComboRecord {
  id: string;
  name: string;
  models: string[];
  kind?: string | null;
}

export interface ProviderNode {
  id: string;
  name: string;
  prefix: string;
  baseUrl: string;
}

export interface EnsureNodeInput {
  name: string;
  prefix: string;
  baseUrl: string;
  apiType?: "chat" | "responses";
}

export interface SessionApi {
  login(password: string): Promise<{ ok: boolean; detail: string }>;
  status(): Promise<boolean>;
  catalogSync(): Promise<{ ok: boolean; detail: string }>;
  getApiKey(name?: string): Promise<string>;
  listModels(): Promise<string[]>;
  listCombos(): Promise<ComboRecord[]>;
  upsertCombo(name: string, models: string[]): Promise<{ created: boolean; id: string }>;
  ensureFallbackStrategy(name: string): Promise<boolean>;
  validateProvider(
    provider: string,
    apiKey: string,
    providerSpecificData?: Record<string, unknown>,
  ): Promise<{ ok: boolean; detail: string }>;
  createProvider(
    provider: string,
    apiKey: string,
    providerSpecificData?: Record<string, unknown>,
    connectionName?: string,
  ): Promise<{ ok: boolean; detail: string; already: boolean }>;
  listProviderNodes(): Promise<ProviderNode[]>;
  ensureProviderNode(input: EnsureNodeInput): Promise<{ id: string; created: boolean }>;
}

export interface SessionOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * 9Router's dashboard API (/api/*) requires a session cookie, not the sk- key.
 * Log in with the dashboard password, then use the cookie for combos, model
 * listing and settings. The password is held in memory only.
 */
export class RouterSession implements SessionApi {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private cookie?: string;

  constructor(options: SessionOptions = {}) {
    this.baseUrl = options.baseUrl ?? `http://${ROUTER_HOST}:${ROUTER_PORT}`;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.cookie) headers.set("cookie", this.cookie);
    if (init.body != null) headers.set("content-type", "application/json");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private async detail(response: Response): Promise<string> {
    try {
      const body = (await response.json()) as { error?: unknown; message?: unknown };
      const message = body.error ?? body.message;
      return typeof message === "string" ? message : `status ${response.status}`;
    } catch {
      return `status ${response.status}`;
    }
  }

  async login(password: string): Promise<{ ok: boolean; detail: string }> {
    const response = await this.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    if (!response.ok) {
      return { ok: false, detail: await this.detail(response) };
    }
    const setCookies =
      (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    const authCookie = setCookies.find((value) => value.startsWith("auth_token="));
    if (!authCookie) {
      return { ok: false, detail: "login succeeded but no session cookie was returned" };
    }
    this.cookie = authCookie.split(";")[0]!;
    return { ok: true, detail: "logged in" };
  }

  async status(): Promise<boolean> {
    const response = await this.request("/api/auth/status");
    if (!response.ok) return false;
    const body = (await response.json()) as { authenticated?: unknown };
    return body.authenticated === true;
  }

  async catalogSync(): Promise<{ ok: boolean; detail: string }> {
    const response = await this.request("/api/models/catalog-sync", { method: "POST" });
    if (!response.ok) return { ok: false, detail: await this.detail(response) };
    return { ok: true, detail: "provider catalogs refreshed" };
  }

  async getApiKey(name = "frugal"): Promise<string> {
    const listed = await this.request("/api/keys");
    if (listed.ok) {
      const body = (await listed.json()) as {
        keys?: Array<{ key?: unknown; name?: unknown; isActive?: unknown }>;
      };
      const keys = Array.isArray(body.keys) ? body.keys : [];
      const active = keys.filter((entry) => entry.isActive !== false && typeof entry.key === "string");
      const preferred = active.find((entry) => entry.name === name) ?? active[0];
      if (preferred && typeof preferred.key === "string") return preferred.key;
    }
    const created = await this.request("/api/keys", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    if (!created.ok) throw new Error(`could not create an API key: ${await this.detail(created)}`);
    const body = (await created.json()) as { key?: unknown };
    if (typeof body.key !== "string") throw new Error("API key response did not include a key");
    return body.key;
  }

  async listModels(): Promise<string[]> {
    const response = await this.request("/api/models");
    if (!response.ok) throw new Error(`/api/models: ${await this.detail(response)}`);
    const body = (await response.json()) as {
      models?: Array<{ routedModel?: unknown; fullModel?: unknown; provider?: unknown; model?: unknown }>;
    };
    const models = Array.isArray(body.models) ? body.models : [];
    return models
      .map((entry) => {
        if (typeof entry.routedModel === "string" && entry.routedModel.length > 0) {
          return entry.routedModel;
        }
        if (typeof entry.fullModel === "string" && entry.fullModel.length > 0) {
          return entry.fullModel;
        }
        if (typeof entry.provider === "string" && typeof entry.model === "string") {
          return `${entry.provider}/${entry.model}`;
        }
        return "";
      })
      .filter((id) => id.length > 0);
  }

  async listCombos(): Promise<ComboRecord[]> {
    const response = await this.request("/api/combos");
    if (!response.ok) throw new Error(`/api/combos: ${await this.detail(response)}`);
    const body = (await response.json()) as { combos?: ComboRecord[] };
    return Array.isArray(body.combos) ? body.combos : [];
  }

  async upsertCombo(name: string, models: string[]): Promise<{ created: boolean; id: string }> {
    const combos = await this.listCombos();
    const existing = combos.find((combo) => combo.name === name);
    if (existing) {
      const response = await this.request(`/api/combos/${encodeURIComponent(existing.id)}`, {
        method: "PUT",
        body: JSON.stringify({ models }),
      });
      if (!response.ok) throw new Error(`update combo: ${await this.detail(response)}`);
      return { created: false, id: existing.id };
    }
    const response = await this.request("/api/combos", {
      method: "POST",
      body: JSON.stringify({ name, models, kind: null }),
    });
    if (!response.ok) throw new Error(`create combo: ${await this.detail(response)}`);
    const body = (await response.json()) as { id?: unknown };
    return { created: true, id: typeof body.id === "string" ? body.id : "" };
  }

  async ensureFallbackStrategy(name: string): Promise<boolean> {
    const response = await this.request("/api/settings");
    if (!response.ok) throw new Error(`/api/settings: ${await this.detail(response)}`);
    const settings = (await response.json()) as {
      comboStrategies?: Record<string, { fallbackStrategy?: string }>;
    };
    const strategies = settings.comboStrategies ?? {};
    if (strategies[name]?.fallbackStrategy === "fallback") return false;
    const next = {
      ...strategies,
      [name]: { ...(strategies[name] ?? {}), fallbackStrategy: "fallback" },
    };
    const patch = await this.request("/api/settings", {
      method: "PATCH",
      body: JSON.stringify({ comboStrategies: next }),
    });
    if (!patch.ok) throw new Error(`update strategy: ${await this.detail(patch)}`);
    return true;
  }

  async validateProvider(
    provider: string,
    apiKey: string,
    providerSpecificData?: Record<string, unknown>,
  ): Promise<{ ok: boolean; detail: string }> {
    const response = await this.request("/api/providers/validate", {
      method: "POST",
      body: JSON.stringify({ provider, apiKey, providerSpecificData }),
    });
    if (!response.ok) return { ok: false, detail: await this.detail(response) };
    const body = (await response.json()) as { valid?: unknown; error?: unknown };
    if (body.valid === true) return { ok: true, detail: "key accepted" };
    return {
      ok: false,
      detail: typeof body.error === "string" ? body.error : "key rejected",
    };
  }

  async createProvider(
    provider: string,
    apiKey: string,
    providerSpecificData?: Record<string, unknown>,
    connectionName?: string,
  ): Promise<{ ok: boolean; detail: string; already: boolean }> {
    const body: Record<string, unknown> = { provider, apiKey, providerSpecificData };
    if (connectionName) body.name = connectionName;
    const response = await this.request("/api/providers", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (response.status === 409) {
      return { ok: true, detail: "already connected", already: true };
    }
    if (!response.ok) return { ok: false, detail: await this.detail(response), already: false };
    return { ok: true, detail: `${provider} connected`, already: false };
  }

  async listProviderNodes(): Promise<ProviderNode[]> {
    const response = await this.request("/api/provider-nodes");
    if (!response.ok) throw new Error(`/api/provider-nodes: ${await this.detail(response)}`);
    const body = (await response.json()) as { nodes?: ProviderNode[] };
    return Array.isArray(body.nodes) ? body.nodes : [];
  }

  async ensureProviderNode(input: EnsureNodeInput): Promise<{ id: string; created: boolean }> {
    const nodes = await this.listProviderNodes();
    const baseUrl = input.baseUrl.replace(/\/$/, "").toLowerCase();
    const existing = nodes.find(
      (node) =>
        (node.name ?? "").toLowerCase() === input.name.toLowerCase() ||
        (node.baseUrl ?? "").replace(/\/$/, "").toLowerCase() === baseUrl,
    );
    if (existing) return { id: existing.id, created: false };

    const response = await this.request("/api/provider-nodes", {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        prefix: input.prefix,
        baseUrl: input.baseUrl,
        apiType: input.apiType ?? "chat",
        type: "openai-compatible",
      }),
    });
    if (!response.ok) throw new Error(`create provider node: ${await this.detail(response)}`);
    const body = (await response.json()) as { node?: { id?: unknown } };
    if (typeof body.node?.id !== "string") {
      throw new Error("provider node response did not include an id");
    }
    return { id: body.node.id, created: true };
  }
}