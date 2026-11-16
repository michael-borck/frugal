import { type Paths } from "../core/config.js";

export interface CommandContext {
  paths: Paths;
  json: boolean;
}

export interface Command {
  name: string;
  summary: string;
  group: "Everyday" | "Models" | "Settings" | "Providers" | "Upkeep";
  run(ctx: CommandContext, args: string[]): Promise<number>;
}

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export function out(ctx: CommandContext, message: string): void {
  if (!ctx.json) process.stdout.write(`${message}\n`);
}

export function jsonOut(ctx: CommandContext, value: unknown): void {
  if (ctx.json) process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function nextStep(message: string): string {
  return `Next: ${message}`;
}