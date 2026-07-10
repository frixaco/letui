# Releasing

Releases are platform-independent TypeScript packages. A pushed semver tag runs the release workflow and publishes `@frixaco/letui`.

## Preconditions

- `master` is green
- GitHub secret `NPM_TOKEN` is set
- npm ownership for `@frixaco/letui` is available

## Verify locally

```bash
bun install --frozen-lockfile
bun run check
```

`check` builds the vendored Taffy port, typechecks LetUI, runs unit tests, and runs the PTY smoke test.

## Publish

```bash
git tag v0.5.0
git push origin v0.5.0
```

The workflow installs dependencies, runs the full check, applies the tag version to `package.json`, and publishes the main package. There are no platform binary packages.
