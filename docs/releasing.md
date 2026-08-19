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

Pick the next version, written below as `X.Y.Z`.

Update all of these to the same version before tagging:

1. Root package version in `package.json`
2. Binary package pins in `package.json` `optionalDependencies`
3. Rust crate version in `core/Cargo.toml`

Why binary pins matter:

- The release workflow rewrites the root `package.json` version from the tag.
- The release workflow does not rewrite `optionalDependencies`.
- If the pins stay old, the new `@frixaco/letui` release points at old native binaries.

## Verify locally

Run:

```bash
bun install
bun run check
```

Expected:

- `bun.lock` refreshed if package versions changed
- `core/Cargo.lock` may refresh after Rust commands
- typecheck and Rust check pass

## Publish

From a clean local state:

```bash
git checkout master
git pull --ff-only
git add package.json bun.lock core/Cargo.toml core/Cargo.lock
git commit -m "release: X.Y.Z"
git tag vX.Y.Z
git push --atomic origin master vX.Y.Z
```

The tag must point to the commit containing version `X.Y.Z`. A tag push runs the release workflow. npm rejects a version that already exists.

## What the workflow does

On tag `v*`:

1. Build the Rust library for:
   - `darwin-arm64`
   - `linux-x64`
   - `win32-x64`
2. Generate each binary package manifest with `scripts/build-npm.ts`.
3. Publish each binary package through GitHub OpenID Connect.
4. Publish the root package `@frixaco/letui`.
5. Attach signed provenance to the public packages.

## Post-release checks

Confirm that the workflow succeeded. Then verify that all package versions match:

```bash
npm view @frixaco/letui version
npm view @frixaco/letui-darwin-arm64 version
npm view @frixaco/letui-linux-x64 version
npm view @frixaco/letui-win32-x64 version
```

Also confirm that the installed root package resolves matching optional binary versions and that npm shows provenance for the release.
