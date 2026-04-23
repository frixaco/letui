/**
 * Deterministic smoke target for automated PTY testing.
 *
 * Data flow:
 *   PTY keys/mouse/resize -> runtime events -> component state -> visible markers
 */

import {
  $,
  Button,
  Column,
  Input,
  Row,
  ScrollView,
  Text,
  ff,
  onKey,
  run,
  type StyledText,
} from "@";

const THEME = {
  bg: 0x101418,
  panel: 0x17202a,
  panelAlt: 0x1f2a36,
  ink: 0xf4f7fa,
  muted: 0x9aa7b4,
  cyan: 0x5fd7ff,
  green: 0x8bd450,
  amber: 0xffc857,
  magenta: 0xd18cff,
};

const mode = $("idle");
const status = $("smoke-ready");
const submitted = $("none");
const inputValue = $("");
const clickCount = $(0);
const themeName = $("normal");
const lastResize = $("pending");

function smokeStyledText(): StyledText {
  return {
    text: "styled: cyan bold, amber underline, magenta italic",
    spans: [
      { start: 8, end: 17, foreground: THEME.cyan, bold: true },
      { start: 19, end: 35, foreground: THEME.amber, underline: true },
      { start: 37, end: 50, foreground: THEME.magenta, italic: true },
    ],
  };
}

const title = Text({
  text: {
    text: "LETUI SMOKE EXAMPLE",
    spans: [{ start: 0, end: 19, foreground: THEME.green, bold: true }],
  },
  foreground: THEME.green,
});

const markers = Text({
  text: "",
  foreground: THEME.ink,
  wrap: "word",
});

const sizeMarker = Text({
  text: "size: pending",
  foreground: THEME.muted,
});

const styleMarker = Text({
  text: smokeStyledText(),
  background: THEME.panelAlt,
  foreground: THEME.ink,
  paddingX: 1,
});

const wrapMarker = Text({
  text: "wrap: this intentionally long smoke sentence must wrap inside a narrow box without crashing the renderer",
  width: 34,
  foreground: THEME.muted,
  wrap: "word",
});

const clipMarker = Text({
  text: "clip: abcdefghijklmnopqrstuvwxyz",
  width: 16,
  foreground: THEME.amber,
  textOverflow: "ellipsis",
});

const input = Input({
  placeholder: "type here",
  width: 34,
  paddingX: 1,
  border: { color: THEME.cyan, style: "rounded" },
  background: THEME.panelAlt,
  foreground: THEME.ink,
  onChange: (value) => {
    inputValue(value);
    status(`input changed: ${value}`);
  },
  onSubmit: (value) => {
    submitted(value.trim() || "empty");
    status(`submitted: ${submitted()}`);
    input.setText("");
    inputValue("");
  },
  onFocus: () => {
    mode("input");
    status("input focused");
  },
  onBlur: () => {
    if (mode() === "input") {
      mode("idle");
    }
  },
});

const button = Button(
  {
    text: "SMOKE BUTTON",
    width: 20,
    paddingX: 1,
    border: { color: THEME.green, style: "rounded" },
    background: THEME.panelAlt,
    foreground: THEME.ink,
    onClick: () => {
      clickCount(clickCount() + 1);
      status(`button clicked: ${clickCount()}`);
    },
    onFocus: () => {
      mode("button");
      status("button focused");
    },
    onBlur: () => {
      if (mode() === "button") {
        mode("idle");
      }
    },
  },
  [],
);

const scrollMarker = Text({
  text: "scroll: 0/0",
  foreground: THEME.muted,
});

const scrollRows = Array.from({ length: 20 }, (_, index) =>
  Text({
    text: `scroll-row-${String(index).padStart(2, "0")} smoke content`,
    foreground: index % 2 === 0 ? THEME.ink : THEME.muted,
  }),
);

const scroller = ScrollView(
  {
    height: 6,
    width: 38,
    paddingX: 1,
    border: { color: THEME.magenta, style: "rounded" },
    background: THEME.panel,
    onScroll: ({ deltaY }) => {
      scroller.scrollBy(deltaY);
      status(`mouse scroll: ${deltaY}`);
    },
  },
  scrollRows,
);

const root = Column(
  {
    flexGrow: 1,
    padding: "1 2",
    gap: 1,
    background: THEME.bg,
  },
  [
    Row({ gap: 2, alignItems: "center" }, [title, sizeMarker]),
    markers,
    Row({ gap: 2, flexWrap: "wrap" }, [input, button]),
    Row({ gap: 2, flexWrap: "wrap" }, [wrapMarker, clipMarker]),
    styleMarker,
    scrollMarker,
    scroller,
  ],
);

ff(() => {
  const rootWidth = root.frameWidth();
  const rootHeight = root.frameHeight();
  const nextSize = rootWidth > 0 && rootHeight > 0 ? `${rootWidth}x${rootHeight}` : "pending";
  lastResize(nextSize);

  markers.setText(
    [
      `mode: ${mode()}`,
      `status: ${status()}`,
      `input: ${inputValue() || "empty"}`,
      `submitted: ${submitted()}`,
      `clicks: ${clickCount()}`,
      `theme: ${themeName()}`,
    ].join(" | "),
  );
  sizeMarker.setText(`size: ${lastResize()}`);
  scrollMarker.setText(`scroll: ${scroller.scrollY()}/${scroller.maxScrollY()}`);
});

onKey("i", () => input.focus());
onKey("b", () => button.focus());
onKey("\x1b", () => {
  input.blur();
  button.blur();
  mode("idle");
  status("blurred");
});
onKey("\t", () => {
  input.blur();
  button.blur();
  mode("idle");
  status("tab blurred");
});
onKey("j", () => {
  scroller.scrollBy(3);
  status(`keyboard scroll: ${scroller.scrollY()}`);
});
onKey("k", () => {
  scroller.scrollBy(-3);
  status(`keyboard scroll: ${scroller.scrollY()}`);
});
onKey("t", () => {
  const next = themeName() === "normal" ? "accent" : "normal";
  themeName(next);
  styleMarker.setStyle({
    background: next === "accent" ? THEME.green : THEME.panelAlt,
    foreground: next === "accent" ? THEME.bg : THEME.ink,
  });
  status(`theme toggled: ${next}`);
});

const app = run(root, { appearance: "dark" });

onKey("q", () => {
  app.quit();
});
