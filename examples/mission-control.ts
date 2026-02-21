import { Button, Column, Input, Row, Text, onKey, run, type Node } from "..";

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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function asciiBar(value: number, width = 20): string {
  const bounded = clamp(value, 0, 100);
  const filled = Math.round((bounded / 100) * width);
  const empty = Math.max(0, width - filled);
  return `${"#".repeat(filled)}${"-".repeat(empty)}`;
}

function statusPill(label: string, color: number): Node {
  return Text({
    text: ` ${label} `,
    background: color,
    foreground: THEME.bg0,
  });
}

function panel(
  title: string,
  children: Node[],
  options: {
    subtitle?: string;
    flexGrow?: number;
    borderStyle?: "square" | "rounded";
    borderColor?: number;
  } = {},
): Node {
  return Column(
    {
      border: {
        color: options.borderColor ?? THEME.border,
        style: options.borderStyle ?? "rounded",
      },
      overflow: "hidden",
      flexGrow: options.flexGrow,
    },
    [
      Row(
        {
          justifyContent: "space-between",
          padding: "0 1",
        },
        [
          Text({
            text: title.toUpperCase(),
            foreground: THEME.accent,
          }),
          Text({
            text: options.subtitle ?? "",
            foreground: THEME.fg1,
          }),
        ],
      ),
      Column(
        {
          padding: "0 1",
          rowGap: 0,
          flexGrow: 1,
          justifyContent: "center",
        },
        children,
      ),
    ],
  );
}

function subsystemRow(
  status: "OK" | "WARN" | "CRIT",
  name: string,
  value: string,
): Node {
  const color =
    status === "OK" ? THEME.ok : status === "WARN" ? THEME.warn : THEME.crit;

  return Row({ justifyContent: "space-between" }, [
    Row({ columnGap: 1 }, [statusPill(status, color), Text({ text: name, foreground: THEME.fg0 })]),
    Text({ text: value, foreground: THEME.fg1 }),
  ]);
}

function telemetryCard(
  label: string,
  value: string,
  trend: string,
  color: number,
): Node {
  return Column(
    {
      padding: "0 1",
      flexGrow: 1,
    },
    [
      Text({ text: `${label}: ${value} (${trend})`, foreground: color }),
    ],
  );
}

function barRow(label: string, value: number, color: number): Node {
  const pct = Math.round(clamp(value, 0, 100));
  return Row({ justifyContent: "space-between" }, [
    Text({ text: label, foreground: THEME.fg0 }),
    Text({ text: `[${asciiBar(pct, 16)}] ${pct}%`, foreground: color }),
  ]);
}

function eventRow(
  ts: string,
  severity: "OK" | "WARN" | "CRIT" | "INFO",
  message: string,
): Node {
  const color =
    severity === "OK"
      ? THEME.ok
      : severity === "WARN"
        ? THEME.warn
        : severity === "CRIT"
          ? THEME.crit
          : THEME.info;

  return Row({ columnGap: 1 }, [
    Text({ text: ts, foreground: THEME.fg1 }),
    statusPill(severity, color),
    Text({ text: message, foreground: THEME.fg0 }),
  ]);
}

function commsRow(direction: "TX>" | "RX<", text: string): Node {
  const color = direction === "TX>" ? THEME.accent : THEME.info;
  return Row({ columnGap: 1 }, [
    Text({ text: direction, foreground: color }),
    Text({ text, foreground: THEME.fg0 }),
  ]);
}

function commandButton(label: string): Node {
  return Button({
    text: ` ${label} `,
    border: { color: THEME.border, style: "square" },
    foreground: THEME.fg0,
    onClick: () => {},
    onFocus: (self) => {
      self.setStyle({
        foreground: THEME.accent,
        border: { color: THEME.accent, style: "square" },
      });
    },
    onBlur: (self) => {
      self.setStyle({
        foreground: THEME.fg0,
        border: { color: THEME.border, style: "square" },
      });
    },
  });
}

const commandButtons = ["ARM", "PING", "SYNC", "SAFE", "BURN"].map(commandButton);

const commandInput = Input({
  placeholder: "uplink command...",
  foreground: THEME.fg0,
  flexGrow: 1,
  onSubmit: () => {},
  onFocus: (self) => {
    self.setStyle({ foreground: THEME.accent });
  },
  onBlur: (self) => {
    self.setStyle({ foreground: THEME.fg0 });
  },
});

if (commandInput.type === "input") {
  commandInput.setText("uplink sync --priority high");
}

const header = Column(
  {
    padding: "0 1",
    rowGap: 0,
  },
  [
    Row({ justifyContent: "space-between", alignItems: "center" }, [
      Text({
        text: "MISSION CONTROL // DEEP SPACE PROBE   Phase: ORBIT INSERTION WINDOW",
        foreground: THEME.accent,
      }),
      Row({ columnGap: 1 }, [
        statusPill("COMMS LOCK", THEME.ok),
        statusPill("DSN TRACK", THEME.info),
        statusPill("THERMAL WATCH", THEME.warn),
      ]),
    ]),
    Row({ justifyContent: "space-between" }, [
      Text({
        text: "AURORA-7  T+185d 04h 22m  ETA burn: 00:12:48",
        foreground: THEME.fg0,
      }),
      Text({
        text: "UTC 2042-11-04 13:54:22  120Hz  3.4ms",
        foreground: THEME.fg1,
      }),
    ]),
  ],
);

const leftColumn = Column({ flexGrow: 3, rowGap: 0, overflow: "hidden" }, [
  panel(
    "Subsystems",
    [
      subsystemRow("OK", "Power", "99.2%"),
      subsystemRow("WARN", "Thermal", "+12C drift"),
      subsystemRow("OK", "Nav", "0.4m/s err"),
      subsystemRow("OK", "Comms", "0.2% loss"),
      subsystemRow("CRIT", "Payload", "shutter jam"),
      subsystemRow("OK", "ADCS", "locked"),
      subsystemRow("OK", "Propulsion", "nominal"),
    ],
    { subtitle: "health map", flexGrow: 1 },
  ),
  panel(
    "Checklist",
    [
      Text({ text: "[x] Pre-burn alignment", foreground: THEME.ok }),
      Text({ text: "[x] Antenna lock verified", foreground: THEME.ok }),
      Text({ text: "[x] Fuel reserves confirmed", foreground: THEME.ok }),
      Text({ text: "[ ] Safe-mode gate review", foreground: THEME.warn }),
      Text({ text: "[ ] Final go/no-go poll", foreground: THEME.fg1 }),
      Text({ text: "[ ] Commit burn sequence", foreground: THEME.fg1 }),
    ],
    { subtitle: "procedural gates", flexGrow: 1, borderStyle: "square" },
  ),
  panel(
    "Command Queue",
    [
      Text({ text: "queue depth: 5  active lane: uplink-A", foreground: THEME.fg1 }),
      Row({ columnGap: 1 }, commandButtons),
    ],
    { subtitle: "operator actions", flexGrow: 1 },
  ),
]);

const telemetryGrid = Column({ rowGap: 0 }, [
  Row({ columnGap: 1 }, [
    telemetryCard("Velocity", "34,884 m/s", "+0.18%", THEME.info),
    telemetryCard("Altitude", "418,201 km", "-0.04%", THEME.fg0),
    telemetryCard("Fuel", "62.7%", "-0.12%", THEME.warn),
  ]),
  Row({ columnGap: 1 }, [
    telemetryCard("Battery", "84.3%", "-0.03%", THEME.ok),
    telemetryCard("Core Temp", "71.4 C", "+1.7 C", THEME.warn),
    telemetryCard("Radiation", "2.4 mSv", "+0.2", THEME.crit),
  ]),
]);

const radarLines = [
  "  .      .          .        .      .  ",
  "       .        /|                    ",
  "    .         --O--       .           ",
  "              \\|                     .",
  " .     .            .         .       ",
  "scan arc: 247 deg   contacts: 4",
];

const centerColumn = Column({ flexGrow: 6, rowGap: 0, overflow: "hidden" }, [
  panel(
    "Trajectory",
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
    { subtitle: "orbital path", flexGrow: 1 },
  ),
  panel("Telemetry Grid", [telemetryGrid], {
    subtitle: "2x3 critical metrics",
    flexGrow: 1,
    borderStyle: "square",
  }),
  panel(
    "Thrust + Power",
    [
      barRow("Main reactor load", 63, THEME.info),
      barRow("Engine thrust reserve", 48, THEME.warn),
      barRow("Signal integrity", 92, THEME.ok),
    ],
    { subtitle: "bar monitors", flexGrow: 1 },
  ),
  panel(
    "Radar",
    radarLines.map((line, idx) =>
      Text({
        text: line,
        foreground: idx === 2 ? THEME.accent : THEME.fg1,
      }),
    ),
    { subtitle: "local contact sweep", flexGrow: 1, borderStyle: "square" },
  ),
]);

const rightColumn = Column({ flexGrow: 4, rowGap: 0, overflow: "hidden" }, [
  panel(
    "Event Timeline",
    [
      eventRow("13:54:20", "INFO", "window check complete"),
      eventRow("13:54:16", "WARN", "thermal spike near ring B"),
      eventRow("13:54:08", "OK", "antenna slew stabilized"),
      eventRow("13:53:49", "CRIT", "payload shutter timeout"),
      eventRow("13:53:22", "INFO", "uplink channel swapped"),
      eventRow("13:52:58", "OK", "nav solution converged"),
      eventRow("13:52:31", "INFO", "DSN handover complete"),
      eventRow("13:52:04", "WARN", "reaction wheel desaturation"),
    ],
    { subtitle: "newest first", flexGrow: 1 },
  ),
  panel(
    "Anomaly Feed",
    [
      Row({ justifyContent: "space-between" }, [
        Text({ text: "A-17 shutter jam", foreground: THEME.crit }),
        Text({ text: "owner: payload", foreground: THEME.fg1 }),
      ]),
      Row({ justifyContent: "space-between" }, [
        Text({ text: "A-14 gyro bias", foreground: THEME.warn }),
        Text({ text: "ack: investigating", foreground: THEME.warn }),
      ]),
      Row({ justifyContent: "space-between" }, [
        Text({ text: "A-09 thermal drift", foreground: THEME.warn }),
        Text({ text: "ack: pending", foreground: THEME.warn }),
      ]),
      Row({ justifyContent: "space-between" }, [
        Text({ text: "A-05 clock skew", foreground: THEME.info }),
        Text({ text: "ack: resolved", foreground: THEME.ok }),
      ]),
      Row({ justifyContent: "space-between" }, [
        Text({ text: "A-02 nav jitter", foreground: THEME.info }),
        Text({ text: "ack: complete", foreground: THEME.ok }),
      ]),
    ],
    { subtitle: "incident queue", flexGrow: 1, borderStyle: "square" },
  ),
  panel(
    "Comms",
    [
      commsRow("TX>", "cmd uplink sync --priority high"),
      commsRow("RX<", "ack uplink queue accepted"),
      commsRow("TX>", "cmd telemetry stream resume"),
      commsRow("RX<", "telemetry packet 228443 ok"),
      commsRow("RX<", "heartbeat seq 41902 nominal"),
      barRow("Packet quality", 94, THEME.ok),
      barRow("Signal strength", 87, THEME.info),
    ],
    { subtitle: "uplink / downlink", flexGrow: 1 },
  ),
]);

const main = Row({ flexGrow: 1, columnGap: 0, overflow: "hidden" }, [
  leftColumn,
  centerColumn,
  rightColumn,
]);

const footer = Column(
  {
    padding: "0 1",
    rowGap: 0,
  },
  [
    Row({ alignItems: "center", columnGap: 1 }, [
      Text({ text: ":", foreground: THEME.accent }),
      commandInput,
    ]),
    Row({ justifyContent: "space-between" }, [
      Text({
        text: "Tab:focus  Enter:exec  A:ack  P:pause  Q:quit",
        foreground: THEME.fg1,
      }),
      Text({
        text: "COMMAND ACCEPTED / ORBIT INSERTION WINDOW ACTIVE",
        foreground: THEME.ok,
      }),
    ]),
  ],
);

const root = Column(
  {
    flexGrow: 1,
    padding: "0 0",
    rowGap: 0,
    overflow: "hidden",
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
