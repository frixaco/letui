/** Build the AniTrack demo as a Bun standalone executable with the native backend embedded. */

import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";

const outfile = process.argv[2] ?? "out/anitrack";

await buildAniTrackBinary(outfile);

async function buildAniTrackBinary(outputPath: string): Promise<void> {
  await run(["cargo", "build", "--release", "--manifest-path", "core/Cargo.toml"]);

  const nativeLibraryPath = getNativeLibraryPath();
  if (!existsSync(nativeLibraryPath)) {
    throw new Error(`Expected native library at ${nativeLibraryPath}`);
  }

  await mkdir(dirname(outputPath), { recursive: true });

  const result = await Bun.build({
    entrypoints: ["examples/anitrack.ts", nativeLibraryPath],
    compile: {
      outfile: outputPath,
    },
    minify: true,
  });

  if (!result.success) {
    throw new Error("Failed to build AniTrack executable");
  }

  console.log(`Built ${outputPath}`);
}

function getNativeLibraryPath(): string {
  const prefix = process.platform === "win32" ? "" : "lib";
  const suffix =
    process.platform === "win32" ? "dll" : process.platform === "darwin" ? "dylib" : "so";

  return join("core", "target", "release", `${prefix}letui_core.${suffix}`);
}

async function run(cmd: string[]): Promise<void> {
  const proc = Bun.spawn(cmd, {
    stdout: "inherit",
    stderr: "inherit",
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`${cmd.join(" ")} failed with exit code ${exitCode}`);
  }
}
