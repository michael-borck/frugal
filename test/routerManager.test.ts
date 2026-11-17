import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  RouterManager,
  routerPaths,
  type CommandResult,
} from "../src/core/routerManager.js";

interface Harness {
  manager: RouterManager;
  calls: string[];
  killed: number[];
  setHealthy(value: boolean): void;
}

async function makeHarness(options: {
  installed?: boolean;
  healthy?: boolean;
  installCode?: number;
  spawnPid?: number;
  becomeHealthyOnSpawn?: boolean;
} = {}): Promise<{ dir: string; harness: Harness }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "frugal-router-"));
  const calls: string[] = [];
  const killed: number[] = [];
  let healthy = options.healthy ?? false;
  let installed = options.installed ?? false;

  const run = async (command: string, args: string[]): Promise<CommandResult> => {
    calls.push(`run:${command}:${args.join(" ")}`);
    if (args[0] === "install") installed = true;
    return { code: options.installCode ?? 0, stdout: "", stderr: "" };
  };

  const manager = new RouterManager({
    configDir: dir,
    healthAttempts: 3,
    healthIntervalMs: 1,
    health: async () => healthy,
    isInstalled: async () => installed,
    run,
    spawnDetached: async () => {
      calls.push("spawn");
      if (options.becomeHealthyOnSpawn) healthy = true;
      return { pid: options.spawnPid ?? 4242 };
    },
    kill: (pid) => {
      killed.push(pid);
      healthy = false;
    },
    sleep: async () => {},
  });

  return {
    dir,
    harness: {
      manager,
      calls,
      killed,
      setHealthy: (value) => {
        healthy = value;
      },
    },
  };
}

describe("RouterManager", () => {
  let dir: string;
  let harness: Harness | undefined;

  afterEach(async () => {
    if (dir) await fs.rm(dir, { recursive: true, force: true });
    harness = undefined;
  });

  it("installs then spawns when not installed, and reports started", async () => {
    const made = await makeHarness({ installed: false, becomeHealthyOnSpawn: true });
    dir = made.dir;
    harness = made.harness;

    const result = await harness.manager.start();
    expect(result.started).toBe(true);
    expect(result.alreadyRunning).toBe(false);
    expect(harness.calls.some((c) => c.startsWith("run:npm:install 9router@"))).toBe(true);
    expect(harness.calls).toContain("spawn");
  });

  it("skips install when already installed", async () => {
    const made = await makeHarness({ installed: true, becomeHealthyOnSpawn: true });
    dir = made.dir;
    harness = made.harness;

    await harness.manager.start();
    expect(harness.calls.some((c) => c.includes("install"))).toBe(false);
  });

  it("does nothing when already running", async () => {
    const made = await makeHarness({ healthy: true });
    dir = made.dir;
    harness = made.harness;

    const result = await harness.manager.start();
    expect(result.alreadyRunning).toBe(true);
    expect(harness.calls).toEqual([]);
  });

  it("reports a failed install", async () => {
    const made = await makeHarness({ installed: false, installCode: 1 });
    dir = made.dir;
    harness = made.harness;

    const result = await harness.manager.start();
    expect(result.started).toBe(false);
    expect(result.detail).toMatch(/install failed/);
  });

  it("stops the process recorded in the pidfile", async () => {
    const made = await makeHarness({ healthy: true });
    dir = made.dir;
    harness = made.harness;

    const rp = routerPaths(dir);
    await fs.writeFile(rp.pidFile, "1234\n");

    const result = await harness.manager.stop();
    expect(result.stopped).toBe(true);
    expect(harness.killed).toEqual([1234]);
    await expect(fs.access(rp.pidFile)).rejects.toBeTruthy();
  });

  it("stop is harmless when nothing is running", async () => {
    const made = await makeHarness({});
    dir = made.dir;
    harness = made.harness;

    const result = await harness.manager.stop();
    expect(result.stopped).toBe(true);
    expect(harness.killed).toEqual([]);
  });

  it("passes DATA_DIR and INITIAL_PASSWORD through to 9Router", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "frugal-router-env-"));
    const originalData = process.env.FRUGAL_ROUTER_DATA_DIR;
    const originalPassword = process.env.FRUGAL_ROUTER_INITIAL_PASSWORD;
    process.env.FRUGAL_ROUTER_DATA_DIR = path.join(tmp, "nine-data");
    process.env.FRUGAL_ROUTER_INITIAL_PASSWORD = "test-pw";
    let captured: NodeJS.ProcessEnv | undefined;
    let healthy = false;
    try {
      const manager = new RouterManager({
        configDir: tmp,
        healthAttempts: 1,
        healthIntervalMs: 1,
        health: async () => healthy,
        isInstalled: async () => true,
        spawnDetached: async (_command, _args, options) => {
          captured = options.env;
          healthy = true;
          return { pid: 99 };
        },
        kill: () => {},
        sleep: async () => {},
      });
      await manager.start();
    } finally {
      if (originalData == null) delete process.env.FRUGAL_ROUTER_DATA_DIR;
      else process.env.FRUGAL_ROUTER_DATA_DIR = originalData;
      if (originalPassword == null) delete process.env.FRUGAL_ROUTER_INITIAL_PASSWORD;
      else process.env.FRUGAL_ROUTER_INITIAL_PASSWORD = originalPassword;
      await fs.rm(tmp, { recursive: true, force: true });
    }
    expect(captured?.DATA_DIR).toBe(path.join(tmp, "nine-data"));
    expect(captured?.INITIAL_PASSWORD).toBe("test-pw");
  });
});