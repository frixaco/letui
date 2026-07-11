/** Local SQLite thread index: Codex session IDs, rendered transcript, and cross-thread references. */

import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export class ThreadStore {
  constructor(path = defaultDatabasePath()) {
    mkdirSync(dirname(path), { recursive: true });
    this.database = new Database(path, { create: true, strict: true });
    this.database.exec("PRAGMA journal_mode = WAL");
    this.database.exec("PRAGMA foreign_keys = ON");
    this.database.exec("PRAGMA busy_timeout = 3000");
    this.migrate();
  }

  createThread(input: NewThread): LocalThread {
    const now = Date.now();
    const thread: LocalThread = {
      id: `T-${crypto.randomUUID()}`,
      codexThreadId: input.codexThreadId,
      title: "New thread",
      cwd: input.cwd,
      model: input.model,
      effort: input.effort,
      archived: false,
      createdAt: now,
      updatedAt: now,
    };

    this.database.run(
      `INSERT INTO threads
        (id, codex_thread_id, title, cwd, model, effort, archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        thread.id,
        thread.codexThreadId,
        thread.title,
        thread.cwd,
        thread.model,
        thread.effort,
        thread.createdAt,
        thread.updatedAt,
      ],
    );
    return thread;
  }

  listThreads(options: { archived?: boolean; cwd?: string } = {}): LocalThread[] {
    const conditions = ["archived = ?"];
    const values: Array<string | number> = [options.archived ? 1 : 0];
    if (options.cwd) {
      conditions.push("cwd = ?");
      values.push(options.cwd);
    }

    const rows = this.database
      .query(
        `SELECT id, codex_thread_id, title, cwd, model, effort, archived, created_at, updated_at
         FROM threads
         WHERE ${conditions.join(" AND ")}
         ORDER BY updated_at DESC`,
      )
      .all(...values) as ThreadRow[];
    return rows.map(threadFromRow);
  }

  getThread(id: string): LocalThread | null {
    const row = this.database
      .query(
        `SELECT id, codex_thread_id, title, cwd, model, effort, archived, created_at, updated_at
         FROM threads
         WHERE id = ? OR codex_thread_id = ?
         LIMIT 1`,
      )
      .get(id, id) as ThreadRow | null;
    return row ? threadFromRow(row) : null;
  }

  updateThread(id: string, patch: Partial<Pick<LocalThread, "title" | "model" | "effort">>): void {
    const current = this.getThread(id);
    if (!current) return;
    this.database.run(
      `UPDATE threads SET title = ?, model = ?, effort = ?, updated_at = ? WHERE id = ?`,
      [
        patch.title ?? current.title,
        patch.model ?? current.model,
        patch.effort ?? current.effort,
        Date.now(),
        id,
      ],
    );
  }

  archiveThread(id: string, archived = true): void {
    this.database.run("UPDATE threads SET archived = ?, updated_at = ? WHERE id = ?", [
      archived ? 1 : 0,
      Date.now(),
      id,
    ]);
  }

  saveMessage(threadId: string, message: StoredMessage): void {
    const now = message.createdAt ?? Date.now();
    this.database.run(
      `INSERT INTO messages
        (id, thread_id, role, kind, text, detail, status, turn_id, item_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(thread_id, item_id, kind) DO UPDATE SET
         role = excluded.role,
         text = excluded.text,
         detail = excluded.detail,
         status = excluded.status,
         turn_id = excluded.turn_id`,
      [
        message.id,
        threadId,
        message.role,
        message.kind,
        message.text,
        message.detail,
        message.status,
        message.turnId,
        message.itemId,
        now,
      ],
    );
    this.database.run("UPDATE threads SET updated_at = ? WHERE id = ?", [Date.now(), threadId]);
  }

  listMessages(threadId: string): LocalMessage[] {
    return this.database
      .query(
        `SELECT id, role, kind, text, detail, status, turn_id, item_id, created_at
         FROM messages
         WHERE thread_id = ?
         ORDER BY sequence ASC`,
      )
      .all(threadId)
      .map((value) => messageFromRow(value as MessageRow));
  }

  addReference(sourceThreadId: string, targetThreadId: string): void {
    if (sourceThreadId === targetThreadId) return;
    this.database.run(
      `INSERT OR IGNORE INTO thread_references (source_thread_id, target_thread_id, created_at)
       VALUES (?, ?, ?)`,
      [sourceThreadId, targetThreadId, Date.now()],
    );
  }

  referenceContext(ids: readonly string[], sourceThreadId?: string): string {
    const uniqueThreads = [...new Set(ids)]
      .map((id) => this.getThread(id))
      .filter((thread): thread is LocalThread => thread !== null);
    if (uniqueThreads.length === 0) return "";

    const sections: string[] = [];
    let remaining = 24_000;
    for (const thread of uniqueThreads) {
      if (sourceThreadId) this.addReference(sourceThreadId, thread.id);
      const conversation = dedupeReconstructedMessages(
        this.listMessages(thread.id).filter(
          (message) => message.role === "user" || message.role === "assistant",
        ),
      )
        .map((message) => `${message.role.toUpperCase()}: ${message.text}`)
        .join("\n\n");
      const section = `THREAD ${thread.id} — ${thread.title}\n${conversation}`.slice(0, remaining);
      if (!section) break;
      sections.push(section);
      remaining -= section.length;
      if (remaining <= 0) break;
    }

    return sections.length > 0
      ? `\n\n<referenced_local_threads>\n${sections.join("\n\n---\n\n")}\n</referenced_local_threads>`
      : "";
  }

  getSetting(key: string): string | null {
    const row = this.database.query("SELECT value FROM settings WHERE key = ?").get(key) as {
      value: string;
    } | null;
    return row?.value ?? null;
  }

  setSetting(key: string, value: string): void {
    this.database.run(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value],
    );
  }

  close(): void {
    this.database.close();
  }

  private readonly database: Database;

  private migrate(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY,
        codex_thread_id TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        cwd TEXT NOT NULL,
        model TEXT NOT NULL,
        effort TEXT NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        kind TEXT NOT NULL,
        text TEXT NOT NULL,
        detail TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL,
        turn_id TEXT,
        item_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(thread_id, item_id, kind)
      );

      CREATE TABLE IF NOT EXISTS thread_references (
        source_thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
        target_thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        PRIMARY KEY(source_thread_id, target_thread_id)
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS messages_thread_sequence
        ON messages(thread_id, sequence);
      CREATE INDEX IF NOT EXISTS threads_recency
        ON threads(archived, updated_at DESC);
    `);
  }
}

export type LocalThread = {
  id: string;
  codexThreadId: string;
  title: string;
  cwd: string;
  model: string;
  effort: string;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
};

export type LocalMessage = {
  id: string;
  role: MessageRole;
  kind: string;
  text: string;
  detail: string;
  status: MessageStatus;
  turnId: string | null;
  itemId: string;
  createdAt: number;
};

export type StoredMessage = Omit<LocalMessage, "createdAt"> & { createdAt?: number };

type NewThread = Pick<LocalThread, "codexThreadId" | "cwd" | "model" | "effort">;
type MessageRole = "user" | "assistant" | "system" | "tool";
type MessageStatus = "running" | "completed" | "failed" | "queued" | "interrupted";

type ThreadRow = {
  id: string;
  codex_thread_id: string;
  title: string;
  cwd: string;
  model: string;
  effort: string;
  archived: number;
  created_at: number;
  updated_at: number;
};

type MessageRow = {
  id: string;
  role: MessageRole;
  kind: string;
  text: string;
  detail: string;
  status: MessageStatus;
  turn_id: string | null;
  item_id: string;
  created_at: number;
};

function threadFromRow(row: ThreadRow): LocalThread {
  return {
    id: row.id,
    codexThreadId: row.codex_thread_id,
    title: row.title,
    cwd: row.cwd,
    model: row.model,
    effort: row.effort,
    archived: row.archived === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function messageFromRow(row: MessageRow): LocalMessage {
  return {
    id: row.id,
    role: row.role,
    kind: row.kind,
    text: row.text,
    detail: row.detail,
    status: row.status,
    turnId: row.turn_id,
    itemId: row.item_id,
    createdAt: row.created_at,
  };
}

function dedupeReconstructedMessages(messages: LocalMessage[]): LocalMessage[] {
  const seen = new Set<string>();
  return messages.filter((message) => {
    const fingerprint = `${message.turnId}\u0000${message.role}\u0000${message.kind}\u0000${message.text}`;
    if (message.itemId.startsWith("item-") && seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}

function defaultDatabasePath(): string {
  const home = process.env.LETUI_AGENT_HOME ?? join(homedir(), ".letui-agent");
  return join(home, "threads.sqlite");
}
