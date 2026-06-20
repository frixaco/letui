# Releasing

Current release path: push semver tag. GitHub Actions builds platform binary packages, then publishes main package.

Workflow source: `.github/workflows/release.yml`

## Preconditions

- `master` green
- GitHub repo secret `NPM_TOKEN` set
- npm ownership for:
  - `@frixaco/letui`
  - `@frixaco/letui-darwin-arm64`
  - `@frixaco/letui-linux-x64`
  - `@frixaco/letui-win32-x64`

## Version bump

Pick next version, example `0.0.12`.

Update all of these to same version before tagging:

1. Root package version in `package.json`
2. Binary package pins in `package.json` `optionalDependencies`
3. Rust crate version in `core/Cargo.toml`

Why binary pins matter:

- release workflow rewrites root `package.json` version from tag
- release workflow does not rewrite `optionalDependencies`
- if pins stay old, new `@frixaco/letui` release points at old native binaries

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

From clean local state:

```bash
git checkout master
git pull --ff-only
git add package.json bun.lock core/Cargo.toml core/Cargo.lock
git commit -m "release: v0.0.12"
git push origin master
git tag v0.0.12
git push origin v0.0.12
```

Tag push triggers release workflow.

## What workflow does

On tag `v*`:

1. Build Rust cdylib on:
   - `darwin-arm64`
   - `linux-x64`
   - `win32-x64`
2. Generate binary package manifest via `scripts/build-npm.ts`
3. Publish each binary package to npm
4. Publish root package `@frixaco/letui`

## Post-release checks

Verify:

```bash
npm view @frixaco/letui version
npm view @frixaco/letui-darwin-arm64 version
npm view @frixaco/letui-linux-x64 version
npm view @frixaco/letui-win32-x64 version
```

Also confirm installed root package resolves matching optional binary versions.
