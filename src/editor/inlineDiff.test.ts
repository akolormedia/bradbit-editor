import { Text } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  buildInlineDiffHunks,
  buildInlineDiffHunksFromLines,
  deletedRestoreText,
  hunkAnchorLine,
  hunkLineRange,
} from "./inlineDiff";

describe("inline Git diff hunks (T-3.9.2)", () => {
  it("returns no hunks when the document matches HEAD", () => {
    expect(buildInlineDiffHunks("uno\ndos\n", "uno\ndos\n")).toEqual([]);
  });

  it("marks every line of a new file as added", () => {
    const hunks = buildInlineDiffHunks("", "uno\ndos\n");
    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toMatchObject({
      kind: "added",
      addedLines: 2,
      deletedLines: 0,
      from: 0,
      to: 8,
    });
    expect(hunkLineRange(hunks[0], Text.of(["uno", "dos", ""]))).toEqual({
      fromLine: 1,
      toLine: 2,
    });
  });

  it("detects a modified line", () => {
    const hunks = buildInlineDiffHunks("uno\ndos\ntres", "uno\nDOS\ntres");
    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toMatchObject({
      kind: "modified",
      addedLines: 1,
      deletedLines: 1,
    });
    expect(hunkLineRange(hunks[0], Text.of(["uno", "DOS", "tres"]))).toEqual({
      fromLine: 2,
      toLine: 2,
    });
  });

  it("detects a pure deletion and keeps the deleted text", () => {
    const hunks = buildInlineDiffHunks("uno\ndos\ntres", "uno\ntres");
    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toMatchObject({
      kind: "deleted",
      addedLines: 0,
      deletedLines: 1,
      originalText: "dos\n",
    });
    expect(hunkAnchorLine(hunks[0], Text.of(["uno", "tres"]))).toBe(2);
  });

  it("treats a deleted final line as a deletion anchored at the end", () => {
    const hunks = buildInlineDiffHunks("uno\ndos\n", "uno\n");
    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toMatchObject({
      kind: "deleted",
      deletedLines: 1,
      originalText: "dos\n",
    });
    const doc = Text.of(["uno", ""]);
    expect(hunkAnchorLine(hunks[0], doc)).toBe(2);
  });

  it("converts Zed-style line hunks into editor ranges", () => {
    const original = "uno\ndos\ntres\ncuatro\n";
    const current = "uno\nDOS\ntres\ncuatro\ncinco\n";
    const hunks = buildInlineDiffHunksFromLines(original, current, [
      {
        kind: "modified",
        originalStart: 1,
        originalEnd: 2,
        currentStart: 1,
        currentEnd: 2,
      },
      {
        kind: "added",
        originalStart: 4,
        originalEnd: 4,
        currentStart: 4,
        currentEnd: 5,
      },
    ]);

    expect(hunks[0]).toMatchObject({
      kind: "modified",
      originalFrom: 4,
      originalTo: 8,
      from: 4,
      to: 8,
      originalText: "dos\n",
    });
    expect(hunks[1]).toMatchObject({
      kind: "added",
      addedLines: 1,
      deletedLines: 0,
      from: 20,
      to: 26,
    });
    expect(hunkLineRange(hunks[1], Text.of(current.split("\n")))).toEqual({
      fromLine: 5,
      toLine: 5,
    });
  });

  it("restores a deletion between lines without merging paragraphs", () => {
    const current = "uno\ntres";
    expect(deletedRestoreText(current, 4, "dos\n")).toBe("dos\n");
  });

  it("adds a leading newline when restoring at the end of a file", () => {
    expect(deletedRestoreText("uno", 3, "dos")).toBe("\ndos");
  });

  it("adds a trailing newline when the restored block has none", () => {
    expect(deletedRestoreText("uno\ntres", 4, "dos")).toBe("dos\n");
  });
});
