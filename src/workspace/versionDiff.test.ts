import { describe, expect, it } from "vitest";
import {
  newFilePatch,
  parseVersionDiff,
  splitVersionDiffHunk,
} from "./versionDiff";

const PATCH = [
  "diff --git a/escena.md b/escena.md",
  "index 1234567..89abcde 100644",
  "--- a/escena.md",
  "+++ b/escena.md",
  "@@ -10,4 +10,5 @@ ## El gato",
  " Cleia tiene un gato.",
  "-El gato duerme.",
  "+El gato se llama Cholo.",
  "+Camina sobre el piano.",
  " La casa está en silencio.",
  "\\ No newline at end of file",
].join("\n");

describe("version diff parser", () => {
  it("keeps line numbers and kinds for an inline diff", () => {
    const parsed = parseVersionDiff(PATCH);
    expect(parsed.binary).toBe(false);
    expect(parsed.empty).toBe(false);
    expect(parsed.hunks).toHaveLength(1);
    expect(parsed.hunks[0].header).toBe("@@ -10,4 +10,5 @@ ## El gato");

    expect(parsed.hunks[0].lines).toEqual([
      { kind: "context", oldLine: 10, newLine: 10, text: "Cleia tiene un gato." },
      { kind: "removed", oldLine: 11, newLine: null, text: "El gato duerme." },
      {
        kind: "added",
        oldLine: null,
        newLine: 11,
        text: "El gato se llama Cholo.",
      },
      {
        kind: "added",
        oldLine: null,
        newLine: 12,
        text: "Camina sobre el piano.",
      },
      {
        kind: "context",
        oldLine: 12,
        newLine: 13,
        text: "La casa está en silencio.",
      },
      {
        kind: "meta",
        oldLine: null,
        newLine: null,
        text: "No newline at end of file",
      },
    ]);
  });

  it("recognizes binary patches and empty patches", () => {
    expect(
      parseVersionDiff("diff --git a/a.pdf b/a.pdf\nBinary files a/a.pdf and b/a.pdf differ\n")
        .binary,
    ).toBe(true);
    expect(parseVersionDiff("").empty).toBe(true);
    expect(parseVersionDiff("\n").empty).toBe(true);
  });

  it("pairs removed and added lines for a side-by-side view", () => {
    const parsed = parseVersionDiff(PATCH);
    expect(splitVersionDiffHunk(parsed.hunks[0])).toEqual([
      {
        kind: "context",
        left: {
          kind: "context",
          oldLine: 10,
          newLine: 10,
          text: "Cleia tiene un gato.",
        },
        right: {
          kind: "context",
          oldLine: 10,
          newLine: 10,
          text: "Cleia tiene un gato.",
        },
      },
      {
        kind: "changed",
        left: {
          kind: "removed",
          oldLine: 11,
          newLine: null,
          text: "El gato duerme.",
        },
        right: {
          kind: "added",
          oldLine: null,
          newLine: 11,
          text: "El gato se llama Cholo.",
        },
      },
      {
        kind: "changed",
        left: null,
        right: {
          kind: "added",
          oldLine: null,
          newLine: 12,
          text: "Camina sobre el piano.",
        },
      },
      {
        kind: "context",
        left: {
          kind: "context",
          oldLine: 12,
          newLine: 13,
          text: "La casa está en silencio.",
        },
        right: {
          kind: "context",
          oldLine: 12,
          newLine: 13,
          text: "La casa está en silencio.",
        },
      },
      {
        kind: "meta",
        left: {
          kind: "meta",
          oldLine: null,
          newLine: null,
          text: "No newline at end of file",
        },
        right: null,
      },
    ]);
  });

  it("renders new files as additions", () => {
    const parsed = parseVersionDiff(newFilePatch("nuevo.md", "uno\ndos\n"));
    expect(parsed.hunks[0].lines).toEqual([
      { kind: "added", oldLine: null, newLine: 1, text: "uno" },
      { kind: "added", oldLine: null, newLine: 2, text: "dos" },
    ]);
  });
});
