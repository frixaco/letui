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
import { $ } from "./signals";

let text = $("HELLO WORLD");
let searchText = $("");
let buttonText = $("Search");
let nextButtonText = $("[N]ext");
let prevButtonText = $("[P]prev");

let rowcolStyles: ColumnProps | RowProps = {};

let inputStyles: Partial<InputBoxProps> = {
  border: {
    color: COLORS.default.fg,
    style: "square",
  },
  padding: "1 0",
};

run(
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
            text: searchText,
            onType: (v) => {
              searchText(v);
            },
            onBlur: () => {},
            onFocus: () => {},
          }),

          Button({
            ...inputStyles,
            text: buttonText,
            onClick: () => {},
          }),
        ],
      ),

      Column(
        {
          border: "none",
          gap: 1,
          padding: "1 0",
        },
        [
          Row(
            {
              ...rowcolStyles,
              padding: 0,
              border: "none",
            },
            [
              Column(
                {
                  ...rowcolStyles,
                  padding: 0,
                  border: "none",
                },
                [
                  Text({
                    ...inputStyles,
                    text: text,
                  }),
                ],
              ),
              Column(
                {
                  ...rowcolStyles,
                  padding: 0,
                  border: "none",
                },
                [
                  Text({
                    ...inputStyles,
                    text: text,
                  }),
                ],
              ),
            ],
          ),

          Row(
            {
              ...rowcolStyles,
              padding: 0,
              border: "none",
            },
            [
              Column(
                {
                  ...rowcolStyles,
                  padding: 0,
                  border: "none",
                },
                [
                  Text({
                    ...inputStyles,
                    text: text,
                  }),
                ],
              ),
              Column(
                {
                  ...rowcolStyles,
                  padding: 0,
                  border: "none",
                },
                [
                  Text({
                    ...inputStyles,
                    text: text,
                  }),
                ],
              ),
            ],
          ),
        ],
      ),

      Row(rowcolStyles, [
        Button({
          ...inputStyles,
          text: prevButtonText,
          onClick: () => {},
        }),

        Button({
          ...inputStyles,
          text: nextButtonText,
          onClick: () => {},
        }),
      ]),
    ],
  ),
);
