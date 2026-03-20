import {
  Button,
  Column,
  Input,
  NODE_TYPE,
  Row,
  Text,
  onKey,
  run,
  type Node,
} from "..";

const THEME = {
  bg: 0x07101a,
  panel: 0x0d1826,
  panelAlt: 0x102235,
  text: 0xdbe7ff,
  muted: 0x8ba0c2,
  border: 0x274561,
  accent: 0x45e1c2,
  blue: 0x66b3ff,
  ok: 0x75e08d,
  warn: 0xffc968,
  crit: 0xff758c,
} as const;

const idleBorder = { color: THEME.border, style: "rounded" as const };
const focusBorder = { color: THEME.accent, style: "rounded" as const };

function chip(label: string, background: number, foreground = THEME.bg): Node {
  return Text({
    text: ` ${label} `,
    background,
    foreground,
    paddingX: 1,
  });
}

function stat(label: string, value: string, accent: number = THEME.text): Node {
  return Column(
    {
      gap: 0,
      minWidth: 18,
      flexGrow: 1,
      padding: "1 0",
      background: THEME.panelAlt,
      border: idleBorder,
    },
    [
      Text({ text: label.toUpperCase(), foreground: THEME.muted }),
      Text({ text: value, foreground: accent }),
    ],
  );
}

function section(
  title: string,
  subtitle: string,
  children: Node[],
  style: {
    flexGrow?: number;
    flexBasis?: number;
    minWidth?: number;
    minHeight?: number;
  } = {},
): Node {
  return Column(
    {
      gap: 1,
      padding: "1 1",
      border: idleBorder,
      background: THEME.panel,
      ...style,
    },
    [
      Row(
        {
          justifyContent: "spaceBetween",
          alignItems: "center",
          gap: 1,
          flexWrap: "wrap",
        },
        [
          Text({
            text: title.toUpperCase(),
            foreground: THEME.accent,
          }),
          Text({
            text: subtitle,
            foreground: THEME.muted,
          }),
        ],
      ),
      ...children,
    ],
  );
}

function line(prefix: string, text: string, color: number = THEME.text): Node {
  return Text({
    text: `${prefix} ${text}`,
    foreground: color,
  });
}

function commandButton(label: string): ReturnType<typeof Button> {
  return Button(
    {
      text: ` ${label} `,
      minWidth: 10,
      paddingX: 1,
      border: idleBorder,
      background: THEME.panelAlt,
      foreground: THEME.text,
      onClick: () => {},
      onFocus: (self) =>
        self.setStyle({
          border: focusBorder,
          foreground: THEME.accent,
          background: THEME.panel,
        }),
      onBlur: (self) =>
        self.setStyle({
          border: idleBorder,
          foreground: THEME.text,
          background: THEME.panelAlt,
        }),
    },
    [],
  );
}

const commandButtons = ["ARM", "PING", "SYNC", "SAFE", "BURN", "SCAN"].map(
  commandButton,
);

const commandInput = Input({
  placeholder: "uplink command...",
  border: idleBorder,
  padding: "1 0",
  foreground: THEME.text,
  background: THEME.panelAlt,
  flexGrow: 1,
  minWidth: 28,
  onSubmit: () => {},
  onFocus: (self) => self.setStyle({ border: focusBorder }),
  onBlur: (self) => self.setStyle({ border: idleBorder }),
});

if (commandInput.type === NODE_TYPE.Input) {
  commandInput.setText("uplink sync --priority high --lane dsn-b");
}

const header = Column(
  {
    gap: 1,
    padding: "1 1",
    border: idleBorder,
    background: THEME.panel,
  },
  [
    Row(
      {
        justifyContent: "spaceBetween",
        alignItems: "center",
        gap: 1,
        flexWrap: "wrap",
      },
      [
        Column({ gap: 0 }, [
          Text({
            text: "MISSION CONTROL // AURORA-7",
            foreground: THEME.accent,
          }),
          Text({
            text: "responsive operator surface with wrapped telemetry decks",
            foreground: THEME.muted,
          }),
        ]),
        Row(
          {
            gap: 1,
            flexWrap: "wrap",
            justifyContent: "flexEnd",
          },
          [
            chip("COMMS LOCK", THEME.ok),
            chip("THERMAL WATCH", THEME.warn),
            chip("PAYLOAD ALERT", THEME.crit),
          ],
        ),
      ],
    ),
    Row(
      {
        gap: 1,
        flexWrap: "wrap",
      },
      [
        stat("Frame Target", "120Hz", THEME.accent),
        stat("Packet Loss", "0.2%", THEME.ok),
        stat("Window", "T-04:12", THEME.warn),
        stat("Queue Depth", "6", THEME.blue),
      ],
    ),
  ],
);

const operationsDeck = Column(
  {
    gap: 1,
    flexGrow: 1,
    flexBasis: 36,
    minWidth: 30,
  },
  [
    section(
      "Subsystems",
      "health map",
      [
        line("OK", "power reserve 99.2%", THEME.ok),
        line("OK", "guidance error 0.4m/s", THEME.ok),
        line("WARN", "thermal drift +12C", THEME.warn),
        line("CRIT", "payload shutter jam", THEME.crit),
      ],
      { flexGrow: 1 },
    ),
    section(
      "Checklist",
      "pre-burn gates",
      [
        line("[x]", "alignment locked", THEME.ok),
        line("[x]", "antenna lock verified", THEME.ok),
        line("[x]", "fuel reserves confirmed", THEME.ok),
        line("[ ]", "safe-mode review", THEME.warn),
        line("[ ]", "final go / no-go poll", THEME.text),
      ],
      { flexGrow: 1 },
    ),
  ],
);

const trajectoryDeck = Column(
  {
    gap: 1,
    flexGrow: 2,
    flexBasis: 42,
    minWidth: 34,
  },
  [
    section(
      "Trajectory",
      "insertion corridor",
      [
        Text({
          text: "EARTH ----*-----------*-------------O PROBE",
          foreground: THEME.text,
        }),
        Text({
          text: "midcourse trim   delta-v corridor [##################------] 78%",
          foreground: THEME.accent,
        }),
        Text({
          text: "vector lock 92%   signal integrity 94%   reactor load 63%",
          foreground: THEME.blue,
        }),
      ],
      { flexGrow: 1 },
    ),
    section(
      "Radar",
      "local contact sweep",
      [
        Text({ text: "  .      .          .        .      .  ", foreground: THEME.muted }),
        Text({ text: "       .        /|                    ", foreground: THEME.muted }),
        Text({ text: "    .         --O--       .           ", foreground: THEME.accent }),
        Text({ text: "              \\|                     .", foreground: THEME.muted }),
        Text({ text: "scan arc 247deg   contacts 4   closure 0.8m/s", foreground: THEME.blue }),
      ],
      { flexGrow: 1 },
    ),
  ],
);

const commsDeck = Column(
  {
    gap: 1,
    flexGrow: 1,
    flexBasis: 34,
    minWidth: 30,
  },
  [
    section(
      "Timeline",
      "newest first",
      [
        line("13:54:20", "window check complete", THEME.blue),
        line("13:54:16", "thermal spike near ring B", THEME.warn),
        line("13:54:08", "antenna slew stabilized", THEME.ok),
        line("13:53:49", "payload shutter timeout", THEME.crit),
        line("13:52:31", "DSN handover complete", THEME.blue),
      ],
      { flexGrow: 1 },
    ),
    section(
      "Comms",
      "uplink / downlink",
      [
        line("TX>", "cmd uplink sync --priority high", THEME.accent),
        line("RX<", "ack uplink queue accepted", THEME.blue),
        line("TX>", "cmd telemetry stream resume", THEME.accent),
        line("RX<", "telemetry packet 228443 ok", THEME.ok),
        line("RX<", "heartbeat seq 41902 nominal", THEME.ok),
      ],
      { flexGrow: 1 },
    ),
  ],
);

const main = Row(
  {
    flexGrow: 1,
    gap: 1,
    flexWrap: "wrap",
    alignItems: "stretch",
  },
  [operationsDeck, trajectoryDeck, commsDeck],
);

const footer = Column(
  {
    gap: 1,
    padding: "1 1",
    border: idleBorder,
    background: THEME.panel,
  },
  [
    Row(
      {
        gap: 1,
        alignItems: "center",
        flexWrap: "wrap",
      },
      [
        Text({ text: ":", foreground: THEME.accent }),
        commandInput,
      ],
    ),
    Row(
      {
        gap: 1,
        flexWrap: "wrap",
      },
      commandButtons,
    ),
    Text({
      text: "Tab / Shift+Tab focus cycle   Enter execute   responsive cards wrap under narrow terminals   q quit",
      foreground: THEME.muted,
    }),
  ],
);

const root = Column(
  {
    flexGrow: 1,
    padding: "1 1",
    gap: 1,
    background: THEME.bg,
  },
  [header, main, footer],
);

const app = run(root);

const focusableNodes: Node[] = [...commandButtons, commandInput];
let focusedIndex = focusableNodes.length - 1;

function focusAt(index: number): void {
  if (focusableNodes.length === 0) return;
  const next = (index + focusableNodes.length) % focusableNodes.length;
  focusedIndex = next;
  focusableNodes[next]?.focus();
}

onKey("\t", () => focusAt(focusedIndex + 1));
onKey("\x1b[Z", () => focusAt(focusedIndex - 1));
onKey("q", () => app.quit());

focusAt(focusedIndex);
