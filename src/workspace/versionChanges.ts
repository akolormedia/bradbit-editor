import { GitFileChange, GitStatusEntry } from "../types";

export type VersionFilter = "all" | "staged" | "unstaged";

export interface VersionTotals {
  added: number;
  removed: number;
}

export interface VersionEntryGroups {
  tracked: GitStatusEntry[];
  untracked: GitStatusEntry[];
}

export function isEntryStaged(entry: GitStatusEntry): boolean {
  return !["unmodified", "untracked", "ignored", "conflicted"].includes(
    entry.index,
  );
}

export function isEntryUntracked(entry: GitStatusEntry): boolean {
  return entry.index === "untracked" || entry.worktree === "untracked";
}

export function groupVersionEntries(
  entries: GitStatusEntry[],
): VersionEntryGroups {
  const tracked: GitStatusEntry[] = [];
  const untracked: GitStatusEntry[] = [];
  for (const entry of entries) {
    if (isEntryUntracked(entry)) untracked.push(entry);
    else tracked.push(entry);
  }
  return { tracked, untracked };
}

export function filterVersionEntries(
  entries: GitStatusEntry[],
  filter: VersionFilter,
): GitStatusEntry[] {
  if (filter === "all") return entries;
  return entries.filter((entry) =>
    filter === "staged" ? isEntryStaged(entry) : !isEntryStaged(entry),
  );
}

export function versionTotals(
  entries: GitStatusEntry[],
  stats: Record<string, GitFileChange>,
): VersionTotals {
  let added = 0;
  let removed = 0;
  for (const entry of entries) {
    const stat = stats[entry.path];
    if (!stat) continue;
    added += stat.added;
    removed += stat.removed;
  }
  return { added, removed };
}

export function stagedPaths(entries: GitStatusEntry[]): string[] {
  return entries.filter(isEntryStaged).map((entry) => entry.path);
}

export function formatVersionCount(value: number): string {
  return value.toLocaleString();
}

export function versionFileName(path: string): string {
  return path.split("/").pop() || path;
}

export function versionFileDir(path: string): string {
  const parts = path.split("/");
  parts.pop();
  return parts.join("/");
}
