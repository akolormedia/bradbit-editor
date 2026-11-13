export type CompletionKind = "command" | "mention";

export interface CompletionToken {
  kind: CompletionKind;
  query: string;
  start: number;
  end: number;
}

export interface CommandCandidate {
  name: string;
  description?: string;
  aliases?: string[];
}

export interface FileCandidate {
  path: string;
  name?: string;
}

/**
 * Returns the `/command` or `@file` token under the cursor. Commands only
 * trigger at the beginning of the message; mentions trigger after whitespace.
 */
export function activeCompletion(
  text: string,
  cursor: number,
): CompletionToken | null {
  const position = Math.max(0, Math.min(cursor, text.length));
  const before = text.slice(0, position);
  const match = /(?:^|\s)([/@])([^\s]*)$/.exec(before);
  if (!match) return null;
  const symbol = match[1];
  const query = match[2];
  const start = position - query.length - 1;
  if (symbol === "/") {
    if (before.slice(0, start).trim().length > 0) return null;
    return { kind: "command", query, start, end: position };
  }
  return { kind: "mention", query, start, end: position };
}

export function filterCommands<T extends CommandCandidate>(
  commands: T[],
  query: string,
  limit = 20,
): T[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return commands.slice(0, limit);
  const scored: Array<{ command: T; score: number }> = [];
  for (const command of commands) {
    const name = command.name.toLowerCase();
    const description = (command.description ?? "").toLowerCase();
    const aliases = (command.aliases ?? []).map((alias) =>
      alias.toLowerCase(),
    );
    let score: number | null = null;
    if (name.startsWith(needle)) score = 0;
    else if (aliases.some((alias) => alias.startsWith(needle))) score = 0;
    else if (name.includes(needle)) score = 1;
    else if (aliases.some((alias) => alias.includes(needle))) score = 1;
    else if (description.includes(needle)) score = 2;
    if (score !== null) scored.push({ command, score });
  }
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      a.command.name.length - b.command.name.length ||
      a.command.name.localeCompare(b.command.name),
  );
  return scored.slice(0, Math.max(0, limit)).map((entry) => entry.command);
}

export function filterProjectFiles<T extends FileCandidate>(
  files: T[],
  query: string,
  limit = 50,
): T[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return files.slice(0, limit);
  const scored: Array<{ file: T; score: number }> = [];
  for (const file of files) {
    const name = (file.name ?? file.path.split("/").pop() ?? "").toLowerCase();
    const path = file.path.toLowerCase();
    let score: number | null = null;
    if (name === needle) score = 0;
    else if (name.startsWith(needle)) score = 1;
    else if (name.includes(needle)) score = 2;
    else if (path.includes(needle)) score = 3;
    if (score !== null) scored.push({ file, score });
  }
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      (a.file.name ?? a.file.path).length -
        (b.file.name ?? b.file.path).length ||
      a.file.path.localeCompare(b.file.path),
  );
  return scored.slice(0, Math.max(0, limit)).map((entry) => entry.file);
}

export function replaceCompletion(
  text: string,
  token: CompletionToken,
  replacement: string,
): { text: string; cursor: number } {
  const next = `${text.slice(0, token.start)}${replacement}${text.slice(token.end)}`;
  return { text: next, cursor: token.start + replacement.length };
}

export function parseSlashCommand(
  text: string,
): { name: string; args: string } | null {
  const match = /^\/([A-Za-z0-9_.-]+)(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!match) return null;
  return { name: match[1], args: (match[2] ?? "").trim() };
}
