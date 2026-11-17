import { describe, expect, it } from "vitest";
import { detectLocalServers, probeLocalServers, LOCAL_SERVERS } from "../src/core/local.js";

function fakeFetch(reachablePorts: number[]): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const reachable = reachablePorts.some((port) => url.includes(`:${port}/`));
    return { ok: reachable } as Response;
  }) as typeof fetch;
}

describe("probeLocalServers", () => {
  it("probes every known engine port", async () => {
    const probes = await probeLocalServers(fakeFetch([]));
    expect(probes.map((p) => p.port).sort()).toEqual(
      LOCAL_SERVERS.map((s) => s.port).sort(),
    );
    expect(probes.every((p) => p.reachable === false)).toBe(true);
  });

  it("marks reachable servers", async () => {
    const probes = await probeLocalServers(fakeFetch([11434]));
    const ollama = probes.find((p) => p.engine === "ollama");
    expect(ollama?.reachable).toBe(true);
    expect(ollama?.detail).toContain("ollama");
  });

  it("treats a thrown fetch as unreachable", async () => {
    const throwing = (async () => {
      throw new Error("connection refused");
    }) as unknown as typeof fetch;
    const probes = await probeLocalServers(throwing);
    expect(probes.every((p) => p.reachable === false)).toBe(true);
  });
});

describe("detectLocalServers", () => {
  it("returns only reachable servers", async () => {
    const detected = await detectLocalServers(fakeFetch([8080, 8093]));
    expect(detected.map((d) => d.engine).sort()).toEqual(["kindi", "llama.cpp"]);
  });
});