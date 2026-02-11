const logFile = Bun.file("dump/logs.txt");
export const logWriter = logFile.writer();

export function log(txt: string, ...args: string[]) {
  logWriter.write(txt + " " + args.join(" ") + "\n");
}
