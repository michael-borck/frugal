import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as path from "node:path";
import { defaultPaths } from "../core/config.js";
import { type Command, type CommandContext, UsageError } from "./command.js";
import { statusCommand } from "./commands/status.js";
import { doctorCommand } from "./commands/doctor.js";
import { setupCommand } from "./commands/setup.js";
import { startCommand, stopCommand } from "./commands/service.js";
import { refreshCommand } from "./commands/refresh.js";
import {
  modelsCommand,
  makeOverrideCommand,
  isOverrideName,
} from "./commands/models.js";
import {
  tierCommand,
  localCommand,
  providersCommand,
  reportCommand,
  updateCommand,
  uninstallCommand,
} from "./commands/settings.js";

function version(): string {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(
      readFileSync(path.join(here, "..", "..", "package.json"), "utf8"),
    ) as { version: string };
    return pkg.version;
  } catch {
    return "0.0.0";
  }
}

const COMMANDS: Command[] = [
  setupCommand,
  statusCommand,
  doctorCommand,
  startCommand,
  stopCommand,
  refreshCommand,
  modelsCommand,
  makeOverrideCommand("prefer"),
  makeOverrideCommand("ban"),
  makeOverrideCommand("lock"),
  makeOverrideCommand("reset"),
  tierCommand,
  localCommand,
  providersCommand,
  reportCommand,
  updateCommand,
  uninstallCommand,
];

function help(): string {
  const lines = ["frugal — a working, auto-failover coding setup", "", "Usage: frugal <command> [args] [--json]", ""];
  const groups: Array<Command["group"]> = [
    "Everyday",
    "Models",
    "Settings",
    "Providers",
    "Upkeep",
  ];
  for (const group of groups) {
    lines.push(group);
    for (const command of COMMANDS.filter((c) => c.group === group)) {
      lines.push(`  ${command.name.padEnd(12)} ${command.summary}`);
    }
    lines.push("");
  }
  lines.push("Run frugal on its own to print status and the everyday commands.");
  return lines.join("\n");
}

function defaults(ctx: CommandContext, args: string[]): string[] {
  const rest: string[] = [];
  for (const arg of args) {
    if (arg === "--json") ctx.json = true;
    else rest.push(arg);
  }
  return rest;
}

export async function main(argv: string[]): Promise<number> {
  const ctx: CommandContext = { paths: defaultPaths(), json: false };
  const args = defaults(ctx, argv);

  if (args.length === 0) {
    await statusCommand.run(ctx, []);
    process.stdout.write("\n" + help() + "\n");
    return 0;
  }

  if (args[0] === "--help" || args[0] === "-h" || args[0] === "help") {
    process.stdout.write(help() + "\n");
    return 0;
  }
  if (args[0] === "--version" || args[0] === "-v") {
    process.stdout.write(`${version()}\n`);
    return 0;
  }

  const name = args[0]!;
  const command = COMMANDS.find((c) => c.name === name);

  if (!command && isOverrideName(name)) {
    throw new UsageError(`unknown command: ${name}`);
  }
  if (!command) {
    process.stderr.write(`Unknown command: ${name}\n\n${help()}\n`);
    return 2;
  }

  try {
    return await command.run(ctx, args.slice(1));
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`Error: ${error.message}\n`);
      return 2;
    }
    process.stderr.write(`Error: ${(error as Error).message}\n`);
    return 1;
  }
}

const invokedDirectly = process.argv[1] && /frugal|cli\/index/.test(process.argv[1]);
if (invokedDirectly) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      process.stderr.write(`Fatal: ${(error as Error).stack ?? String(error)}\n`);
      process.exitCode = 1;
    });
}