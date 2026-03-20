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
  bg0: 0x070b14,
  fg0: 0xd8e4ff,
  fg1: 0x91a6cc,
  accent: 0x35e0c8,
  border: 0x2a3b58,
  ok: 0x57d98a,
  warn: 0xffd166,
  crit: 0xff5d73,
  info: 0x66b3ff,
} as const;

const idleBorder = { color: THEME.border, style: "square" as const };
const focusBorder = { color: THEME.accent, style: "square" as const };

function statusPill(label: string, color: number): Node {
  return Text({
    text: ` ${label} `,
    background: color,
    foreground: THEME.bg0,
  });
}

function panel(
  title: string,
  subtitle: string,
  children: Node[],
  flexGrow = 1,
): Node {
  return Column(
    {
      border: idleBorder,
      padding: "1 1",
      gap: 1,
      flexGrow,
      background: THEME.bg0,
    },
    [
      Text({
        text: `${title.toUpperCase()} // ${subtitle}`,
        foreground: THEME.accent,
      }),
      ...children,
    ],
  );
}

function statusLine(
  status: "OK" | "WARN" | "CRIT",
  label: string,
  value: string,
): Node {
  const color =
    status === "OK" ? THEME.ok : status === "WARN" ? THEME.warn : THEME.crit;

  return Row({ gap: 1 }, [
    statusPill(status, color),
    Text({
      text: `${label}: ${value}`,
      foreground: THEME.fg0,
    }),
  ]);
}

function bulletLine(prefix: string, text: string, color: number = THEME.fg0): Node {
  return Text({
    text: `${prefix} ${text}`,
    foreground: color,
  });
}

function commandButton(label: string): Node {
  return Button({
    text: ` ${label} `,
    border: idleBorder,
    foreground: THEME.fg0,
    onClick: () => {},
    onFocus: (self) => {
      self.setStyle({
        foreground: THEME.accent,
        border: focusBorder,
      });
    },
    onBlur: (self) => {
      self.setStyle({
        foreground: THEME.fg0,
        border: idleBorder,
      });
    },
  });
}

const commandButtons = ["ARM", "PING", "SYNC", "SAFE", "BURN"].map(commandButton);

const commandInput = Input({
  placeholder: "uplink command...",
  border: idleBorder,
  padding: "1 0",
  foreground: THEME.fg0,
  onSubmit: () => {},
  onFocus: (self) => self.setStyle({ border: focusBorder }),
  onBlur: (self) => self.setStyle({ border: idleBorder }),
});

if (commandInput.type === NODE_TYPE.Input) {
  commandInput.setText("uplink sync --priority high");
}

const header = Column(
  {
    border: idleBorder,
    padding: "1 1",
    gap: 1,
    background: THEME.bg0,
  },
  [
    Text({
      text: "MISSION CONTROL // AURORA-7 // ORBIT INSERTION WINDOW",
      foreground: THEME.accent,
    }),
    Row({ gap: 1 }, [
      statusPill("COMMS LOCK", THEME.ok),
      statusPill("DSN TRACK", THEME.info),
      statusPill("THERMAL WATCH", THEME.warn),
    ]),
    Text({
      text: "UTC 2042-11-04 13:54:22   T+185d 04h 22m   frame target: 120Hz",
      foreground: THEME.fg1,
    }),
  ],
);

const leftColumn = Column({ flexGrow: 3, gap: 1 }, [
  panel(
    "Subsystems",
    "health map",
    [
      statusLine("OK", "Power", "99.2%"),
      statusLine("WARN", "Thermal", "+12C drift"),
      statusLine("OK", "Navigation", "0.4m/s error"),
      statusLine("OK", "Comms", "0.2% packet loss"),
      statusLine("CRIT", "Payload", "shutter jam"),
    ],
    2,
  ),
  panel(
    "Checklist",
    "pre-burn gates",
    [
      bulletLine("[x]", "Pre-burn alignment", THEME.ok),
      bulletLine("[x]", "Antenna lock verified", THEME.ok),
      bulletLine("[x]", "Fuel reserves confirmed", THEME.ok),
      bulletLine("[ ]", "Safe-mode gate review", THEME.warn),
      bulletLine("[ ]", "Final go / no-go poll", THEME.fg1),
    ],
    2,
  ),
  panel(
    "Command Queue",
    "operator actions",
    [
      Text({
        text: "queue depth: 5   active lane: uplink-A",
        foreground: THEME.fg1,
      }),
      Row({ gap: 1 }, commandButtons),
    ],
  ),
]);

const centerColumn = Column({ flexGrow: 5, gap: 1 }, [
  panel(
    "Trajectory",
    "orbital path",
    [
      Text({
        text: "EARTH ----*-----------*-------------O PROBE",
        foreground: THEME.fg0,
      }),
      Text({
        text: "T+185d     MIDCOURSE      INSERTION CORRIDOR",
        foreground: THEME.fg1,
      }),
      Text({
        text: "delta-v corridor: [##################------] 78%",
        foreground: THEME.accent,
      }),
    ],
  ),
  panel(
    "Telemetry",
    "critical metrics",
    [
      Text({
        text: "velocity 34,884 m/s   altitude 418,201 km   battery 84.3%",
        foreground: THEME.fg0,
      }),
      Text({
        text: "fuel 62.7%            core temp 71.4 C      radiation 2.4 mSv",
        foreground: THEME.fg1,
      }),
      Text({
        text: "signal integrity 92%  packet quality 94%    reactor load 63%",
        foreground: THEME.info,
      }),
    ],
    2,
  ),
  panel(
    "Radar",
    "local contact sweep",
    [
      Text({ text: "  .      .          .        .      .  ", foreground: THEME.fg1 }),
      Text({ text: "       .        /|                    ", foreground: THEME.fg1 }),
      Text({ text: "    .         --O--       .           ", foreground: THEME.accent }),
      Text({ text: "              \\|                     .", foreground: THEME.fg1 }),
      Text({ text: "scan arc: 247 deg   contacts: 4", foreground: THEME.info }),
    ],
    2,
  ),
]);

const rightColumn = Column({ flexGrow: 4, gap: 1 }, [
  panel(
    "Timeline",
    "newest first",
    [
      bulletLine("13:54:20", "window check complete", THEME.info),
      bulletLine("13:54:16", "thermal spike near ring B", THEME.warn),
      bulletLine("13:54:08", "antenna slew stabilized", THEME.ok),
      bulletLine("13:53:49", "payload shutter timeout", THEME.crit),
      bulletLine("13:52:31", "DSN handover complete", THEME.info),
    ],
    2,
  ),
  panel(
    "Anomalies",
    "incident queue",
    [
      Text({ text: "A-17 shutter jam        owner: payload", foreground: THEME.crit }),
      Text({ text: "A-14 gyro bias          ack: investigating", foreground: THEME.warn }),
      Text({ text: "A-09 thermal drift      ack: pending", foreground: THEME.warn }),
      Text({ text: "A-05 clock skew         ack: resolved", foreground: THEME.info }),
    ],
  ),
  panel(
    "Comms",
    "uplink / downlink",
    [
      bulletLine("TX>", "cmd uplink sync --priority high", THEME.accent),
      bulletLine("RX<", "ack uplink queue accepted", THEME.info),
      bulletLine("TX>", "cmd telemetry stream resume", THEME.accent),
      bulletLine("RX<", "telemetry packet 228443 ok", THEME.ok),
      bulletLine("RX<", "heartbeat seq 41902 nominal", THEME.ok),
    ],
  ),
]);

const main = Row({ flexGrow: 1, gap: 1 }, [
  leftColumn,
  centerColumn,
  rightColumn,
]);

const footer = Column(
  {
    border: idleBorder,
    padding: "1 1",
    gap: 1,
    background: THEME.bg0,
  },
  [
    Row({ gap: 1 }, [
      Text({ text: ":", foreground: THEME.accent }),
      commandInput,
    ]),
    Text({
      text: "Tab focus cycle   Enter execute   keyboard-only demo   q quit",
      foreground: THEME.fg1,
    }),
  ],
);

const root = Column(
  {
    flexGrow: 1,
    padding: "1 1",
    gap: 1,
    background: THEME.bg0,
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
