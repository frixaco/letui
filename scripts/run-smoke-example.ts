import { mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";

const SMOKE_KILL_SIGNAL = process.platform === "win32" ? "SIGTERM" : "SIGKILL";

export type SmokeRunOptions = {
  cols?: number;
  rows?: number;
  env?: Record<string, string | undefined>;
  screenPath: string;
  spawnArgs?: string[];
  spawnTimeoutMs?: number;
  scenario?: (ctx: { terminal: Bun.Terminal; output: () => string }) => Promise<void> | void;
};

export type SmokeRunResult = {
  exitCode: number;
  screen: string;
  raw: string;
};

function stripAnsi(input: string): string {
  return input
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b[@-_][0-?]*[ -/]*[@-~]/g, "")
    .replace(/\r/g, "");
}

function ensureParentDir(path: string): void {
  const parent = dirname(path);
  if (parent !== "." && parent.length > 0) {
    mkdirSync(parent, { recursive: true });
  }
}

export async function waitForOutput(
  readOutput: () => string,
  needle: string,
  timeoutMs = 2000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (readOutput().includes(needle)) {
      return;
    }
    await Bun.sleep(25);
  }

  throw new Error(`Timed out waiting for output: ${needle}`);
}

async function typeText(terminal: Bun.Terminal, text: string): Promise<void> {
  for (const char of text) {
    terminal.write(char);
    await Bun.sleep(20);
  }
}

export async function runSmokeExample(
  options: SmokeRunOptions,
): Promise<SmokeRunResult> {
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  const output = () => chunks.join("");

  await using terminal = new Bun.Terminal({
    cols: options.cols ?? 100,
    rows: options.rows ?? 30,
    data(_term, data) {
      chunks.push(decoder.decode(data));
    },
  });

  const metricsPath = options.env?.LETUI_METRICS_PATH;
  if (metricsPath) {
    ensureParentDir(metricsPath);
  }

  const subprocess = Bun.spawn(
    options.spawnArgs ?? [process.execPath, "run", "examples/smoke.ts"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        LETUI_SMOKE_TRACE: "1",
        ...options.env,
      },
      terminal,
      timeout: options.spawnTimeoutMs ?? 5000,
      killSignal: SMOKE_KILL_SIGNAL,
    },
  );

  if (options.scenario) {
    await options.scenario({ terminal, output });
  } else {
    await waitForOutput(output, "letui smoke");
    await Bun.sleep(50);
    await typeText(terminal, "typed");
    await waitForOutput(output, "[smoke:input] typed");
    terminal.write("\r");
    await waitForOutput(output, "[smoke:submit] typed");
    await waitForOutput(output, "[smoke:status] ready");
    terminal.write("\x11");
  }

  const exitCode = await subprocess.exited;
  const raw = output();
  const screen = stripAnsi(raw);

  ensureParentDir(options.screenPath);
  writeFileSync(options.screenPath, screen, "utf8");

  return { exitCode, screen, raw };
}
