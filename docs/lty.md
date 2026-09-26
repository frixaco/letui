# Letty Agent (`lty`)

Letty Agent is a portfolio-sized local coding agent and a real-world LeTUI demo. The terminal UI,
local thread index, transcript, and search experience live in this repository. Codex app-server
owns ChatGPT authentication, model execution, tools, sandboxing, `AGENTS.md`, skills, configured
MCP servers, and subagents.

```text
composer / command palette
          │
          ▼
  Codex JSONL app-server ─────▶ ChatGPT subscription
          │
          ├──── streamed turn and tool events ────▶ LeTUI transcript
          │
          └──── Codex thread id ◀────────────────▶ local SQLite index
```

Everything is local except the model request made by Codex. Letty does not implement cloud thread
sync, remote sandboxes, API-key billing, plugins, IDE integration, or an MCP management interface.

## Requirements

- Bun 1.3 or newer
- Codex CLI 0.157.0 or newer on `PATH`
- A ChatGPT account with Codex access
- A locally built LeTUI native library (`bun run build-ffi`)

Start Letty from the workspace you want the agent to use:

```bash
bun install
bun run lty
```

If Codex is signed out, open the command palette with `Ctrl+O` and choose **sign in with ChatGPT**.
Local data is stored in `~/.lty/threads.sqlite`; set `LTY_HOME` to use another directory.

## Supported experience

- streamed assistant, reasoning, command, file-change, search, MCP, and subagent entries
- clear running, successful, and failed tool states
- model and reasoning-effort selection
- interrupt and steer while a turn is active
- local thread creation, preview, resume, and archive
- fuzzy workspace-file mentions with `@`
- cross-thread context references with `@@`
- prompt history, expandable tool details, subscription limits, and connection health

Letty deliberately has no approval or interactive MCP forms. Threads run with Codex's
`workspace-write` sandbox and `approvalPolicy: "never"`; unexpected approval requests are declined,
and interactive MCP requests are cancelled. Use it in a version-controlled workspace and review
changes before committing them.

## Controls

| Key                | Action                          |
| ------------------ | ------------------------------- |
| `Ctrl+O`           | Command palette                 |
| `Ctrl+S`           | Reasoning-effort dial           |
| `Ctrl+R`           | Prompt history                  |
| `Alt+T`            | Expand or collapse tool details |
| `@` / `@@`         | Mention a file / local thread   |
| `Esc`, `Esc`       | Interrupt an active turn        |
| `Ctrl+C`, `Ctrl+C` | Quit                            |

## Verification

```bash
bun run test:lty   # deterministic event, version, and SQLite tests
bun run smoke:lty  # live app-server/account/model handshake; no model turn
bun run check      # TypeScript and Rust checks
```

For a clean demo without touching normal Letty history:

```bash
LTY_HOME="$(mktemp -d)" bun run lty
```
