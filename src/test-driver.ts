import { existsSync, lstatSync, unlinkSync } from "fs";

export type TestDriverId = string | number | undefined;

export type TestDriverCommand =
  | { id?: TestDriverId; cmd: "ping" }
  | { id?: TestDriverId; cmd: "sleep"; ms: number }
  | { id?: TestDriverId; cmd: "key"; data: string }
  | {
      id?: TestDriverId;
      cmd: "mouse";
      kind: "press" | "release" | "click";
      x: number;
      y: number;
      btn?: number;
    }
  | { id?: TestDriverId; cmd: "snapshot" }
  | { id?: TestDriverId; cmd: "focused" }
  | { id?: TestDriverId; cmd: "quit" };

type TestDriverOkResponse = {
  id?: TestDriverId;
  ok: true;
  result?: unknown;
};

type TestDriverErrorResponse = {
  id?: TestDriverId;
  ok: false;
  error: string;
};

type TestDriverResponse = TestDriverOkResponse | TestDriverErrorResponse;

type SocketData = {
  pending: string;
};

function removeSocketFile(socketPath: string): void {
  if (!existsSync(socketPath)) return;

  let stat: ReturnType<typeof lstatSync>;
  try {
    stat = lstatSync(socketPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }

  if (!stat.isSocket()) {
    throw new Error(`Refusing to remove non-socket path: ${socketPath}`);
  }

  try {
    unlinkSync(socketPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
}

function sendResponse(socket: Bun.Socket<SocketData>, response: TestDriverResponse): void {
  socket.write(`${JSON.stringify(response)}\n`);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function parseCommand(payload: unknown): TestDriverCommand {
  if (!payload || typeof payload !== "object") {
    throw new Error("invalid command payload");
  }

  const data = payload as Record<string, unknown>;
  const cmd = data.cmd;
  const id =
    typeof data.id === "string" || typeof data.id === "number"
      ? data.id
      : undefined;

  if (cmd === "ping") {
    return { id, cmd };
  }
  if (cmd === "snapshot") {
    return { id, cmd };
  }
  if (cmd === "focused") {
    return { id, cmd };
  }
  if (cmd === "quit") {
    return { id, cmd };
  }
  if (cmd === "sleep") {
    if (!isFiniteNumber(data.ms) || data.ms < 0) {
      throw new Error("sleep.ms must be a non-negative number");
    }
    return { id, cmd, ms: data.ms };
  }
  if (cmd === "key") {
    if (typeof data.data !== "string") {
      throw new Error("key.data must be a string");
    }
    return { id, cmd, data: data.data };
  }
  if (cmd === "mouse") {
    const kind = data.kind;
    const btn = data.btn;
    if (kind !== "press" && kind !== "release" && kind !== "click") {
      throw new Error("mouse.kind must be press|release|click");
    }
    if (!isFiniteNumber(data.x) || !isFiniteNumber(data.y)) {
      throw new Error("mouse x/y must be finite numbers");
    }
    if (btn !== undefined && !isFiniteNumber(btn)) {
      throw new Error("mouse.btn must be a finite number");
    }
    return {
      id,
      cmd,
      kind,
      x: data.x,
      y: data.y,
      btn,
    };
  }

  throw new Error("unknown command");
}

export type TestDriverServer = {
  stop: () => void;
};

export function startTestDriver(
  socketPath: string,
  onCommand: (command: TestDriverCommand) => Promise<unknown> | unknown,
): TestDriverServer {
  removeSocketFile(socketPath);

  const server = Bun.listen<SocketData>({
    unix: socketPath,
    data: { pending: "" },
    socket: {
      open(socket) {
        socket.data = { pending: "" };
      },
      async data(socket, chunk) {
        socket.data.pending += chunk.toString();

        let newlineIndex = socket.data.pending.indexOf("\n");
        while (newlineIndex !== -1) {
          const line = socket.data.pending.slice(0, newlineIndex).trim();
          socket.data.pending = socket.data.pending.slice(newlineIndex + 1);

          if (line.length > 0) {
            let parsed: TestDriverCommand;
            try {
              parsed = parseCommand(JSON.parse(line));
            } catch (error) {
              sendResponse(socket, {
                ok: false,
                error:
                  error instanceof Error ? error.message : "failed to parse command",
              });
              newlineIndex = socket.data.pending.indexOf("\n");
              continue;
            }

            try {
              const result = await onCommand(parsed);
              sendResponse(socket, { id: parsed.id, ok: true, result });
            } catch (error) {
              sendResponse(socket, {
                id: parsed.id,
                ok: false,
                error: error instanceof Error ? error.message : "command failed",
              });
            }
          }

          newlineIndex = socket.data.pending.indexOf("\n");
        }
      },
    },
  });

  return {
    stop() {
      server.stop(true);
      removeSocketFile(socketPath);
    },
  };
}
