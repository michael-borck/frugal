import { ROUTER_HOST, ROUTER_PORT } from "./types.js";

export interface RouterCombo {
  name: string;
  models: string[];
}

export interface RouterClient {
  health(): Promise<boolean>;
  listCombos(): Promise<RouterCombo[]>;
  upsertCombo(combo: RouterCombo): Promise<void>;
  deleteCombo(name: string): Promise<void>;
}

export interface HttpOptions {
  baseUrl?: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

export class HttpRouterClient implements RouterClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpOptions = {}) {
    this.baseUrl = options.baseUrl ?? `http://${ROUTER_HOST}:${ROUTER_PORT}`;
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    headers.set("content-type", "application/json");
    if (this.apiKey) headers.set("authorization", `Bearer ${this.apiKey}`);
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, { ...init, headers });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`router ${path} failed: ${response.status} ${body}`.trim());
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  async health(): Promise<boolean> {
    try {
      await this.request<unknown>("/health");
      return true;
    } catch {
      return false;
    }
  }

  async listCombos(): Promise<RouterCombo[]> {
    return this.request<RouterCombo[]>("/combos");
  }

  async upsertCombo(combo: RouterCombo): Promise<void> {
    await this.request<void>("/combos", {
      method: "POST",
      body: JSON.stringify(combo),
    });
  }

  async deleteCombo(name: string): Promise<void> {
    await this.request<void>(`/combos/${encodeURIComponent(name)}`, { method: "DELETE" });
  }
}