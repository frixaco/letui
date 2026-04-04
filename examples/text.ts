import { COLORS, Column, Text, onKey, run } from "../index.ts";

const text = Text({
  text: "Hello World",
  foreground: COLORS.light.fg,
  background: COLORS.light.bg,
});

const root = Column({}, [text]);

const app = run(root, { debug: true });

onKey("q", () => {
  app.quit();
});
