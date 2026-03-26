import { COLORS, Column, Input, Text, VirtualList, ff, onKey, run } from "../index.ts";
import { $ } from "../src/signals";

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
const scrollLine = Text({
  text: "scroll: 0",
  foreground: COLORS.default.grey,
});

const rows = Array.from({ length: 40 }, (_, index) => `row ${String(index + 1).padStart(2, "0")}`);

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
    list.focus();
  },
  onFocus: (self) => self.setStyle({ border: focusBorder }),
  onBlur: (self) => self.setStyle({ border }),
});

const list = VirtualList({
  height: 8,
  border,
  items: rows,
  rowHeight: 1,
  overscanRows: 2,
  createRow: () =>
    Text({
      text: "",
      foreground: COLORS.default.fg,
    }),
  bindRow: (row, item, index) => {
    if (row.type !== "Text") {
      return;
    }
    row.setText(`${String(index + 1).padStart(2, "0")} ${item}`);
  },
  onScroll: (state) => {
    scrollLine.setText(`scroll: ${state.scrollY}`);
    if (state.scrollY > 0) {
      trace("scroll", `${state.scrollY}`);
    }
  },
});

ff(() => {
  statusLine.setText(`status: ${status()}`);
  trace("status", status());
});

const root = Column(
  {
    flexGrow: 1,
    gap: 1,
    padding: "1 1",
    border,
    background: COLORS.default.bg,
  },
  [title, statusLine, input, mirrorLine, submitLine, scrollLine, list],
);

const debug = process.env.LETUI_SMOKE_DEBUG === "1";
const app = run(root, { debug });

onKey("q", () => app.quit());
input.focus();
