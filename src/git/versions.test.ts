import { describe, expect, it } from "vitest";
import {
  changeBadge,
  changeLabel,
  commitFileKind,
  defaultVersionMessage,
  entryKind,
  formatVersionDate,
  isValidBranchName,
  isValidGitAuthor,
} from "./versions";

describe("version helpers (T-1.4.4)", () => {
  it("maps working-tree statuses to human change kinds", () => {
    expect(entryKind({ path: "a.md", index: "unmodified", worktree: "modified" })).toBe(
      "modified",
    );
    expect(entryKind({ path: "b.md", index: "untracked", worktree: "untracked" })).toBe(
      "added",
    );
    expect(entryKind({ path: "c.md", index: "unmodified", worktree: "deleted" })).toBe(
      "deleted",
    );
    expect(entryKind({ path: "d.md", index: "renamed", worktree: "unmodified" })).toBe(
      "renamed",
    );
    expect(entryKind({ path: "e.md", index: "conflicted", worktree: "modified" })).toBe(
      "conflicted",
    );
  });

  it("maps commit file status codes and badges", () => {
    expect(commitFileKind({ path: "a.md", oldPath: null, status: "M" })).toBe("modified");
    expect(commitFileKind({ path: "b.md", oldPath: null, status: "A" })).toBe("added");
    expect(commitFileKind({ path: "c.md", oldPath: null, status: "D" })).toBe("deleted");
    expect(commitFileKind({ path: "d.md", oldPath: "x.md", status: "R100" })).toBe(
      "renamed",
    );
    expect(changeBadge("added")).toBe("+");
    expect(changeBadge("conflicted")).toBe("!");
    expect(changeLabel("modified", "es")).toBe("Editado");
    expect(changeLabel("modified", "en")).toBe("Modified");
  });

  it("formats dates and default version messages deterministically", () => {
    const date = new Date(2026, 10, 5, 18, 30);
    expect(formatVersionDate(date.toISOString(), "es")).toBe("05 nov 2026 · 18:30");
    expect(formatVersionDate(date.toISOString(), "en")).toBe("05 Nov 2026 · 18:30");
    expect(defaultVersionMessage("es", date)).toBe("Versión del 05 nov 2026 · 18:30");
    expect(defaultVersionMessage("en", date)).toBe("Version of 05 Nov 2026 · 18:30");
  });

  it("validates authors and parallel draft names", () => {
    expect(isValidGitAuthor("Ana", "ana@example.com")).toBe(true);
    expect(isValidGitAuthor("", "ana@example.com")).toBe(false);
    expect(isValidGitAuthor("Ana", "ana.example.com")).toBe(false);

    expect(isValidBranchName("final-alternativo")).toBe(true);
    expect(isValidBranchName("equipo/acto-2")).toBe(true);
    expect(isValidBranchName("")).toBe(false);
    expect(isValidBranchName("-invalida")).toBe(false);
    expect(isValidBranchName("con espacios")).toBe(false);
    expect(isValidBranchName("a..b")).toBe(false);
    expect(isValidBranchName("rama/")).toBe(false);
  });
});
