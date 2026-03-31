// Smoke demo: minimal input flow used by automated terminal verification.

import { COLORS, Column, Input, Text, ff, onKey, run } from "../index.ts";
import { $ } from "../src/signals";

// --- Internal state ---

const border = {
  color: COLORS.default.bg_highlight,
  style: "square" as const,
};

const focusBorder = {
  color: COLORS.default.green,
  style: "square" as const,
};

function trace(event: string, value: string): void {
  if (process.env.LETUI_SMOKE_TRACE === "1") {
    process.stderr.write(`[smoke:${event}] ${value}\n`);
  }
}

// --- View state ---

const status = $("booting");
const title = Text({
  text: "letui smoke",
  foreground: COLORS.default.green,
});
const statusLine = Text({
  text: "status: booting",
  foreground: COLORS.default.fg,
});
const mirrorLine = Text({
  text: "input: ",
  foreground: COLORS.default.grey,
});
const submitLine = Text({
  text: "submit: waiting",
  foreground: COLORS.default.grey,
});

const input = Input({
  placeholder: "type here",
  border,
  padding: "1 0",
  onChange: (value) => {
    mirrorLine.setText(`input: ${value}`);
    trace("input", value);
  },
  onSubmit: (value) => {
    submitLine.setText(`submit: ${value}`);
    status("ready");
    trace("submit", value);
  },
  onFocus: (self) => self.setStyle({ border: focusBorder }),
  onBlur: (self) => self.setStyle({ border }),
});

// --- Reactive sync ---

ff(() => {
  statusLine.setText(`status: ${status()}`);
  trace("status", status());
});

// --- Runtime ---

const root = Column(
  {
    flexGrow: 1,
    gap: 1,
    padding: "1 1",
    border,
    background: COLORS.default.bg,
  },
  [title, statusLine, input, mirrorLine, submitLine],
);

const debug = process.env.LETUI_SMOKE_DEBUG === "1";
const app = run(root, { debug });

onKey("q", () => app.quit());
input.focus();
