/**
 * Command-palette presentation with stable modal nodes.
 * Picker state -> filtered window -> cached row mutations -> reusable panel
 */

import { Box, Button, Column, ScrollView, Text } from "@";
import type { Node, StyledText } from "@";
import { styled } from "../helpers.ts";
import { THEME, logoText } from "./theme.ts";

export class PickerView {
  readonly node: ReturnType<typeof Column>;

  constructor() {
    this.logo = Text({
      text: "",
      width: 50,
      height: 7,
      alignSelf: "center",
      wrap: "none",
    });
    this.topLine = Text({ text: "", height: 1, foreground: THEME.line, wrap: "none" });
    this.bottomLine = Text({ text: "", height: 1, foreground: THEME.line, wrap: "none" });
    this.query = Text({ text: "", height: 1, paddingX: 1 });
    this.rows = Array.from({ length: 20 }, (_, index) => {
      const title = Text({ text: "", height: 1, wrap: "none", textOverflow: "ellipsis" });
      const button = Button(
        {
          text: "",
          height: 1,
          marginX: 1,
          background: THEME.panel,
          onClick: () => this.selectRow(index),
          onKeyDown: (key) => this.onKeyDown?.(key) ?? false,
        },
        [title],
      );
      return { button, title, renderKey: "" };
    });
    this.listBody = Column(
      {
        height: 18,
        background: THEME.panel,
        borderLeft: { color: THEME.line },
        borderRight: { color: THEME.line },
      },
      pickerListChildren(this.query, this.rows),
    );
    this.splitList = Column({ minHeight: 0 }, []);
    this.previewHeader = Text({
      text: "Thread Preview",
      height: 1,
      alignSelf: "center",
      foreground: THEME.text,
      wrap: "none",
    });
    this.previewEmpty = Text({ text: "No transcript yet", foreground: THEME.muted });
    this.previewScroll = ScrollView(
      {
        flexGrow: 1,
        minHeight: 0,
        gap: 1,
        paddingX: 1,
        onScroll: ({ deltaY }) => this.previewScroll.scrollBy(deltaY * 3),
      },
      [this.previewEmpty],
    );
    this.previewScrollbar = Text({
      text: "",
      position: "absolute",
      right: 1,
      bottom: 1,
      width: 0,
      height: 0,
      wrap: "none",
      foreground: THEME.scrollTrack,
    });
    this.previewFrame = Column(
      {
        flexGrow: 1,
        minWidth: 0,
        minHeight: 0,
        marginX: 1,
        marginY: 1,
        border: { color: THEME.line, style: "rounded" },
      },
      [
        Text({ text: "", height: 1 }),
        this.previewHeader,
        Text({ text: "", height: 1 }),
        this.previewScroll,
        this.previewScrollbar,
      ],
    );
    this.splitBody = Box(
      {
        direction: "row",
        minHeight: 0,
        background: THEME.panel,
        borderLeft: { color: THEME.line },
        borderRight: { color: THEME.line },
      },
      [this.splitList, this.previewFrame],
    );
    this.panel = Column(
      {
        width: 38,
        maxWidth: 38,
        height: 20,
        maxHeight: 20,
        alignSelf: "center",
        background: THEME.panel,
      },
      [this.topLine, this.listBody, this.bottomLine],
    );
    this.decoratedTopSpacer = Text({ text: "", height: 7 });
    this.decoratedLogoGap = Text({ text: "", height: 1 });
    this.decoratedContent = [
      this.decoratedTopSpacer,
      this.logo,
      this.decoratedLogoGap,
      this.panel,
      Text({ text: "", height: 3 }),
      Column({ flexGrow: 1, minHeight: 0 }, []),
    ];
    this.centeredContent = [
      Column({ flexGrow: 1, minHeight: 0, alignItems: "center", justifyContent: "center" }, [
        this.panel,
      ]),
    ];
    this.node = Column({ flexGrow: 1, minHeight: 0 }, []);
  }

  render(
    state: PickerState,
    layout: PickerLayout,
    onSelect: (option: PickerOption) => void,
    onKeyDown: (key: string) => boolean,
  ): void {
    this.onSelect = onSelect;
    this.onKeyDown = onKeyDown;
    const filtered = filteredPickerOptions(state);
    state.selectedIndex = clamp(state.selectedIndex, 0, Math.max(0, filtered.length - 1));
    const split = state.layout === "split" && layout.width >= 90 && layout.height >= 26;
    const wide = state.layout === "wide" && layout.width >= 120 && layout.height >= 30;
    const rowCapacity = wide ? 20 : 15;
    const windowStart = clamp(
      state.selectedIndex - Math.floor(rowCapacity / 2),
      0,
      Math.max(0, filtered.length - rowCapacity),
    );
    this.visibleOptions = filtered.slice(windowStart, windowStart + rowCapacity);
    const width = split
      ? clamp(Math.floor(layout.width) - 10, 82, 140)
      : wide
        ? clamp(Math.floor(layout.width) - 66, 80, 110)
        : clamp(Math.floor(layout.width || 72) - 4, 38, 80);
    const height = split ? clamp(Math.floor(layout.height) - 4, 24, 45) : wide ? 26 : 20;
    const insideWidth = width - 2;
    const listWidth = split ? Math.floor((insideWidth - 1) * 0.5) : insideWidth;
    const rowWidth = split ? listWidth : insideWidth - 2;
    const previewWidth = Math.max(0, insideWidth - listWidth - 1);
    if (this.panelWidth !== width || this.panelHeight !== height) {
      this.panelWidth = width;
      this.panelHeight = height;
      this.panel.setStyle({ width, maxWidth: width, height, maxHeight: height });
    }
    if (this.split !== split) {
      this.split = split;
      if (split) {
        this.splitList.setChildren(pickerListChildren(this.query, this.rows));
        this.panel.setChildren([this.topLine, this.splitBody, this.bottomLine]);
      } else {
        this.listBody.setChildren(pickerListChildren(this.query, this.rows));
        this.panel.setChildren([this.topLine, this.listBody, this.bottomLine]);
      }
    }
    if (split) {
      this.splitBody.setStyle({ height: height - 2 });
      this.splitList.setStyle({ width: listWidth, minWidth: listWidth, maxWidth: listWidth });
    } else {
      this.listBody.setStyle({ height: height - 2 });
    }
    const nextFrameKey = `${state.title}\0${width}\0${split ? 1 : 0}\0${wide ? 1 : 0}`;
    if (this.frameKey !== nextFrameKey) {
      this.frameKey = nextFrameKey;
      this.topLine.setText(framedTopLine(state.title, width));
      this.bottomLine.setText(
        split
          ? framedBottomLine(width)
          : wide
            ? framedHistoryBottomLine(width)
            : `╰${"─".repeat(Math.max(0, width - 2))}╯`,
      );
    }
    if (this.queryKey !== state.query) {
      this.queryKey = state.query;
      this.query.setText(
        styled([
          { text: "> ", foreground: THEME.text },
          { text: state.query, foreground: THEME.text },
          { text: "█", foreground: THEME.text },
        ]),
      );
    }

    for (const [index, row] of this.rows.entries()) {
      if (index >= rowCapacity) {
        const renderKey = `inactive\0${rowWidth}`;
        if (row.renderKey !== renderKey) {
          row.renderKey = renderKey;
          row.title.setText("");
          row.button.setStyle({ height: 0, width: rowWidth, background: THEME.panel });
        }
        continue;
      }
      const option = this.visibleOptions[index];
      if (!option) {
        const renderKey = `empty\0${rowWidth}\0${wide ? 1 : 0}`;
        if (row.renderKey !== renderKey) {
          row.renderKey = renderKey;
          row.title.setText("");
          row.button.setStyle({
            width: rowWidth,
            minWidth: rowWidth,
            maxWidth: rowWidth,
            height: 1,
            background: THEME.panel,
          });
        }
        continue;
      }
      const selected = index + windowStart === state.selectedIndex;
      const category = split ? option.category : option.category.padStart(8);
      const shortcut = option.shortcut ?? "";
      const renderKey = `${rowWidth}\0${split ? 1 : 0}\0${wide ? 1 : 0}\0${selected ? 1 : 0}\0${category}\0${option.title}\0${shortcut}`;
      if (row.renderKey === renderKey) continue;
      row.renderKey = renderKey;
      row.title.setText(
        split
          ? splitRowText(option, category, rowWidth, selected)
          : wide
            ? wideRowText(option, rowWidth, selected)
            : pickerRowText(option, category, shortcut, rowWidth, selected),
      );
      row.button.setStyle({
        width: rowWidth,
        minWidth: rowWidth,
        maxWidth: rowWidth,
        height: 1,
        background: selected ? THEME.highlight : THEME.panel,
      });
    }

    if (split) {
      this.renderPreview(filtered[state.selectedIndex], previewWidth);
      this.renderPreviewScrollbar();
    }

    this.wide = wide;
    this.decoratedTopSpacer.setStyle({ height: wide ? 4 : 12 });
    this.decoratedLogoGap.setStyle({ height: wide ? 1 : 0 });
    this.logo.setStyle({
      height: wide ? 7 : 3,
      alignSelf: wide ? "center" : "start",
      position: "relative",
      right: wide ? 0 : -Math.max(0, Math.floor((layout.width - 104) / 2)),
    });
    if (wide) this.logo.setText("");
    const decorated = !split && (wide || layout.decorateEmptyState) && layout.height >= 40;
    if (this.decorated !== decorated) {
      this.decorated = decorated;
      this.node.setChildren(decorated ? this.decoratedContent : this.centeredContent);
    }
    if (this.focusTimer) clearTimeout(this.focusTimer);
    const selectedRow = this.rows[state.selectedIndex - windowStart];
    this.focusTimer =
      selectedRow && this.visibleOptions.length > 0
        ? setTimeout(() => {
            this.focusTimer = null;
            selectedRow.button.focus();
          }, 0)
        : null;
  }

  animateLogo(frame: number): void {
    if (!this.wide) this.logo.setText(logoText(frame, 0, 3));
  }

  private readonly logo: ReturnType<typeof Text>;
  private readonly panel: ReturnType<typeof Column>;
  private readonly topLine: ReturnType<typeof Text>;
  private readonly bottomLine: ReturnType<typeof Text>;
  private readonly query: ReturnType<typeof Text>;
  private readonly rows: PickerRowView[];
  private readonly listBody: ReturnType<typeof Column>;
  private readonly splitBody: ReturnType<typeof Box>;
  private readonly splitList: ReturnType<typeof Column>;
  private readonly previewFrame: ReturnType<typeof Column>;
  private readonly previewHeader: ReturnType<typeof Text>;
  private readonly previewEmpty: ReturnType<typeof Text>;
  private readonly previewScroll: ReturnType<typeof ScrollView>;
  private readonly previewScrollbar: ReturnType<typeof Text>;
  private readonly decoratedTopSpacer: ReturnType<typeof Text>;
  private readonly decoratedLogoGap: ReturnType<typeof Text>;
  private readonly decoratedContent: Node[];
  private readonly centeredContent: Node[];
  private visibleOptions: PickerOption[] = [];
  private onSelect: ((option: PickerOption) => void) | null = null;
  private onKeyDown: ((key: string) => boolean) | null = null;
  private focusTimer: ReturnType<typeof setTimeout> | null = null;
  private panelWidth = 0;
  private panelHeight = 0;
  private frameKey = "";
  private queryKey: string | null = null;
  private decorated: boolean | null = null;
  private wide = false;
  private split = false;
  private previewOption: PickerOption | undefined;
  private previewWidth = 0;

  private selectRow(index: number): void {
    const option = this.visibleOptions[index];
    if (option) this.onSelect?.(option);
  }

  private renderPreview(option: PickerOption | undefined, width: number): void {
    if (this.previewOption === option && this.previewWidth === width) return;
    this.previewOption = option;
    this.previewWidth = width;
    const contentWidth = Math.max(12, width - 4);
    if (option?.preview) {
      this.previewScroll.setChildren(option.preview(contentWidth));
    } else {
      this.previewEmpty.setText(option ? "No transcript yet" : "No matching thread");
      this.previewScroll.setChildren([this.previewEmpty]);
    }
    setTimeout(() => {
      if (this.previewOption === option) this.previewScroll.scrollToEnd();
    }, 0);
  }

  private renderPreviewScrollbar(): void {
    const viewportHeight = Math.max(0, Math.floor(this.previewScroll.viewportHeight()));
    const contentHeight = Math.max(0, Math.ceil(this.previewScroll.contentHeight()));
    const maxScroll = this.previewScroll.maxScrollY();
    if (viewportHeight === 0 || contentHeight <= viewportHeight) {
      this.previewScroll.setStyle({ width: undefined });
      this.previewScrollbar.setText("");
      this.previewScrollbar.setStyle({ width: 0, height: 0 });
      return;
    }

    this.previewScroll.setStyle({ width: Math.max(0, this.previewFrame.frameWidth() - 3) });
    const thumbHeight = clamp(
      Math.round((viewportHeight * viewportHeight) / contentHeight),
      1,
      viewportHeight,
    );
    const travel = viewportHeight - thumbHeight;
    const thumbStart =
      maxScroll > 0 ? Math.round((this.previewScroll.scrollY() / maxScroll) * travel) : 0;
    this.previewScrollbar.setText(
      styled(
        Array.from({ length: viewportHeight }, (_, index) => ({
          text: `█${index < viewportHeight - 1 ? "\n" : ""}`,
          foreground:
            index >= thumbStart && index < thumbStart + thumbHeight
              ? THEME.scrollThumb
              : THEME.scrollTrack,
        })),
      ),
    );
    this.previewScrollbar.setStyle({ width: 1, height: viewportHeight });
  }
}

export type PickerOption = {
  category: string;
  title: string;
  description: string;
  shortcut?: string;
  enabled?: boolean;
  preview?: (width: number) => Node[];
  run: () => void | Promise<void>;
};

export type PickerState = {
  title: string;
  options: PickerOption[];
  query: string;
  selectedIndex: number;
  layout?: "list" | "split" | "wide";
  search?: (query: string) => PickerOption[];
};

type PickerRowView = {
  button: ReturnType<typeof Button>;
  title: ReturnType<typeof Text>;
  renderKey: string;
};

export function filteredPickerOptions(state: PickerState): PickerOption[] {
  const query = state.query.trim().toLowerCase();
  if (!query) return state.options;
  return state.search?.(query) ?? [];
}

export function emptyOption(title: string, description: string): PickerOption {
  return { category: "empty", title, description, enabled: false, run: () => {} };
}

type PickerLayout = {
  width: number;
  height: number;
  decorateEmptyState: boolean;
};

function framedTopLine(title: string, width: number): StyledText {
  return styled([
    { text: "╭─ ", foreground: THEME.line },
    { text: title, foreground: THEME.highlight, bold: true },
    {
      text: ` ${"─".repeat(Math.max(0, width - title.length - 5))}╮`,
      foreground: THEME.line,
    },
  ]);
}

function framedBottomLine(width: number): StyledText {
  const firstKey = "Opt+W/Ctrl+T";
  const middle = " all workspaces · ";
  const secondKey = "Esc";
  const suffix = " close";
  const labelLength = firstKey.length + middle.length + secondKey.length + suffix.length;
  return styled([
    {
      text: `╰${"─".repeat(Math.max(1, width - labelLength - 5))} `,
      foreground: THEME.line,
    },
    { text: firstKey, foreground: THEME.shortcut },
    { text: middle, foreground: THEME.muted },
    { text: secondKey, foreground: THEME.shortcut },
    { text: suffix, foreground: THEME.muted },
    { text: " ─╯", foreground: THEME.line },
  ]);
}

function framedHistoryBottomLine(width: number): StyledText {
  const firstKey = "Opt+W/Ctrl+T";
  const suffix = " toggle filter · Showing: current workspace";
  return styled([
    {
      text: `╰${"─".repeat(Math.max(1, width - firstKey.length - suffix.length - 5))} `,
      foreground: THEME.line,
    },
    { text: firstKey, foreground: THEME.shortcut },
    { text: suffix, foreground: THEME.muted },
    { text: " ─╯", foreground: THEME.line },
  ]);
}

function pickerListChildren(query: ReturnType<typeof Text>, rows: PickerRowView[]): Node[] {
  return [
    Text({ text: "", height: 1 }),
    query,
    Text({ text: "", height: 1 }),
    ...rows.map((row) => row.button),
  ];
}

function pickerRowText(
  option: PickerOption,
  category: string,
  shortcut: string,
  rowWidth: number,
  selected: boolean,
): StyledText {
  const prefixLength = 1 + category.length + 2 + option.title.length;
  const shortcutGap = shortcut
    ? " ".repeat(Math.max(2, rowWidth - 1 - prefixLength - shortcut.length))
    : "";
  return styled([
    { text: " ", foreground: selected ? THEME.shell : THEME.dim },
    { text: category, foreground: selected ? THEME.shell : THEME.muted },
    { text: "  ", foreground: selected ? THEME.shell : THEME.dim },
    {
      text: option.title,
      foreground: selected ? THEME.shell : THEME.text,
      bold: true,
    },
    { text: shortcutGap, foreground: selected ? THEME.shell : THEME.dim },
    { text: shortcut, foreground: THEME.shortcut, bold: true },
  ]);
}

function splitRowText(
  option: PickerOption,
  category: string,
  rowWidth: number,
  selected: boolean,
): StyledText {
  const title = ellipsize(option.title, Math.max(1, rowWidth - category.length - 4));
  const gap = " ".repeat(Math.max(2, rowWidth - title.length - category.length - 2));
  return styled([
    { text: ` ${title}`, foreground: selected ? THEME.shell : THEME.text },
    { text: gap, foreground: selected ? THEME.shell : THEME.dim },
    { text: category, foreground: THEME.text },
    { text: " ", foreground: selected ? THEME.shell : THEME.dim },
  ]);
}

function wideRowText(option: PickerOption, rowWidth: number, selected: boolean): StyledText {
  return styled([
    {
      text: `  ${ellipsize(option.title, Math.max(1, rowWidth - 3))}`,
      foreground: selected ? THEME.shell : THEME.text,
      background: selected ? THEME.highlight : THEME.panel,
    },
  ]);
}

function ellipsize(value: string, width: number): string {
  const characters = Array.from(value);
  return characters.length <= width
    ? value
    : `${characters.slice(0, Math.max(0, width - 1)).join("")}…`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
