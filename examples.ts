// AI CODING AGENT (similar to Claude Code, Codex, etc.):
// - TWO COLUMNS: LEFT - USER PROMPTS (NAVIGATABLE). RIGHT - LLM (CHANGES BASED ON PROMPT)
// - LONG BOTTOM AREA: EMBEDDED NEOVIM FOR RICH TEXT INPUT

import { COLORS } from "./colors";
import {
  type ButtonProps,
  type Node,
  type Ref,
  Button,
  Column,
  createRef,
  InputBox,
  Row,
  run,
  type InputBoxProps,
} from "./components";
import { $ } from "./signals";

let searchText = $("");
// TODO: broken
let focusId = $(0);
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

let inputRef = createRef<Node>();
let buttonRefs = new Map<number, Ref<Node>>();

async function fetchResults(query: string) {
  const response = await fetch(
    `https://scrape.anitrack.frixaco.com/scrape?q=${query}`,
  );
  const data = (await response.json()) as ScrapeResult;

  results(data.results);
  page(0);
  if (data.results.length > 0) {
    focusId(buttonRefs.get(0)?.current?.id || 0);
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
  () =>
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
            gap: 1,
            padding: "1 0",
          },
          [
            InputBox({
              ...inputStyles,
              ref: inputRef,
              focus: true,
              text: searchText,
              border: {
                color:
                  focusId() === inputRef.current?.id
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
                if (border) {
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
              let ref = buttonRefs.get(i) ?? createRef();
              buttonRefs.set(i, ref);

              return Button({
                ...inputStyles,
                ref,
                text: text,
                border: {
                  color:
                    focusId() === ref.current?.id
                      ? COLORS.default.green
                      : COLORS.default.fg,
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
                      focusId(buttonRefs.get(0)?.current?.id || 0);
                    }
                  } else if (key === "h" || key === "\u001b[D") {
                    if (page() > 0) {
                      page(page() - 1);
                      focusId(buttonRefs.get(0)?.current?.id || 0);
                    }
                  } else if (key === "j" || key === "\u001b[B") {
                    if (currentIndex < currentPageSize - 1) {
                      focusId(
                        buttonRefs.get(currentIndex + 1)?.current?.id || 0,
                      );
                    }
                  } else if (key === "k" || key === "\u001b[A") {
                    if (currentIndex > 0) {
                      focusId(
                        buttonRefs.get(currentIndex - 1)?.current?.id || 0,
                      );
                    } else {
                      focusId(inputRef.current?.id || 0);
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
