# diff

Pretty git diffs — in the terminal, browser, or piped to anything.

## Usage

```bash
diff                        # all changes in current repo
diff --staged               # staged only
diff --all                  # staged + unstaged + untracked
diff HEAD~3                 # last 3 commits
diff main                   # diff against branch
git diff | diff             # piped input

diff --tui                  # open TUI viewer (default when interactive)
diff --web                  # open localhost browser viewer
diff --raw                  # output parsed/formatted diff to stdout (pipeable)
```

## Modes

| Mode | When                       | Output                                            |
| ---- | -------------------------- | ------------------------------------------------- |
| TUI  | Default in terminal        | Rich inline diff viewer                           |
| Web  | `--web` flag               | localhost server, opens browser, pretty diff page |
| Raw  | `--raw` or stdout is piped | Structured output to stdout for chaining          |

## Input Resolution

1. If stdin is piped → read unified diff from stdin
2. If args specify ref/range (`HEAD~3`, `main`) → run `git diff <ref>`
3. If no args → run `git diff` (unstaged changes)
4. `--staged` / `--all` modify git diff behavior

## Output Chaining

```bash
diff --raw | llm "review this diff"
diff --raw | diff --web          # pipe between modes
diff main --raw | pbcopy
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
- Syntax highlighting

## Tech

- Runtime: Bun
- Diff parsing: `@pierre/diffs` (or similar — already found)
- TUI: LeTUI
- Web: static HTML served via `Bun.serve()`, no framework

## Non-Goals

- Not a git client — no staging, committing, pushing
- No remote diffs (GitHub PRs) — local only for now
- No file watching / live reload (v1)
