/** Debug log sink used by runtime instrumentation and smoke tooling. */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import process from "node:process";

type LogWriter = {
  write: (...args: unknown[]) => void;
  flush: () => void;
};

function createLogWriter(): LogWriter {
  const logPath = process.env.LETUI_DEBUG_LOG_PATH;
  if (!logPath) {
    return {
      write(..._args: unknown[]) {},
      flush() {},
    };
  }

  try {
    ensureParentDir(logPath);
    return {
      write(...args: unknown[]) {
        appendFileSync(logPath, args.join(""), "utf8");
      },
      flush() {},
    };
  } catch {
    return {
      write(..._args: unknown[]) {},
      flush() {},
    };
  }
}

export const logWriter = createLogWriter();

export function log(txt: string, ...args: string[]) {
  logWriter.write(txt + " " + args.join(" ") + "\n");
}

function ensureParentDir(path: string): void {
  const parent = dirname(path);
  if (parent !== "." && parent.length > 0) {
    mkdirSync(parent, { recursive: true });
  }
}
