import { GitStatusEntry } from "../types";

export type GitBadge = "M" | "+" | "D" | "R" | "!" | "?";

export function badgeForEntry(entry: GitStatusEntry): GitBadge {
  if (entry.index === "conflicted" || entry.worktree === "conflicted") {
    return "!";
  }
  if (entry.worktree === "untracked") {
    return "+";
  }

  const status = entry.worktree !== "unmodified" ? entry.worktree : entry.index;
  switch (status) {
    case "added":
    case "untracked":
      return "+";
    case "deleted":
      return "D";
    case "renamed":
    case "copied":
      return "R";
    case "modified":
      return "M";
    case "conflicted":
      return "!";
    default:
      return "?";
  }
}

export function buildGitBadgeMap(
  entries: GitStatusEntry[],
): Map<string, GitBadge> {
  const map = new Map<string, GitBadge>();
  for (const entry of entries) {
    map.set(entry.path, badgeForEntry(entry));
  }
  return map;
}

export function badgeClass(badge: GitBadge): string {
  switch (badge) {
    case "M":
      return "modified";
    case "+":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "!":
      return "conflicted";
    default:
      return "unknown";
  }
}
