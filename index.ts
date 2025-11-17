import { COLORS } from "./colors";
import {
  Button,
  Column,
  InputBox,
  Row,
  run,
  Text,
  type ColumnProps,
  type InputBoxProps,
  type RowProps,
} from "./components";
import { $, af } from "./signals";

let text = $("HELLO WORLD");
let searchText = $("");
let buttonText = $("Search");
let nextButtonText = $("[N]ext");
let prevButtonText = $("[P]prev");
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
};

type ScrapeResult = {
  results: ScrapeResultItem[];
};

let logFile = Bun.file("logs.txt");

function log(txt: string) {
  logFile.write(txt);
}

async function fetchResults(st: string) {
  const response = await fetch(
    `https://scrape.anitrack.frixaco.com/scrape?q=${st}`,
  );
  const data = (await response.json()) as ScrapeResult;

  log(JSON.stringify(data.results, null, 2));
  results(data.results);
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
          results().map((s) => {
            let text = $(s.title);

            return Text({
              ...inputStyles,
              text: text,
            });
          }),
        ),

        Row({}, [
          Button({
            ...inputStyles,
            id: "prev-button",
            text: prevButtonText,
            onClick: () => {},
          }),

          Button({
            ...inputStyles,
            id: "next-button",
            text: nextButtonText,
            onClick: () => {},
          }),
        ]),
      ],
    ),
  [results],
);
