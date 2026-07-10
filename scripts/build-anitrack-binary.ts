/** Build the AniTrack demo as a standalone Bun executable. */

import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const outfile = process.argv[2] ?? "out/anitrack";

await buildAniTrackBinary(outfile);

async function buildAniTrackBinary(outputPath: string): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });

  const result = await Bun.build({
    entrypoints: ["examples/anitrack.ts"],
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
