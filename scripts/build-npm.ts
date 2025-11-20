import { write } from "bun";
import { mkdir } from "node:fs/promises";
import { join } from "path";

const args = process.argv.slice(2);
if (args.length < 3) {
  console.error("Usage: bun scripts/build-npm.ts <version> <platform> <arch>");
  process.exit(1);
}

const [version, platform, arch] = args;

const pkgName = `letui-${platform}-${arch}`;
const scope = "@frixaco";
const fullPkgName = `${scope}/${pkgName}`;

console.log(`Preparing ${fullPkgName} v${version}...`);

const manifest = {
  name: fullPkgName,
  version,
  description: `Prebuilt binary for letui on ${platform}-${arch}`,
  os: [platform],
  cpu: [arch],
  // We don't really need a 'main' since we resolve the file directly,
  // but it's good practice.
  files: [
    "*.dylib",
    "*.so",
    "*.dll",
    "*.node"
  ]
};

const outDir = join("npm", pkgName);

// Ensure directory exists
await mkdir(outDir, { recursive: true });

// Write package.json
await write(join(outDir, "package.json"), JSON.stringify(manifest, null, 2));

console.log(`Created package manifest in ${outDir}`);
