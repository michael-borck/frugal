import { promises as fs } from "node:fs";
import * as path from "node:path";

const BACKUP_SUFFIX = ".frugal-backup";

export interface IntegrationTarget {
  name: string;
  configPath: string;
}

export interface IntegrationResult {
  name: string;
  changed: boolean;
  backedUp: boolean;
  configPath: string;
  detail: string;
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * Back up a config file exactly once. Subsequent calls leave the first backup
 * untouched, so uninstall can always restore the student's original bytes.
 */
export async function backupOnce(file: string): Promise<boolean> {
  if (!(await fileExists(file))) return false;
  const backup = `${file}${BACKUP_SUFFIX}`;
  if (await fileExists(backup)) return false;
  await fs.copyFile(file, backup);
  return true;
}

export async function restoreBackup(file: string): Promise<boolean> {
  const backup = `${file}${BACKUP_SUFFIX}`;
  if (!(await fileExists(backup))) return false;
  await fs.copyFile(backup, file);
  return true;
}

export async function readJson<T>(file: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tmp, file);
}

export async function writeTextAtomic(file: string, value: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, value, "utf8");
  await fs.rename(tmp, file);
}

export { path };