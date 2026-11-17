import { promises as fs, closeSync, openSync } from "node:fs";
import { execFile, spawn } from "node:child_process";
import * as path from "node:path";
import { ROUTER_PORT } from "./types.js";
import { HttpRouterClient } from "./routerClient.js";

export const NINE_ROUTER_PACKAGE = "9router";
export const NINE_ROUTER_VERSION = "0.5.116";

export interface RouterPaths {
  dir: string;
  binPath: string;
  pidFile: string;
  logFile: string;
}

export function routerPaths(
  configDir: string,
  platform: NodeJS.Platform = process.platform,
): RouterPaths {
  const dir = path.join(configDir, "router");
  const binName = platform === "win32" ? "9router.cmd" : "9router";
  return {
    dir,
    binPath: path.join(dir, "node_modules", ".bin", binName),
    pidFile: path.join(configDir, "router.pid"),
    logFile: path.join(configDir, "router.log"),
  };
}

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface SpawnResult {
  pid?: number;
}

export interface StartResult {
  started: boolean;
  alreadyRunning: boolean;
  pid?: number;
  detail: string;
}

export interface StopResult {
  stopped: boolean;
  detail: string;
}

export interface RouterLifecycle {
  isRunning(): Promise<boolean>;
  isInstalled(): Promise<boolean>;
  install(): Promise<CommandResult>;
  start(): Promise<StartResult>;
  stop(): Promise<StopResult>;
  uninstall(): Promise<void>;
}

export interface RouterManagerOptions {
  configDir: string;
  pin?: string;
  platform?: NodeJS.Platform;
  health?: () => Promise<boolean>;
  run?: (
    command: string,
    args: string[],
    options: { cwd?: string; env?: NodeJS.ProcessEnv },
  ) => Promise<CommandResult>;
  spawnDetached?: (
    command: string,
    args: string[],
    options: { cwd?: string; env?: NodeJS.ProcessEnv; logFile: string },
  ) => Promise<SpawnResult>;
  kill?: (pid: number) => void;
  sleep?: (ms: number) => Promise<void>;
  isInstalled?: () => Promise<boolean>;
  healthAttempts?: number;
  healthIntervalMs?: number;
}

function defaultRun(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv },
): Promise<CommandResult> {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { cwd: options.cwd, env: options.env, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const code =
          error && typeof (error as NodeJS.ErrnoException).code === "number"
            ? Number((error as NodeJS.ErrnoException).code)
            : error
              ? 1
              : 0;
        resolve({ code, stdout: String(stdout ?? ""), stderr: String(stderr ?? "") });
      },
    );
  });
}

async function defaultSpawnDetached(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; logFile: string },
): Promise<SpawnResult> {
  await fs.mkdir(path.dirname(options.logFile), { recursive: true });
  const fd = openSync(options.logFile, "a");
  try {
    const child = spawn(command, args, {
      detached: true,
      stdio: ["ignore", fd, fd],
      cwd: options.cwd,
      env: options.env,
    });
    child.unref();
    return { pid: child.pid };
  } finally {
    closeSync(fd);
  }
}

/**
 * Manages a pinned 9Router installation and process.
 *
 * Install is local to frugal's own directory (npm --prefix), never global, so it
 * needs no sudo and uninstalls cleanly. The process is spawned detached with a
 * pidfile and a logfile, which works the same on macOS, Linux and Windows.
 */
export class RouterManager implements RouterLifecycle {
  private readonly paths: RouterPaths;
  private readonly pin: string;
  private readonly platform: NodeJS.Platform;
  private readonly health: () => Promise<boolean>;
  private readonly run: NonNullable<RouterManagerOptions["run"]>;
  private readonly spawnDetached: NonNullable<RouterManagerOptions["spawnDetached"]>;
  private readonly killFn: (pid: number) => void;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly installed: () => Promise<boolean>;
  private readonly attempts: number;
  private readonly intervalMs: number;

  constructor(options: RouterManagerOptions) {
    this.platform = options.platform ?? process.platform;
    this.paths = routerPaths(options.configDir, this.platform);
    this.pin = options.pin ?? NINE_ROUTER_VERSION;
    this.health = options.health ?? (() => new HttpRouterClient().health());
    this.run = options.run ?? defaultRun;
    this.spawnDetached = options.spawnDetached ?? defaultSpawnDetached;
    this.killFn = options.kill ?? ((pid) => process.kill(pid, "SIGTERM"));
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.installed =
      options.isInstalled ??
      (async () => {
        try {
          await fs.access(this.paths.binPath);
          return true;
        } catch {
          return false;
        }
      });
    this.attempts = options.healthAttempts ?? 40;
    this.intervalMs = options.healthIntervalMs ?? 500;
  }

  private npm(): string {
    return this.platform === "win32" ? "npm.cmd" : "npm";
  }

  private env(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      PORT: String(ROUTER_PORT),
      HOSTNAME: "127.0.0.1",
      NEXT_PUBLIC_BASE_URL: `http://127.0.0.1:${ROUTER_PORT}`,
    };
  }

  isRunning(): Promise<boolean> {
    return this.health();
  }

  isInstalled(): Promise<boolean> {
    return this.installed();
  }

  install(): Promise<CommandResult> {
    return this.run(
      this.npm(),
      [
        "install",
        `${NINE_ROUTER_PACKAGE}@${this.pin}`,
        "--prefix",
        this.paths.dir,
        "--no-audit",
        "--no-fund",
        "--loglevel=error",
      ],
      { env: this.env() },
    );
  }

  private async readPid(): Promise<number | undefined> {
    try {
      const raw = await fs.readFile(this.paths.pidFile, "utf8");
      const pid = Number.parseInt(raw.trim(), 10);
      return Number.isInteger(pid) && pid > 0 ? pid : undefined;
    } catch {
      return undefined;
    }
  }

  private async writePid(pid: number | undefined): Promise<void> {
    if (pid == null) return;
    await fs.mkdir(path.dirname(this.paths.pidFile), { recursive: true });
    await fs.writeFile(this.paths.pidFile, `${pid}\n`, "utf8");
  }

  private async clearPid(): Promise<void> {
    await fs.rm(this.paths.pidFile, { force: true });
  }

  private async waitUntilHealthy(): Promise<boolean> {
    for (let attempt = 0; attempt < this.attempts; attempt += 1) {
      if (await this.health()) return true;
      await this.sleep(this.intervalMs);
    }
    return false;
  }

  async start(): Promise<StartResult> {
    if (await this.health()) {
      return { started: false, alreadyRunning: true, detail: "9Router is already running" };
    }
    if (!(await this.isInstalled())) {
      const install = await this.install();
      if (install.code !== 0) {
        return {
          started: false,
          alreadyRunning: false,
          detail: `install failed: ${install.stderr || install.stdout}`.trim(),
        };
      }
    }
    const spawned = await this.spawnDetached(this.paths.binPath, [], {
      cwd: this.paths.dir,
      env: this.env(),
      logFile: this.paths.logFile,
    });
    await this.writePid(spawned.pid);
    const healthy = await this.waitUntilHealthy();
    return {
      started: healthy,
      alreadyRunning: false,
      pid: spawned.pid,
      detail: healthy
        ? `9Router started on 127.0.0.1:${ROUTER_PORT}`
        : `9Router did not become healthy; see ${this.paths.logFile}`,
    };
  }

  async stop(): Promise<StopResult> {
    const pid = await this.readPid();
    if (pid != null) {
      try {
        this.killFn(pid);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "ESRCH") {
          return { stopped: false, detail: `could not stop pid ${pid}: ${code ?? "error"}` };
        }
      }
    }
    await this.clearPid();
    return {
      stopped: true,
      detail: pid != null ? `stopped pid ${pid}` : "9Router was not running",
    };
  }

  async uninstall(): Promise<void> {
    await this.stop();
    await fs.rm(this.paths.dir, { recursive: true, force: true });
    await fs.rm(this.paths.logFile, { force: true });
  }
}