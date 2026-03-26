#!/usr/bin/env bun
/**
 * dif - A terminal diff viewer built with LeTUI
 * 
 * Usage:
 *   bun run examples/dif/index.ts        # show unstaged changes
 *   bun run examples/dif/index.ts --all  # show staged + unstaged + untracked changes
 */

import { $, ff, onKey, run } from "../../index";
import { Column, Row, ScrollView, Text } from "../../index";
import { parsePatchFiles, type FileDiffMetadata } from "@pierre/diffs";

// =============================================================================
// THEME
// =============================================================================

const C = {
  bg: 0x0d1117,
  panel: 0x161b22,
  panelAlt: 0x21262d,
  border: 0x30363d,
  text: 0xc9d1d9 as number,
  muted: 0x8b949e as number,
  green: 0x3fb950 as number,
  red: 0xf85149 as number,
  yellow: 0xd29922 as number,
  blue: 0x58a6ff as number,
  lineNum: 0x6e7681 as number,
};

const DIFF_COLUMN_GAP = 1;
const DIFF_CELL_PADDING_X = 1;

// =============================================================================
// TYPES
// =============================================================================

interface DiffFile {
  name: string;
  path: string;
  status: "added" | "deleted" | "modified" | "renamed" | "unknown";
  diff: FileDiffMetadata | null;
}

type DiffLine = {
  type: "context" | "deletion" | "addition" | "hunk-header";
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
};

type SideBySideLine = {
  left: { content: string; lineNum?: number };
  right: { content: string; lineNum?: number };
  type: "context" | "deletion" | "addition" | "hunk-header";
};

// =============================================================================
// GIT INTEGRATION
// =============================================================================

async function getStagedDiff(): Promise<string> {
  const proc = Bun.spawn(["git", "diff", "--staged", "--patch"], {
    stdout: "pipe",
  });
  return await new Response(proc.stdout).text();
}

async function getUnstagedDiff(): Promise<string> {
  const proc = Bun.spawn(["git", "diff", "--patch"], {
    stdout: "pipe",
  });
  return await new Response(proc.stdout).text();
}

async function getUntrackedFiles(): Promise<{ name: string; path: string }[]> {
  const proc = Bun.spawn(["git", "status", "--porcelain=v1", "-uall"], {
    stdout: "pipe",
  });
  const output = await new Response(proc.stdout).text();
  const files: { name: string; path: string }[] = [];

  for (const line of output.split("\n")) {
    if (!line) continue;
    const status = line.slice(0, 2);
    const path = line.slice(3).trim();
    if (path && status === "??") {
      files.push({ name: path.split("/").pop() ?? path, path });
    }
  }

  return files;
}

async function getAllDiff(): Promise<{
  staged: string;
  unstaged: string;
  untracked: { name: string; path: string }[];
}> {
  const [staged, unstaged, untracked] = await Promise.all([
    getStagedDiff(),
    getUnstagedDiff(),
    getUntrackedFiles(),
  ]);
  return { staged, unstaged, untracked };
}

function buildFileList(
  staged: string,
  unstaged: string,
  untracked: { name: string; path: string }[],
): DiffFile[] {
  const files: DiffFile[] = [];
  const seen = new Set<string>();

  // Parse staged patches
  if (staged) {
    try {
      const patches = parsePatchFiles(staged);
      for (const patch of patches) {
        for (const diff of patch.files) {
          if (!seen.has(diff.name)) {
            seen.add(diff.name);
            files.push({
              name: diff.name,
              path: diff.name,
              status: getStatusFromType(diff.type),
              diff,
            });
          }
        }
      }
    } catch (e) {
      console.error("Error parsing staged diff:", e);
    }
  }

  // Parse unstaged patches
  if (unstaged) {
    try {
      const patches = parsePatchFiles(unstaged);
      for (const patch of patches) {
        for (const diff of patch.files) {
          if (!seen.has(diff.name)) {
            seen.add(diff.name);
            files.push({
              name: diff.name,
              path: diff.name,
              status: getStatusFromType(diff.type),
              diff,
            });
          } else {
            // Update existing file's diff
            const existing = files.find((f) => f.name === diff.name);
            if (existing && diff.hunks.length > 0) {
              existing.diff = diff;
            }
          }
        }
      }
    } catch (e) {
      console.error("Error parsing unstaged diff:", e);
    }
  }

  // Add untracked files
  for (const file of untracked) {
    if (!seen.has(file.path)) {
      seen.add(file.path);
      files.push({
        name: file.name,
        path: file.path,
        status: "added",
        diff: null,
      });
    }
  }

  return files;
}

function getStatusFromType(type: string): DiffFile["status"] {
  switch (type) {
    case "new":
      return "added";
    case "deleted":
      return "deleted";
    case "rename-pure":
    case "rename-changed":
      return "renamed";
    case "change":
      return "modified";
    default:
      return "unknown";
  }
}

// =============================================================================
// DIFF LINE EXTRACTION
// =============================================================================

function stripTrailingLineBreak(text: string): string {
  return text.replace(/\r?\n$/, "");
}

function extractDiffLines(diff: FileDiffMetadata): DiffLine[] {
  const lines: DiffLine[] = [];

  for (const hunk of diff.hunks) {
    lines.push({
      type: "hunk-header",
      content: `@@ -${hunk.deletionStart},${hunk.deletionLines} +${hunk.additionStart},${hunk.additionLines} @@ ${hunk.hunkContext ?? ""}`,
    });

    for (const block of hunk.hunkContent) {
      if (block.type === "context") {
        for (let i = 0; i < block.lines; i++) {
          const lineIdx = block.additionLineIndex + i;
          const line = stripTrailingLineBreak(diff.additionLines[lineIdx] ?? "");
          lines.push({
            type: "context",
            content: ` ${line}`,
            oldLineNum: hunk.deletionStart + i,
            newLineNum: hunk.additionStart + i,
          });
        }
      } else if (block.type === "change") {
        for (let i = 0; i < block.deletions; i++) {
          const lineIdx = block.deletionLineIndex + i;
          const line = stripTrailingLineBreak(diff.deletionLines[lineIdx] ?? "");
          lines.push({
            type: "deletion",
            content: `-${line}`,
            oldLineNum: hunk.deletionStart + i,
          });
        }
        for (let i = 0; i < block.additions; i++) {
          const lineIdx = block.additionLineIndex + i;
          const line = stripTrailingLineBreak(diff.additionLines[lineIdx] ?? "");
          lines.push({
            type: "addition",
            content: `+${line}`,
            newLineNum: hunk.additionStart + i,
          });
        }
      }
    }
  }

  return lines;
}

function toSideBySide(lines: DiffLine[]): SideBySideLine[] {
  const result: SideBySideLine[] = [];

  for (const line of lines) {
    if (line.type === "hunk-header") {
      result.push({
        left: { content: line.content },
        right: { content: line.content },
        type: "hunk-header",
      });
    } else if (line.type === "context") {
      result.push({
        left: { content: line.content.slice(1), lineNum: line.oldLineNum },
        right: { content: line.content.slice(1), lineNum: line.newLineNum },
        type: "context",
      });
    } else if (line.type === "deletion") {
      result.push({
        left: { content: line.content.slice(1), lineNum: line.oldLineNum },
        right: { content: "" },
        type: "deletion",
      });
    } else if (line.type === "addition") {
      result.push({
        left: { content: "" },
        right: { content: line.content.slice(1), lineNum: line.newLineNum },
        type: "addition",
      });
    }
  }

  return result;
}

function formatLeftCellText(line: SideBySideLine): string {
  const lineNum = line.left.lineNum?.toString().padStart(4, " ") ?? "    ";
  const prefix = line.type === "hunk-header" ? "    " : lineNum + " ";
  return line.type === "hunk-header" ? line.left.content : prefix + line.left.content;
}

function formatRightCellText(line: SideBySideLine): string {
  if (line.type === "hunk-header") {
    return "";
  }

  const lineNum = line.right.lineNum?.toString().padStart(4, " ") ?? "    ";
  return lineNum + " " + line.right.content;
}

function getDiffCellOuterWidth(viewportWidth: number): number {
  const usableWidth = Math.max(2, Math.floor(viewportWidth) - DIFF_COLUMN_GAP);
  return Math.max(1, Math.floor(usableWidth / 2));
}

// =============================================================================
// COMPONENTS
// =============================================================================

function statusIcon(status: DiffFile["status"]): string {
  switch (status) {
    case "added":
      return "+";
    case "deleted":
      return "-";
    case "modified":
      return "~";
    case "renamed":
      return ">";
    default:
      return "?";
  }
}

function statusColor(status: DiffFile["status"]): number {
  switch (status) {
    case "added":
      return C.green;
    case "deleted":
      return C.red;
    case "modified":
      return C.yellow;
    case "renamed":
      return C.blue;
    default:
      return C.muted;
  }
}

// =============================================================================
// MAIN APP
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const showAll = args.includes("--all") || args.includes("-a");

  const { staged, unstaged, untracked } = await getAllDiff();
  const files = buildFileList(staged, unstaged, untracked);

  if (files.length === 0) {
    console.log("No changes found.");
    return;
  }

  const selectedIndex = $(0);

  const root = Column(
    { flexGrow: 1, gap: 0, background: C.bg },
    [],
  );

  const headerText = Text({
    text: ` dif ${showAll ? "--all" : ""}  ${files.length} file${files.length !== 1 ? "s" : ""}   j/k nav  q quit `,
    foreground: C.text,
    background: C.panel,
    paddingX: 1,
  });

  const fileRows = files.map(() =>
    Text({
      text: "",
      foreground: C.muted,
      background: C.panel,
      paddingX: 1,
      wrap: "char",
    }),
  );

  const fileListViewport = ScrollView({
    flexGrow: 0,
    width: 30,
    minWidth: 20,
    maxWidth: 40,
    minHeight: 0,
    background: C.panel,
  }, fileRows);

  type DiffRowNode = ReturnType<typeof Row> & {
    leftCell: ReturnType<typeof Text>;
    rightCell: ReturnType<typeof Text>;
  };

  const diffViewport = ScrollView({
    flexGrow: 1,
    minHeight: 0,
    background: C.panelAlt,
  }, []);

  function createDiffRow(line: SideBySideLine, cellOuterWidth: number): DiffRowNode {
    const leftCell = Text({
      text: formatLeftCellText(line),
      width: cellOuterWidth,
      minWidth: cellOuterWidth,
      maxWidth: cellOuterWidth,
      foreground: C.text,
      background: C.panelAlt,
      paddingX: DIFF_CELL_PADDING_X,
      wrap: "char",
    });
    const rightCell = Text({
      text: line.type === "hunk-header" ? "" : formatRightCellText(line),
      width: cellOuterWidth,
      minWidth: cellOuterWidth,
      maxWidth: cellOuterWidth,
      foreground: C.text,
      background: C.panelAlt,
      paddingX: DIFF_CELL_PADDING_X,
      wrap: "char",
    });
    const row = Row(
      { gap: 1, alignItems: "stretch", minHeight: 1, background: C.panelAlt },
      [leftCell, rightCell],
    ) as DiffRowNode;
    row.leftCell = leftCell;
    row.rightCell = rightCell;

    if (line.type === "deletion") {
      leftCell.setStyle({
        foreground: C.red,
        background: 0x2d1f1f,
      });
    } else if (line.type === "hunk-header") {
      leftCell.setStyle({
        foreground: C.blue,
        background: C.panelAlt,
      });
    } else {
      leftCell.setStyle({
        foreground: C.text,
        background: C.panelAlt,
      });
    }

    if (line.type === "addition") {
      rightCell.setStyle({
        foreground: C.green,
        background: 0x1f2d1f,
      });
    } else if (line.type === "hunk-header") {
      rightCell.setStyle({
        foreground: C.blue,
        background: C.panelAlt,
      });
    } else {
      rightCell.setStyle({
        foreground: C.text,
        background: C.panelAlt,
      });
    }

    return row;
  }

  const mainContent = Row({ flexGrow: 1, minHeight: 0, gap: 1, alignItems: "stretch" }, [
    fileListViewport,
    diffViewport,
  ]);

  root.setChildren([headerText, mainContent]);

  function renderFileList(): void {
    for (let index = 0; index < fileRows.length; index++) {
      const row = fileRows[index];
      const file = files[index];
      if (!row || !file) continue;
      const isSelected = index === selectedIndex();
      const icon = statusIcon(file.status);
      row.setText(` ${icon} ${file.name}`);
      row.setStyle({
        foreground: isSelected ? C.text : C.muted,
        background: isSelected ? 0x264f36 : C.panel,
      });
    }
  }

  function renderDiffContent(): void {
    const idx = selectedIndex();
    const file = files[idx];
    const cellOuterWidth = getDiffCellOuterWidth(diffViewport.viewportWidth());
    let lines: SideBySideLine[] = [];

    if (!file) {
      diffViewport.setChildren([]);
      return;
    }

    if (!file.diff) {
      lines = [
        { left: { content: "" }, right: { content: "" }, type: "hunk-header" },
        { left: { content: `Untracked: ${file.path}` }, right: { content: "" }, type: "context" },
        { left: { content: "(cannot show diff - file not tracked)" }, right: { content: "" }, type: "context" },
      ];
    } else {
      lines = toSideBySide(extractDiffLines(file.diff));
    }

    diffViewport.setChildren(lines.map((line) => createDiffRow(line, cellOuterWidth)));
  }

  let lastSelectedIndex = selectedIndex();

  function setSelectedFile(next: number): void {
    const clamped = Math.max(0, Math.min(files.length - 1, next));
    if (clamped === selectedIndex()) return;
    selectedIndex(clamped);
    diffViewport.scrollToStart();
  }

  onKey("j", () => {
    setSelectedFile(selectedIndex() + 1);
  });

  onKey("k", () => {
    setSelectedFile(selectedIndex() - 1);
  });

  onKey("\x1b[B", () => {
    setSelectedFile(selectedIndex() + 1);
  });

  onKey("\x1b[A", () => {
    setSelectedFile(selectedIndex() - 1);
  });

  ff(() => {
    diffViewport.viewportWidth();
    selectedIndex();
    renderFileList();
    if (lastSelectedIndex !== selectedIndex()) {
      lastSelectedIndex = selectedIndex();
      const row = fileRows[lastSelectedIndex];
      if (row) {
        fileListViewport.ensureVisible(row, "nearest");
      }
    }
    renderDiffContent();
  });

  const app = run(root);

  onKey("q", () => app.quit());
}

main().catch(console.error);
