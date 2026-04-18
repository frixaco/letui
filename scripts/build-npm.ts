// Build npm package metadata for a platform-specific prebuilt binary.

const args = Deno.args;
if (args.length < 3) {
  console.error("Usage: deno run scripts/build-npm.ts <version> <platform> <arch>");
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
  files: ["*.dylib", "*.so", "*.dll", "*.node"],
};

const outDir = `npm/${pkgName}`;

// Ensure directory exists before writing the package manifest.
await Deno.mkdir(outDir, { recursive: true });

await Deno.writeTextFile(`${outDir}/package.json`, JSON.stringify(manifest, null, 2));

console.log(`Created package manifest in ${outDir}`);
