import { Chunk } from "@codemirror/merge";
import { Text } from "@codemirror/state";
import { LineDiffHunk } from "../types";

/** A changed block between the last committed version and the open document. */
export interface InlineDiffHunk {
  kind: "added" | "modified" | "deleted";
  /** Character range in the current document. */
  from: number;
  to: number;
  /** Character range in the original document. */
  originalFrom: number;
  originalTo: number;
  addedLines: number;
  deletedLines: number;
  /** Original text covered by the hunk, including trailing newlines. */
  originalText: string;
}

interface LineSpan {
  fromLine: number;
  toLine: number;
  count: number;
}

function lineSpan(doc: Text, from: number, to: number): LineSpan {
  const start = Math.max(0, Math.min(from, doc.length));
  const end = Math.max(start, Math.min(to, doc.length));
  const fromLine = doc.lineAt(start).number;
  if (end <= start) {
    return { fromLine, toLine: fromLine, count: 0 };
  }
  const toLine = doc.lineAt(end - 1).number;
  return { fromLine, toLine, count: toLine - fromLine + 1 };
}

function textFor(original: string): Text {
  return Text.of(original.split("\n"));
}

/**
 * Computes line-oriented changes against the last committed version.
 *
 * Added lines are green, replacements yellow and pure deletions red. The
 * function is deliberately independent from CodeMirror views so it can be
 * tested and reused by the gutter, the popover and the overview ruler.
 */
export function buildInlineDiffHunks(
  original: string,
  current: string,
): InlineDiffHunk[] {
  if (original === current) return [];
  const before = textFor(original);
  const after = textFor(current);
  const hunks: InlineDiffHunk[] = [];

  for (const chunk of Chunk.build(before, after)) {
    const added = lineSpan(after, chunk.fromB, chunk.toB);
    const deleted = lineSpan(before, chunk.fromA, chunk.toA);
    if (added.count === 0 && deleted.count === 0) continue;

    const kind: InlineDiffHunk["kind"] =
      added.count === 0
        ? "deleted"
        : deleted.count === 0
          ? "added"
          : "modified";

    const originalFrom = Math.min(chunk.fromA, before.length);
    const originalTo = Math.min(Math.max(chunk.fromA, chunk.toA), before.length);

    hunks.push({
      kind,
      from: Math.min(chunk.fromB, after.length),
      to: Math.min(Math.max(chunk.fromB, chunk.toB), after.length),
      originalFrom,
      originalTo,
      addedLines: added.count,
      deletedLines: deleted.count,
      originalText: before.sliceString(originalFrom, originalTo),
    });
  }

  return hunks;
}

function lineOffsets(text: string): number[] {
  const offsets = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) offsets.push(index + 1);
  }
  return offsets;
}

/**
 * Converts line-oriented hunks (computed by the Rust backend with Zed's
 * imara-diff/Histogram algorithm) into editor positions.
 */
export function buildInlineDiffHunksFromLines(
  original: string,
  current: string,
  lineHunks: readonly LineDiffHunk[],
): InlineDiffHunk[] {
  const before = lineOffsets(original);
  const after = lineOffsets(current);
  const offset = (offsets: number[], line: number, length: number) =>
    Math.min(offsets[line] ?? length, length);

  return lineHunks.map((lineHunk) => {
    const originalFrom = offset(before, lineHunk.originalStart, original.length);
    const originalTo = offset(before, lineHunk.originalEnd, original.length);
    const from = offset(after, lineHunk.currentStart, current.length);
    const to = offset(after, lineHunk.currentEnd, current.length);
    return {
      kind: lineHunk.kind,
      from,
      to,
      originalFrom,
      originalTo,
      addedLines: Math.max(0, lineHunk.currentEnd - lineHunk.currentStart),
      deletedLines: Math.max(0, lineHunk.originalEnd - lineHunk.originalStart),
      originalText: original.slice(originalFrom, originalTo),
    };
  });
}

/** Current-document line range covered by a hunk. */
export function hunkLineRange(
  hunk: InlineDiffHunk,
  doc: Text,
): { fromLine: number; toLine: number } {
  const span = lineSpan(doc, hunk.from, hunk.to);
  return { fromLine: span.fromLine, toLine: span.toLine };
}

/** Line where a hunk's gutter marker is anchored. */
export function hunkAnchorLine(hunk: InlineDiffHunk, doc: Text): number {
  return doc.lineAt(Math.min(hunk.from, doc.length)).number;
}

/**
 * Text to insert when restoring deleted lines at `position`.
 *
 * Deleted chunks usually carry their trailing newline. When the deletion was
 * at the end of the file, the current document may need a leading newline so
 * the restored lines do not merge with the previous paragraph.
 */
export function deletedRestoreText(
  current: string,
  position: number,
  deletedText: string,
): string {
  if (!deletedText) return "";
  const pos = Math.max(0, Math.min(position, current.length));
  const before = pos > 0 ? current[pos - 1] : "\n";
  const after = pos < current.length ? current[pos] : "\n";

  let insert = deletedText;
  if (before !== "\n" && !insert.startsWith("\n")) {
    insert = `\n${insert}`;
  }
  if (after !== "\n" && !insert.endsWith("\n")) {
    insert = `${insert}\n`;
  }
  return insert;
}
