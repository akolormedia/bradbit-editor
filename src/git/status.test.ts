import { describe, expect, it } from "vitest";
import { badgeClass, badgeForEntry, buildGitBadgeMap } from "./status";

function entry(
  path: string,
  worktree: string,
  index = "unmodified",
) {
  return { path, index, worktree };
}

describe("Git status badges (T-1.4.2)", () => {
  it("maps modified, added, deleted, renamed and conflicted states", () => {
    expect(badgeForEntry(entry("a.md", "modified"))).toBe("M");
    expect(badgeForEntry(entry("b.md", "unmodified", "added"))).toBe("+");
    expect(badgeForEntry(entry("c.md", "deleted"))).toBe("D");
    expect(badgeForEntry(entry("d.md", "renamed"))).toBe("R");
    expect(badgeForEntry(entry("e.md", "conflicted"))).toBe("!");
    expect(badgeForEntry(entry("f.md", "untracked"))).toBe("+");
  });

  it("prefers the working-tree state over the index state", () => {
    expect(badgeForEntry(entry("a.md", "modified", "added"))).toBe("M");
    expect(badgeForEntry(entry("a.md", "deleted", "modified"))).toBe("D");
  });

  it("builds a path-to-badge map and reusable CSS classes", () => {
    const map = buildGitBadgeMap([
      entry("biblia/premisa.md", "modified"),
      entry("guion/acto-1.fountain", "untracked"),
    ]);
    expect(map.get("biblia/premisa.md")).toBe("M");
    expect(map.get("guion/acto-1.fountain")).toBe("+");
    expect(badgeClass("M")).toBe("modified");
    expect(badgeClass("+")).toBe("added");
    expect(badgeClass("D")).toBe("deleted");
    expect(badgeClass("!")).toBe("conflicted");
  });
});
