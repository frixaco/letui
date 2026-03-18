import { COLORS, Column, Text, $, ff, onKey, run } from "../index.ts";

const count = $(0);
const countText = Text({
  text: "count: 0",
  foreground: COLORS.default.green,
});

ff(() => {
  countText.setText(`count: ${count()}`);
});

const root = Column(
  {
    flexGrow: 1,
    padding: "1 1",
    gap: 1,
    background: COLORS.default.bg,
    border: { color: COLORS.default.bg_highlight, style: "rounded" },
  },
  [
    Text({ text: "letui demo", foreground: COLORS.default.fg }),
    countText,
    Text({
      text: "+/- update, r reset, q quit",
      foreground: COLORS.default.grey,
    }),
    Text({
      text: "supported layout props today: gap, padding, flexGrow",
      foreground: COLORS.default.grey,
    }),
  ],
);

const app = run(root);

onKey("+", () => count(count() + 1));
onKey("-", () => count(count() - 1));
onKey("r", () => count(0));
onKey("q", () => app.quit());
