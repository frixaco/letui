---
name: kitty-tui-control
description: Control Kitty terminal tabs/windows for CLI and TUI workflows using Kitty remote control. Use when asked to start a CLI/TUI in a new Kitty tab/window, inspect output from a running terminal app, send text or keys, focus a target, or close the right tab/window safely.
---

# Kitty TUI Control

Use for Kitty `0.46.0` remote-control workflows around terminal apps.

## Scope

- start CLI/TUI processes in new Kitty tabs or windows
- inspect running output and scrollback
- send text, paste, keys, interrupts
- focus, retitle, close the correct target
- manage dev servers and long-running terminal jobs without brittle title-only matching

## Preflight

Assume nothing. Verify remote control first.

```sh
kitten @ ls >/dev/null
```

If that fails:

- inside Kitty: remote control likely disabled; default config shows `allow_remote_control no`
- outside Kitty: need `KITTY_LISTEN_ON` or `kitten @ --to ...`
- do not keep retrying blind; surface the blocker

Working assumptions:

- best case: run control commands from inside an existing Kitty window
- `shell_integration enabled` is available in the user's default config, so `last_cmd_output` style capture can work
- default `listen_on none`; cross-process control is not available unless user configured a socket or launched Kitty with `--listen-on`

## Matching Strategy

Prefer stable selectors in this order:

1. launch result window id
2. user vars via `--var name=value`
3. exact cwd/cmdline match
4. title match

Rules:

- prefer window ids for follow-up actions after `launch`
- when creating a long-lived target, set a user var and match `var:name=value`
- when taking over an existing window, add a user var with `set-user-vars` before doing repeated follow-up actions
- use title-only matching only when collision risk is low
- remember: most control commands target windows; tab commands use tab match syntax

Example durable launch:

```sh
kitten @ launch \
  --type tab \
  --copy-env \
  --cwd=current \
  --tab-title "dev-server" \
  --var role=dev-server \
  --hold \
  bun dev
```

This prints the new window id. Save it if follow-up control is needed.

Tag an existing window for stable reuse:

```sh
kitten @ set-user-vars --match 'id:123' role=dev-server
```

## Launch Patterns

Default: new tab, same cwd, copied env, durable tag, keep tab open on exit.

```sh
kitten @ launch \
  --type tab \
  --copy-env \
  --cwd=current \
  --tab-title "NAME" \
  --var role=NAME \
  --hold \
  command args
```

Specific cwd:

```sh
kitten @ launch \
  --type tab \
  --copy-env \
  --cwd /absolute/path \
  --tab-title "NAME" \
  --var role=NAME \
  --hold \
  command args
```

Stay on current tab:

```sh
kitten @ launch \
  --type tab \
  --copy-env \
  --cwd=current \
  --tab-title "NAME" \
  --var role=NAME \
  --hold \
  --keep-focus \
  command args
```

New split in current tab:

```sh
kitten @ launch \
  --type window \
  --location split \
  --copy-env \
  --cwd=current \
  --title "NAME" \
  --var role=NAME \
  --hold \
  command args
```

Shell-wrapper fallback for env that must be resolved at launch time:

```sh
kitten @ launch \
  --type tab \
  --tab-title "NAME" \
  --var role=NAME \
  --hold \
  sh -lc 'cd /absolute/path && exec command args'
```

Notes:

- `--copy-env` copies env captured when the source window was created; it will not discover later shell mutations from arbitrary processes
- prefer wrapper launch when direnv/mise/nix/shell hooks must run freshly for that cwd
- `--hold` drops to a shell prompt after the command exits; useful for failed startups and post-mortem inspection

## Find Targets

List windows as JSON:

```sh
kitten @ ls
```

Prefer filtered lookup:

```sh
kitten @ ls --match 'var:role=dev-server'
kitten @ ls --match 'id:123'
kitten @ ls --match 'cwd:/absolute/path'
```

Readable summary with `jq`:

```sh
kitten @ ls | jq -r '
  .[] | .tabs[] as $tab | $tab.windows[] |
  "tab:\($tab.id) title=\($tab.title) window:\(.id) title=\(.title) cwd=\(.cwd) cmd=\(.foreground_processes[0].cmdline | join(" ")) vars=\(.user_vars)"
'
```

If `jq` unavailable, use raw JSON and match with `--match`.

## Inspect Output

Visible screen only:

```sh
kitten @ get-text --match 'id:123' --extent screen
```

Screen plus scrollback:

```sh
kitten @ get-text --match 'var:role=dev-server' --extent all
```

Last command output, when shell integration supports it:

```sh
kitten @ get-text --match 'id:123' --extent last_cmd_output
kitten @ get-text --match 'id:123' --extent last_non_empty_output
```

Keep ANSI formatting when needed:

```sh
kitten @ get-text --match 'id:123' --extent screen --ansi
```

## Send Input

Use `send-text` for literal text/paste. Use single quotes so escapes reach Kitty, not the shell.

Run a command plus Enter:

```sh
kitten @ send-text --match 'id:123' 'npm test\r'
```

Interrupt:

```sh
kitten @ send-text --match 'id:123' '\x03'
```

Multi-line paste from stdin:

```sh
printf '%s' 'line 1
line 2
' | kitten @ send-text --match 'var:role=dev-server' --stdin --bracketed-paste auto
```

Important:

- `send-text` follows Python escape rules
- `--stdin` and `--from-file` send bytes as-is; escapes are not interpreted
- `send-text` reports success even when nothing matched; verify target first when correctness matters

## Send Keys

Use `send-key` for TUIs that need actual keypresses instead of pasted text.

```sh
kitten @ send-key --match 'id:123' up down enter
kitten @ send-key --match 'id:123' ctrl+c
kitten @ send-key --match 'var:role=lazygit' escape
```

Like `send-text`, `send-key` can silently no-op on bad matches. Verify target first.

## Focus, Retitle, Close

Focus a window:

```sh
kitten @ focus-window --match 'id:123'
kitten @ focus-window --match 'var:role=dev-server'
```

Set tab title explicitly:

```sh
kitten @ set-tab-title --match 'window_id:123' 'dev-server'
```

Close one window:

```sh
kitten @ close-window --match 'id:123'
kitten @ close-window --match 'var:role=dev-server'
```

Close the tab containing a window:

```sh
kitten @ close-tab --match 'window_id:123'
```

Safety:

- avoid `all` unless user asked for bulk action
- prefer `close-window` over `close-tab` unless the whole tab is clearly disposable
- use `--ignore-no-match` only when idempotence matters more than hard failure

## Readiness Check

Do not assume launch succeeded because a tab exists. Verify by polling the created window id.

```sh
id="$(kitten @ launch --type tab --copy-env --cwd=current --tab-title 'NAME' --var role=NAME --hold command args)"
for _ in $(seq 1 20); do
  out="$(kitten @ get-text --match "id:${id}" --extent screen 2>/dev/null || true)"
  [ -n "$out" ] && break
  sleep 0.25
done
```

For shell-launched commands, prefer content-based checks:

- process banner appeared
- prompt changed
- port bind or ready log line present

## Decision Rules

- start new long-running CLI/TUI: `launch`
- inspect existing terminal state: `ls` then `get-text`
- send a command string: `send-text`
- drive an interactive TUI: `send-key`
- preserve current attention: `launch --keep-focus`
- need robust future control: tag with `--var`
- uncertain target: inspect first, act second

## Avoid

- guessing a target from title alone when ids or vars are available
- assuming remote control works outside Kitty without `--to` or `KITTY_LISTEN_ON`
- assuming `--copy-env` reflects current shell mutations
- using sleep-only waits when output can be checked directly
