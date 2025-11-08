import { COLORS } from "./colors";
import { Column, Row, run, Text } from "./components";
import { $ } from "./signals";

let text = $("Search");
let text2 = $("How are you?");
let text3 = $("prev");
let text4 = $("next");

run(
  Column(
    {
      border: {
        color: COLORS.default.fg,
        style: "square",
      },
      gap: 1,
      padding: "3 1",
    },
    [
      Row(
        {
          border: {
            color: COLORS.default.fg,
            style: "square",
          },
          gap: 1,
          padding: "3 1",
        },
        [
          Text({
            border: {
              color: COLORS.default.fg,
              style: "square",
            },
            padding: "3 1",
            text: text,
          }),
        ],
      ),
    ],
  ),
);

// run(
//   Column(
//     {
//       border: {
//         color: COLORS.default.fg,
//         style: "square",
//       },
//       gap: 1,
//       padding: "3 1",
//     },
//
//     [
//       Row(
//         {
//           border: {
//             color: COLORS.default.fg,
//             style: "square",
//           },
//           gap: 1,
//           padding: "3 1",
//         },
//         [
//           Row(
//             {
//               border: {
//                 color: COLORS.default.fg,
//                 style: "square",
//               },
//               gap: 1,
//               padding: "3 1",
//             },
//             [],
//           ),
//         ],
//       ),
//     ],
//   ),
// );

// run(
//   Column(
//     {
//       border: {
//         color: COLORS.default.fg,
//         style: "square",
//       },
//       gap: 1,
//       padding: "1 0",
//     },
//     [
//       Row(
//         {
//           gap: 1,
//           padding: "1 0",
//         },
//         [
//           InputBox({
//             border: {
//               color: COLORS.default.fg,
//               style: "square",
//             },
//             text: text4,
//             onType: (value: string) => {
//               text4(value);
//             },
//             onFocus: () => {
//               // set border color
//             },
//             onBlur: () => {
//               // reset border color
//             },
//           }),
//
//           Button({
//             padding: "3 1",
//             text: text,
//             onClick: () => {},
//           }),
//         ],
//       ),
//
//       Column(
//         {
//           border: {
//             color: COLORS.default.fg,
//             style: "square",
//           },
//           gap: 1,
//           padding: "1 0",
//         },
//         [
//           Row(
//             {
//               gap: 1,
//               padding: "1 0",
//             },
//             [
//               Text({
//                 border: {
//                   color: COLORS.default.fg,
//                   style: "square",
//                 },
//                 text: text2,
//               }),
//               Text({
//                 border: {
//                   color: COLORS.default.fg,
//                   style: "square",
//                 },
//                 text: text2,
//               }),
//             ],
//           ),
//         ],
//       ),
//
//       Row(
//         {
//           gap: 12,
//           padding: "1 0",
//         },
//         [
//           Button({
//             padding: "3 1",
//             text: text3,
//             onClick: () => {},
//           }),
//
//           Button({
//             padding: "3 1",
//             text: text4,
//             onClick: () => {},
//           }),
//         ],
//       ),
//     ],
//   ),
// );
