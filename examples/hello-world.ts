// Hello world playground: compact layout + style demo for the default letui surface.

import { COLORS, Column, Row, Text, $, ff, onKey, run } from "@";

// --- Internal state ---

const THEME = {
  bg: 0x0d1420,
  panel: 0x111c2b,
  panelAlt: 0x162338,
  border: 0x28415f,
  text: 0xe8f0ff,
  muted: 0x89a2c3,
  aqua: 0x4ee7d0,
  lime: 0xc8f36b,
  amber: 0xffc76a,
  rose: 0xff7c93,
} as const;

const idleBorder = { color: THEME.border, style: "rounded" as const };

const count = $(12);
const modeIndex = $(0);

const MODES = [
  { label: "OBSERVE", accent: THEME.aqua, pulse: "stable delta sync" },
  { label: "SURGE", accent: THEME.amber, pulse: "heavier redraw budget" },
  { label: "RECOVER", accent: THEME.lime, pulse: "cooldown and reset path" },
] as const;

// --- Internal algorithm ---

function chip(label: string, background: number, foreground = THEME.bg) {
  return Text({
    text: ` ${label} `,
    background,
    foreground,
    paddingX: 1,
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function gauge(value: number, width: number): string {
  const safeWidth = Math.max(8, width);
  const normalized = clamp(value, -20, 40) + 20;
  const fill = Math.round((normalized / 60) * safeWidth);
  return `${"█".repeat(fill)}${"·".repeat(Math.max(0, safeWidth - fill))}`;
}

// --- View state ---

const heroTitle = Text({
  text: "LETUI // REACTIVE TERMINAL SURFACE",
  foreground: THEME.aqua,
});

const heroBody = Text({
  text: "",
  foreground: THEME.text,
});

const gaugeLine = Text({
  text: "",
  foreground: THEME.lime,
});

const heroMeta = Text({
  text: "",
  foreground: THEME.muted,
});

const heroPanel = Column(
  {
    flexGrow: 3,
    flexBasis: 42,
    minWidth: 32,
    gap: 1,
    padding: "1 1",
    border: idleBorder,
    background: THEME.panel,
  },
  [heroTitle, heroBody, gaugeLine, heroMeta],
);

const quickMode = Text({
  text: "",
  foreground: THEME.text,
});

const quickTempo = Text({
  text: "",
  foreground: THEME.text,
});

const quickControls = Text({
  text: "+/- count   r reset   1/2/3 mode   q quit",
  foreground: THEME.muted,
});

const quickPanel = Column(
  {
    flexGrow: 2,
    flexBasis: 26,
    minWidth: 26,
    gap: 1,
    padding: "1 1",
    border: idleBorder,
    background: THEME.panelAlt,
  },
  [quickMode, quickTempo, quickControls],
);

const statCards = Row(
  {
    gap: 1,
    flexWrap: "wrap",
    alignItems: "stretch",
  },
  [
    Text({
      text: " 120Hz target ",
      background: THEME.aqua,
      foreground: THEME.bg,
      paddingX: 1,
    }),
    Text({
      text: " rust paint core ",
      background: THEME.lime,
      foreground: THEME.bg,
      paddingX: 1,
    }),
    Text({
      text: " bun ffi bridge ",
      background: THEME.amber,
      foreground: THEME.bg,
      paddingX: 1,
    }),
  ],
);

const footer = Text({
  text: "",
  foreground: THEME.muted,
});

const root = Column(
  {
    flexGrow: 1,
    gap: 1,
    padding: "1 1",
    background: THEME.bg,
    justifyContent: "spaceBetween",
  },
  [
    Column({ gap: 1 }, [
      Text({
        text: "hello-world.ts now doubles as a compact style + layout playground",
        foreground: THEME.text,
      }),
      statCards,
    ]),
    Row(
      {
        gap: 1,
        flexGrow: 1,
        flexWrap: "wrap",
        alignItems: "stretch",
      },
      [heroPanel, quickPanel],
    ),
    footer,
  ],
);

// --- Reactive sync ---

ff(() => {
  const currentCount = count();
  const currentMode = MODES[modeIndex()] ?? MODES[0];
  const meterWidth = Math.max(12, Math.floor(heroPanel.frameWidth()) - 8);

  heroPanel.setStyle({
    border: { color: currentMode.accent, style: "rounded" },
  });
  heroTitle.setStyle({
    foreground: currentMode.accent,
  });

  heroBody.setText(`counter: ${currentCount.toString().padStart(2, "0")}   mode: ${currentMode.label}`);
  gaugeLine.setText(`load  ${gauge(currentCount, meterWidth)}`);
  gaugeLine.setStyle({ foreground: currentMode.accent });
  heroMeta.setText(`pulse: ${currentMode.pulse}   width: ${Math.floor(heroPanel.frameWidth())}`);

  quickMode.setText(`active preset: ${currentMode.label}`);
  quickMode.setStyle({ foreground: currentMode.accent });

  const tempo =
    currentCount >= 24
      ? "tempo: elevated"
      : currentCount <= -4
        ? "tempo: low"
        : "tempo: balanced";
  quickTempo.setText(tempo);
  quickTempo.setStyle({
    foreground:
      currentCount >= 24
        ? THEME.rose
        : currentCount <= -4
          ? THEME.amber
          : THEME.lime,
  });

  footer.setText(
    `responsive wrap: hero minWidth 32, utility minWidth 26   default palette still available via COLORS.fg=${COLORS.default.fg.toString(16)}`,
  );
});

// --- Runtime ---

const app = run(root);

onKey("+", () => count(count() + 2));
onKey("-", () => count(count() - 2));
onKey("r", () => count(12));
onKey("1", () => modeIndex(0));
onKey("2", () => modeIndex(1));
onKey("3", () => modeIndex(2));
onKey("q", () => app.quit());
