/** Codex app-server JSONL client: subscription auth and agent events over one child process. */

import type { FileSink } from "bun";

export class CodexAppServer {
  static async connect(options: CodexClientOptions = {}): Promise<CodexAppServer> {
    const client = new CodexAppServer(options);
    await client.initialize();
    return client;
  }

  readonly version = "0.1.0";

  onNotification(listener: RpcListener): () => void {
    this.notificationListeners.add(listener);
    return () => this.notificationListeners.delete(listener);
  }

  onServerRequest(listener: RpcListener): () => void {
    this.serverRequestListeners.add(listener);
    return () => this.serverRequestListeners.delete(listener);
  }

  onStderr(listener: (line: string) => void): () => void {
    this.stderrListeners.add(listener);
    return () => this.stderrListeners.delete(listener);
  }

  async request<T>(method: string, params?: unknown): Promise<T> {
    if (this.closed) {
      throw new Error("Codex app-server is not running");
    }

    const id = ++this.requestId;
    const result = new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex app-server timed out handling ${method}`));
      }, this.requestTimeoutMs);

      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timeout,
      });
    });

    this.write({ id, method, ...(params === undefined ? {} : { params }) });
    return result;
  }

  notify(method: string, params?: unknown): void {
    this.write({ method, ...(params === undefined ? {} : { params }) });
  }

  respond(id: RpcId, result: unknown): void {
    this.write({ id, result });
  }

  reject(id: RpcId, code: number, message: string): void {
    this.write({ id, error: { code, message } });
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.process.kill();
    this.stdin.end();
    this.rejectPending(new Error("Codex app-server stopped"));
  }

  private readonly process: ReturnType<typeof Bun.spawn>;
  private readonly stdin: FileSink;
  private readonly notificationListeners = new Set<RpcListener>();
  private readonly serverRequestListeners = new Set<RpcListener>();
  private readonly stderrListeners = new Set<(line: string) => void>();
  private readonly pending = new Map<number, PendingRequest>();
  private readonly requestTimeoutMs: number;
  private requestId = 0;
  private closed = false;

  private constructor(options: CodexClientOptions) {
    const executable = options.executable ?? process.env.CODEX_BIN ?? "codex";
    this.requestTimeoutMs = options.requestTimeoutMs ?? 60_000;
    const child = Bun.spawn([executable, "app-server", "--stdio"], {
      cwd: options.cwd,
      env: process.env,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    this.process = child;
    this.stdin = child.stdin;

    void this.readStream(child.stdout, (line) => this.handleLine(line));
    void this.readStream(child.stderr, (line) => {
      for (const listener of this.stderrListeners) listener(line);
    });
    void this.process.exited.then((code) => {
      if (this.closed) return;
      this.closed = true;
      this.rejectPending(new Error(`Codex app-server exited with status ${code}`));
    });
  }

  private async initialize(): Promise<void> {
    await this.request("initialize", {
      clientInfo: {
        name: "letui_agent",
        title: "LeTUI Agent",
        version: this.version,
      },
    });
    this.notify("initialized");
  }

  private write(message: Record<string, unknown>): void {
    this.stdin.write(`${JSON.stringify(message)}\n`);
    this.stdin.flush();
  }

  private async readStream(
    stream: ReadableStream<Uint8Array>,
    onLine: (line: string) => void,
  ): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) onLine(line);
        newline = buffer.indexOf("\n");
      }
    }

    const tail = `${buffer}${decoder.decode()}`.trim();
    if (tail) onLine(tail);
  }

  private handleLine(line: string): void {
    let message: RpcMessage;
    try {
      message = JSON.parse(line) as RpcMessage;
    } catch {
      for (const listener of this.stderrListeners) {
        listener("Codex app-server returned malformed JSON");
      }
      return;
    }

    if (message.id !== undefined && message.method === undefined) {
      const numericId = typeof message.id === "number" ? message.id : Number(message.id);
      const pending = this.pending.get(numericId);
      if (!pending) return;
      this.pending.delete(numericId);
      clearTimeout(pending.timeout);

      if (message.error) {
        pending.reject(new CodexRpcError(message.error.code, message.error.message));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    if (message.id !== undefined && message.method !== undefined) {
      for (const listener of this.serverRequestListeners) listener(message);
      return;
    }

    if (message.method !== undefined) {
      for (const listener of this.notificationListeners) listener(message);
    }
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

export class CodexRpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = "CodexRpcError";
  }
}

export type CodexClientOptions = {
  executable?: string;
  cwd?: string;
  requestTimeoutMs?: number;
};

export type RpcId = number | string;

export type RpcMessage = {
  id?: RpcId;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string };
};

export type CodexAccount =
  | { type: "chatgpt"; email: string; planType: string }
  | { type: "apiKey" }
  | null;

export type CodexModel = {
  id: string;
  model: string;
  displayName: string;
  description: string;
  isDefault: boolean;
  defaultReasoningEffort: string;
  supportedReasoningEfforts: Array<{
    reasoningEffort: string;
    description: string;
  }>;
};

export type CodexThread = {
  id: string;
  preview: string;
  cwd: string;
  name: string | null;
  turns: CodexTurn[];
};

export type CodexTurn = {
  id: string;
  status: "inProgress" | "completed" | "interrupted" | "failed";
  items: CodexThreadItem[];
  error: { message?: string } | null;
};

export type CodexThreadItem = {
  type: string;
  id: string;
  [key: string]: unknown;
};

export type RateLimitWindow = {
  usedPercent: number;
  windowDurationMins: number | null;
  resetsAt: number | null;
};

export type RateLimitSnapshot = {
  limitId: string | null;
  limitName: string | null;
  primary: RateLimitWindow | null;
  secondary: RateLimitWindow | null;
};

type RpcListener = (message: RpcMessage) => void;

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};
