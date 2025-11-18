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
let buttonText = $("Search");
let results = $<ScrapeResultItem[]>([]);

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

export function log(txt: string) {
  logFile.write(txt);
}

async function fetchResults(query: string) {
  const response = await fetch(
    `https://scrape.anitrack.frixaco.com/scrape?q=${query}`,
  );
  const data = (await response.json()) as ScrapeResult;

  log(JSON.stringify(data.results, null, 2));
  results(data.results);
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

            Button({
              ...inputStyles,
              id: "search-button",
              text: buttonText,
              onClick: () => {
                log("onSubmit +" + searchText());
                fetchResults(searchText());
              },
            }),
          ],
        ),

        Column(
          {
            border: "none",
            gap: 1,
            padding: "1 0",
          },
          results().map((s, i) => {
            let text = $(s.title);

            return Button({
              ...inputStyles,
              id: `result-button-${i}`,
              text: text,
              onClick: () => {
                streamResult(s.magnet);
                log(`Clicked: ${s.title}`);
              },
            });
          }),
        ),
      ],
    ),
  [results],
);
