/** Persistent Letty preferences; Codex app-server owns threads and transcripts. */

import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export class SettingsStore {
  constructor(path = defaultSettingsPath()) {
    this.path = path;
    this.values = readSettings(path) ?? readLegacySettings(join(dirname(path), "threads.sqlite"));
  }

  get(key: string): string | null {
    return this.values[key] ?? null;
  }

  set(key: string, value: string): void {
    this.values[key] = value;
    mkdirSync(dirname(this.path), { recursive: true });
    const temporaryPath = `${this.path}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(this.values, null, 2)}\n`);
    renameSync(temporaryPath, this.path);
  }

  private readonly path: string;
  private readonly values: Record<string, string>;
}

function readSettings(path: string): Record<string, string> | null {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return null;
  }
}

function readLegacySettings(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  try {
    const database = new Database(path, { readonly: true, strict: true });
    const rows = database.query("SELECT key, value FROM settings").all() as Array<{
      key: string;
      value: string;
    }>;
    database.close();
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  } catch {
    return {};
  }
}

function defaultSettingsPath(): string {
  const home = process.env.LTY_HOME ?? join(homedir(), ".lty");
  return join(home, "settings.json");
}
