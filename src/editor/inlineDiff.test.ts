import { Text } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  buildInlineDiffHunks,
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
