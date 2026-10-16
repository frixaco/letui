// Stamp the root package.json with a release version from the git tag.
//
//   v0.5.0 tag -> package.json version + every @frixaco/letui-* optional binary pin = 0.5.0
//
// The binary packages are published from the same tag, so pinning them to the tag version keeps
// the root package pointing at the native libraries built in the same workflow run.

import { readFile, writeFile } from "node:fs/promises";

const BINARY_PACKAGE_PREFIX = "@frixaco/letui-";

const [version] = process.argv.slice(2);
if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error("Usage: bun scripts/set-release-version.ts <X.Y.Z>");
  process.exit(1);
}

const manifestPath = "package.json";
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

manifest.version = version;

const binaryPins = Object.keys(manifest.optionalDependencies ?? {}).filter((name) =>
  name.startsWith(BINARY_PACKAGE_PREFIX),
);
if (binaryPins.length === 0) {
  console.error(`No ${BINARY_PACKAGE_PREFIX}* entries in optionalDependencies`);
  process.exit(1);
}
for (const name of binaryPins) {
  manifest.optionalDependencies[name] = version;
}

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Set ${manifest.name} and ${binaryPins.join(", ")} to ${version}`);
