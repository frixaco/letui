# diff

Pretty git diffs — in the terminal, browser, or piped to anything.

## Usage

```bash
dif                        # all changes in current repo
dif --staged               # staged only
dif --all                  # staged + unstaged + untracked
dif HEAD~3                 # last 3 commits
dif main                   # diff against branch

dif --tui                  # open TUI viewer (default when interactive)
dif --web                  # open localhost browser viewer
dif --raw                  # output parsed/formatted diff to stdout (pipeable)
```

## Modes

| Mode | When                       | Output                                            |
| ---- | -------------------------- | ------------------------------------------------- |
| TUI  | Default in terminal        | Rich inline diff viewer                           |
| Web  | `--web` flag               | localhost server, opens browser, pretty diff page |
| Raw  | `--raw` or stdout is piped | Structured output to stdout for chaining          |

## Output Chaining

```bash
dif --raw | llm "review this diff"
dif main --raw | pbcopy
```

`--raw` emits clean, structured diff text (no ANSI) so downstream tools get usable input.

## Web Mode

- Spins up ephemeral localhost server
- Opens browser automatically (`--no-open` to suppress)
- Side-by-side + unified toggle
- Syntax highlighting per language
- File tree sidebar
- Auto-closes when browser tab closes (websocket heartbeat)

## TUI Mode

- File list with expand/collapse
- Side-by-side or inline view powered by https://diffs.com
- Keyboard nav: `j/k` files, `tab` toggle view, `q` quit
- Syntax highlighting for popular languages

## Tech

- Runtime: Bun
- Diff parsing: `@pierre/diffs` (or similar — already found)
- TUI: LeTUI
- Web: static HTML served via `Bun.serve()`, no framework

## Non-Goals

- No file watching / live reload (v1)
- Not a git client — no staging, committing, pushing
- No remote diffs (GitHub PRs) — local only for now
