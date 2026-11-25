import { describe, expect, it } from "vitest";
import { GitStatusEntry } from "../types";
import {
  filterVersionEntries,
  groupVersionEntries,
  isEntryStaged,
  stagedPaths,
  versionFileDir,
  versionFileName,
  versionTotals,
} from "./versionChanges";

function entry(
  path: string,
  index: string,
  worktree = "unmodified",
): GitStatusEntry {
  return { path, index, worktree };
}

describe("version change helpers", () => {
  it("classifies staged and untracked entries", () => {
    expect(isEntryStaged(entry("a.md", "modified", "modified"))).toBe(true);
    expect(isEntryStaged(entry("a.md", "untracked", "untracked"))).toBe(false);
    expect(isEntryStaged(entry("a.md", "unmodified", "modified"))).toBe(false);

    const groups = groupVersionEntries([
      entry("guion/acto-1.fountain", "modified", "modified"),
      entry("exports/acto.pdf", "untracked", "untracked"),
      entry("nuevo.md", "added", "unmodified"),
    ]);
    expect(groups.tracked.map((item) => item.path)).toEqual([
      "guion/acto-1.fountain",
      "nuevo.md",
    ]);
    expect(groups.untracked.map((item) => item.path)).toEqual([
      "exports/acto.pdf",
    ]);
  });

  it("filters by staged state and sums only visible entries", () => {
    const entries = [
      entry("a.md", "modified", "unmodified"),
      entry("b.md", "unmodified", "modified"),
      entry("c.md", "untracked", "untracked"),
    ];
    expect(filterVersionEntries(entries, "staged").map((item) => item.path)).toEqual([
      "a.md",
    ]);
    expect(
      filterVersionEntries(entries, "unstaged").map((item) => item.path),
    ).toEqual(["b.md", "c.md"]);
    expect(stagedPaths(entries)).toEqual(["a.md"]);

    const totals = versionTotals(entries, {
      "a.md": { path: "a.md", added: 3, removed: 1 },
      "b.md": { path: "b.md", added: 2, removed: 4 },
      "c.md": { path: "c.md", added: 5, removed: 0 },
    });
    expect(totals).toEqual({ added: 10, removed: 5 });
  });

  it("splits file names from folders", () => {
    expect(versionFileName("biblioteca/personajes/elena.md")).toBe("elena.md");
    expect(versionFileDir("biblioteca/personajes/elena.md")).toBe(
      "biblioteca/personajes",
    );
    expect(versionFileDir("README.md")).toBe("");
  });
});
