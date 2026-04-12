/** Debug log sink used by runtime instrumentation and smoke tooling. */

import { mkdirSync } from "fs";
import { dirname } from "path";

function createLogWriter() {
  const logPath = process.env.LETUI_DEBUG_LOG_PATH;
  if (!logPath) {
    return {
      write(..._args: unknown[]) {},
      flush(..._args: unknown[]) {},
    };
  }

  try {
    ensureParentDir(logPath);
    return Bun.file(logPath).writer();
  } catch {
    return {
      write(..._args: unknown[]) {},
      flush(..._args: unknown[]) {},
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
