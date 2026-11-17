import { describe, expect, it } from "vitest";
import { validateProviderKey } from "../src/core/validateKey.js";

function fakeFetch(status: number): typeof fetch {
  return (async () => ({ ok: status >= 200 && status < 300, status }) as Response) as typeof fetch;
}

describe("validateProviderKey", () => {
  it("accepts a 200 response", async () => {
    const result = await validateProviderKey("openrouter", "sk-or-test", fakeFetch(200));
    expect(result.ok).toBe(true);
  });

  it("reports a rejected key on 401", async () => {
    const result = await validateProviderKey("groq", "bad", fakeFetch(401));
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/rejected/);
  });

  it("reports other statuses", async () => {
    const result = await validateProviderKey("openrouter", "x", fakeFetch(500));
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("500");
  });

  it("reports an empty key without calling the network", async () => {
    let called = false;
    const spy = (async () => {
      called = true;
      return { ok: true, status: 200 } as Response;
    }) as typeof fetch;
    const result = await validateProviderKey("openrouter", "", spy);
    expect(result.ok).toBe(false);
    expect(called).toBe(false);
  });

  it("handles a network error", async () => {
    const throwing = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const result = await validateProviderKey("groq", "key", throwing);
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/could not reach/);
  });
});