function createLogWriter() {
  try {
    return Bun.file("dump/logs.txt").writer();
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
