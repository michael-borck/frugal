export type LocalEngine = "ollama" | "llama.cpp" | "kindi";

export interface LocalServerSpec {
  engine: LocalEngine;
  port: number;
}

/** Ports the spec names: Ollama 11434, llama.cpp server 8080, Kindi 8093. */
export const LOCAL_SERVERS: LocalServerSpec[] = [
  { engine: "ollama", port: 11434 },
  { engine: "llama.cpp", port: 8080 },
  { engine: "kindi", port: 8093 },
];

export interface LocalProbe extends LocalServerSpec {
  baseUrl: string;
  reachable: boolean;
  detail: string;
}

function baseUrlFor(port: number): string {
  return `http://127.0.0.1:${port}`;
}

/**
 * Probe the usual local model-server ports for an OpenAI-compatible /v1/models
 * endpoint. Uses the student's own machine only; never a cloud call.
 */
export async function probeLocalServers(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 1500,
): Promise<LocalProbe[]> {
  const results: LocalProbe[] = [];

  await Promise.all(
    LOCAL_SERVERS.map(async ({ engine, port }) => {
      const baseUrl = baseUrlFor(port);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let reachable = false;
      let detail = `no server on ${baseUrl}`;
      try {
        const response = await fetchImpl(`${baseUrl}/v1/models`, {
          signal: controller.signal,
        });
        reachable = response.ok;
        detail = reachable
          ? `${engine} reachable at ${baseUrl}`
          : `${engine} responded on ${baseUrl} but not with /v1/models`;
      } catch {
        reachable = false;
        detail = `no server on ${baseUrl}`;
      } finally {
        clearTimeout(timer);
      }
      results.push({ engine, port, baseUrl, reachable, detail });
    }),
  );

  return results.sort((a, b) => a.port - b.port);
}

export async function detectLocalServers(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 1500,
): Promise<LocalProbe[]> {
  const probes = await probeLocalServers(fetchImpl, timeoutMs);
  return probes.filter((probe) => probe.reachable);
}