// AI CODING AGENT (similar to Claude Code, Codex, etc.):
// - TWO COLUMNS: LEFT - USER PROMPTS (NAVIGATABLE). RIGHT - LLM (CHANGES BASED ON PROMPT)
// - LONG BOTTOM AREA: EMBEDDED NEOVIM FOR RICH TEXT INPUT

import { COLORS } from "./colors";
import {
  Button,
  Column,
  InputBox,
  Row,
  run,
  type InputBoxProps,
} from "./components";
import { $ } from "./signals";

let searchText = $("");
let focusId = $("search-input");
// let buttonText = $("Search");
let results = $<ScrapeResultItem[]>([]);
let maxItems = $(1);
let page = $(0);

let inputStyles: Partial<InputBoxProps> = {
  border: {
    color: COLORS.default.fg,
    style: "square",
  },
  padding: "1 0",
};

type ScrapeResultItem = {
  title: string;
  size: string;
  date: string;
  magnet: string;
};

type ScrapeResult = {
  results: ScrapeResultItem[];
};

type TorrentFile = {};

type TorrentDetails = {
  id: number;
  info_hash: string;
  name: string;
  files: TorrentFile[];
};

type TorrentResponse = {
  id: number;
  details: TorrentDetails;
};

let logFile = Bun.file("logs.txt");
let logWriter = logFile.writer();

export function log(txt: string, ...args: string[]) {
  // logFile.write(txt + " " + args.join(" "));
  logWriter.write(txt + " " + args.join(" ") + "\n");
}

async function fetchResults(query: string) {
  const response = await fetch(
    `https://scrape.anitrack.frixaco.com/scrape?q=${query}`,
  );
  const data = (await response.json()) as ScrapeResult;

  results(data.results);
  page(0);
  if (data.results.length > 0) {
    focusId("result-button-0");
  }
}

async function streamResult(magnet: string) {
  const response = await fetch("https://rqbit.anitrack.frixaco.com/torrents", {
    method: "post",
    body: magnet,
  });
  const data = (await response.json()) as TorrentResponse;
  let streamUrl = `https://rqbit.anitrack.frixaco.com/torrents/${data.details.info_hash}/stream/${
    data.details.files.length - 1
  }`;
  Bun.spawn({
    cmd: ["mpv", streamUrl],
    stdout: "ignore",
    stderr: "ignore",
  });
}

run(
  (terminalWidth: number, termianlHeight: number) =>
    Column(
      {
        border: {
          color: COLORS.default.fg,
          style: "square",
        },
        gap: 1,
        padding: "1 0",
      },
      [
        Row(
          {
            border: "none",
            gap: 1,
            padding: "1 0",
          },
          [
            InputBox({
              ...inputStyles,
              id: "search-input",
              focus: true,
              text: searchText,
              border: {
                color:
                  focusId() === "search-input"
                    ? COLORS.default.green
                    : COLORS.default.fg,
                style: "square",
              },
              onType: (v) => {
                searchText(v);
              },
              onBlur: () => {},
              onFocus: () => {},
              onSubmit: (v) => {
                log("onSubmit +" + v);
                fetchResults(v);
              },
            }),

            // Button({
            //   ...inputStyles,
            //   id: "search-button",
            //   text: buttonText,
            //   onClick: () => {
            //     log("onSubmit +" + searchText());
            //     fetchResults(searchText());
            //   },
            // }),
          ],
        ),

        Column(
          {
            border: "none",
            gap: 1,
            padding: "1 0",
            onLayout: (node) => {
              const h = node.frame.height;
              const child = node.children[0];
              if (!child) return;

              const childH = child.frame.height;
              if (h && childH) {
                // Calculate available height by subtracting vertical padding and border
                let paddingY = 0;
                const { padding } = node.props;
                if (typeof padding === "number") {
                  paddingY = padding;
                } else if (typeof padding === "string") {
                  const parts = padding.split(" ").map(Number);
                  paddingY = parts.length === 2 ? parts[0]! : parts[0]!;
                }

                let borderY = 0;
                const { border } = node.props;
                if (border && border !== "none") {
                  borderY = 1;
                }

                const availableH = h - paddingY * 2 - borderY * 2;

                const gap = (node.props as any).gap || 0;
                log(
                  JSON.stringify({
                    childH,
                    availableH,
                    gap,
                  }),
                );
                const capacity = Math.ceil(availableH / childH);

                if (maxItems() !== capacity && capacity > 0) {
                  maxItems(capacity);
                }
              }
            },
          },
          results()
            .slice(page() * maxItems(), (page() + 1) * maxItems())
            .map((s, i) => {
              let text = $(s.title);
              let id = `result-button-${i}`;

              return Button({
                ...inputStyles,
                id,
                text: text,
                border: {
                  color:
                    focusId() === id ? COLORS.default.green : COLORS.default.fg,
                  style: "square",
                },
                onClick: () => {
                  streamResult(s.magnet);
                  log(`Clicked: ${s.title}`);
                },
                onKeyDown: (key) => {
                  const totalPages = Math.ceil(results().length / maxItems());
                  const currentPageSize = results().slice(
                    page() * maxItems(),
                    (page() + 1) * maxItems(),
                  ).length;
                  const currentIndex = i;

                  if (key === "l" || key === "\u001b[C") {
                    if (page() < totalPages - 1) {
                      page(page() + 1);
                      focusId("result-button-0");
                    }
                  } else if (key === "h" || key === "\u001b[D") {
                    if (page() > 0) {
                      page(page() - 1);
                      focusId("result-button-0");
                    }
                  } else if (key === "j" || key === "\u001b[B") {
                    if (currentIndex < currentPageSize - 1) {
                      focusId(`result-button-${currentIndex + 1}`);
                    }
                  } else if (key === "k" || key === "\u001b[A") {
                    if (currentIndex > 0) {
                      focusId(`result-button-${currentIndex - 1}`);
                    } else {
                      focusId("search-input");
                    }
                  }
                },
              });
            }),
        ),
      ],
    ),
  [results, focusId, maxItems, page],
  focusId,
);

logWriter.flush();
