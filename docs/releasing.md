# Releasing

Current release path: push a semantic-version tag. GitHub Actions builds the platform binary packages, then publishes the main package with npm trusted publishing.

Workflow source: `.github/workflows/release.yml`

## Preconditions

- `master` is green
- npm trusted publishing is configured for:
  - `@frixaco/letui`
  - `@frixaco/letui-darwin-arm64`
  - `@frixaco/letui-linux-x64`
  - `@frixaco/letui-win32-x64`

Each package must trust GitHub Actions for repository `frixaco/letui`, workflow `release.yml`, with `npm publish` permission. The workflow does not use an `NPM_TOKEN` secret.

## Version bump

Pick the next version, written below as `X.Y.Z`. The tag `vX.Y.Z` is the source of truth for every
published version.

Update these in a release commit so the repo matches what ships:

1. Root package version in `package.json`
2. Rust crate version in `core/Cargo.toml` (refresh `core/Cargo.lock` with `bun run check:rust`)

Leave the binary pins in `package.json` `optionalDependencies` alone. Before publishing the root
package, the workflow runs `scripts/set-release-version.ts`, which sets the root version and every
`@frixaco/letui-*` pin to the tag version. The root release always points at the binaries built
from the same tag.

## Verify locally

Run:

```bash
bun run check
```

Expected: typecheck and Rust check pass.

## Publish

From a clean local state:

```bash
git checkout master
git pull --ff-only
git add package.json core/Cargo.toml core/Cargo.lock
git commit -m "release: vX.Y.Z"
git tag vX.Y.Z
git push --atomic origin master vX.Y.Z
```

A tag push runs the release workflow. npm rejects a version that already exists, so a failed
release that already published some packages needs a new patch version.

## What the workflow does

On tag `v*`:

1. Build the Rust library for:
   - `darwin-arm64`
   - `linux-x64`
   - `win32-x64`
2. Generate each binary package manifest with `scripts/build-npm.ts`.
3. Publish each binary package through GitHub OpenID Connect.
4. Set the root version and binary pins from the tag with `scripts/set-release-version.ts`.
5. Publish the root package `@frixaco/letui` if all binary packages published.
6. Attach signed provenance to the public packages.

## Post-release checks

Confirm that the workflow succeeded. Then verify that all package versions match:

```bash
npm view @frixaco/letui version
npm view @frixaco/letui-darwin-arm64 version
npm view @frixaco/letui-linux-x64 version
npm view @frixaco/letui-win32-x64 version
```

Also confirm that the installed root package resolves matching optional binary versions and that npm shows provenance for the release.
