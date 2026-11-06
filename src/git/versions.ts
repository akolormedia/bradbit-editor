import { t } from "../i18n";
import { GitCommitFile, GitStatusEntry, Language } from "../types";

export type ChangeKind =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "copied"
  | "conflicted"
  | "unknown";

const MONTHS_ES = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

const MONTHS_EN = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Human category for a working-tree status entry. */
export function entryKind(entry: GitStatusEntry): ChangeKind {
  if (entry.index === "conflicted" || entry.worktree === "conflicted") {
    return "conflicted";
  }
  if (entry.index === "untracked" || entry.worktree === "untracked") {
    return "added";
  }
  const status =
    entry.worktree !== "unmodified" ? entry.worktree : entry.index;
  switch (status) {
    case "added":
      return "added";
    case "deleted":
      return "deleted";
    case "renamed":
      return "renamed";
    case "copied":
      return "copied";
    case "modified":
      return "modified";
    default:
      return "unknown";
  }
}

/** Human category for a file listed inside a commit (`M`, `R100`, …). */
export function commitFileKind(file: GitCommitFile): ChangeKind {
  if (file.status.startsWith("R")) return "renamed";
  if (file.status.startsWith("C")) return "copied";
  if (file.status.startsWith("A")) return "added";
  if (file.status.startsWith("D")) return "deleted";
  if (file.status.startsWith("M") || file.status.startsWith("T")) {
    return "modified";
  }
  return "unknown";
}

export function changeLabel(kind: ChangeKind, language: Language): string {
  switch (kind) {
    case "modified":
      return t(language, "changesModified");
    case "added":
      return t(language, "changesAdded");
    case "deleted":
      return t(language, "changesDeleted");
    case "renamed":
      return t(language, "changesRenamed");
    case "copied":
      return t(language, "changesCopied");
    case "conflicted":
      return t(language, "changesConflicted");
    default:
      return t(language, "changesUnknown");
  }
}

export function changeBadge(kind: ChangeKind): string {
  switch (kind) {
    case "modified":
      return "M";
    case "added":
      return "+";
    case "deleted":
      return "D";
    case "renamed":
      return "R";
    case "copied":
      return "C";
    case "conflicted":
      return "!";
    default:
      return "?";
  }
}

/** "05 nov 2026 · 18:30" without relying on locale data. */
export function formatVersionDate(iso: string, language: Language): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const months = language === "es" ? MONTHS_ES : MONTHS_EN;
  const day = String(date.getDate()).padStart(2, "0");
  const month = months[date.getMonth()] ?? "";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day} ${month} ${date.getFullYear()} · ${hours}:${minutes}`;
}

export function defaultVersionMessage(
  language: Language,
  date: Date = new Date(),
): string {
  const formatted = formatVersionDate(date.toISOString(), language);
  return language === "es" ? `Versión del ${formatted}` : `Version of ${formatted}`;
}

export function isValidGitAuthor(name: string, email: string): boolean {
  const normalizedName = name.trim();
  const normalizedEmail = email.trim();
  return (
    normalizedName.length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
  );
}

/** Mirrors the backend's conservative `validate_branch_name` rules. */
export function isValidBranchName(name: string): boolean {
  const candidate = name.trim();
  if (!candidate || candidate.length > 100) return false;
  if (
    candidate.startsWith("-") ||
    candidate.startsWith("/") ||
    candidate.endsWith("/") ||
    candidate.endsWith(".") ||
    candidate.endsWith(".lock")
  ) {
    return false;
  }
  if (candidate.includes("..") || candidate.includes("@{") || candidate.includes("//")) {
    return false;
  }
  if (
    candidate
      .split("/")
      .some((part) => !part || part.startsWith(".") || part.endsWith("."))
  ) {
    return false;
  }
  return !/[\s~^:?*[\\\x00-\x1f\x7f]/.test(candidate);
}
