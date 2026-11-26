import { t } from "../i18n";
import { SearchBarQuery } from "../editor/searchBar";
import {
  Language,
  OpenTab,
  SearchContextLine,
  SearchMatch,
} from "../types";
import type { TabListState } from "./state";

export const PROJECT_SEARCH_PATH = "bradbit://project-search";

export interface ProjectSearchGroup {
  path: string;
  matches: SearchMatch[];
}

export interface SearchHighlightRange {
  start: number;
  end: number;
}

export interface ProjectSearchContextBlock {
  start: number;
  end: number;
  lines: SearchContextLine[];
}

export interface ProjectReplaceTextResult {
  content: string;
  replacements: number;
}

export function isProjectSearchPath(
  path: string | null | undefined,
): boolean {
  return path === PROJECT_SEARCH_PATH;
}

export function openProjectSearchInTabs(
  state: TabListState,
  language: Language,
): TabListState {
  const name = t(language, "globalSearchTitle");
  const existing = state.tabs.find((tab) => tab.path === PROJECT_SEARCH_PATH);
  if (existing) {
    return {
      tabs: state.tabs.map((tab) =>
        tab.path === PROJECT_SEARCH_PATH ? { ...tab, name } : tab,
      ),
      activeTabPath: PROJECT_SEARCH_PATH,
    };
  }
  const tab: OpenTab = {
    path: PROJECT_SEARCH_PATH,
    name,
    content: "",
    savedContent: "",
    preview: false,
    cursorLine: 1,
    cursorCol: 1,
    viewMode: "edit",
  };
  return {
    tabs: [...state.tabs, tab],
    activeTabPath: PROJECT_SEARCH_PATH,
  };
}

export function groupProjectSearchMatches(
  matches: readonly SearchMatch[],
): ProjectSearchGroup[] {
  const groups = new Map<string, SearchMatch[]>();
  for (const match of matches) {
    const group = groups.get(match.path) ?? [];
    group.push(match);
    groups.set(match.path, group);
  }
  return [...groups].map(([path, groupMatches]) => ({
    path,
    matches: groupMatches,
  }));
}

export function projectSearchFileName(path: string): string {
  return path.split("/").pop() || path;
}

export function projectSearchSummary(
  language: Language,
  matches: number,
  files: number,
): string {
  if (matches === 1 && files === 1) {
    return t(language, "projectSearchSummaryOne");
  }
  if (matches === 1) {
    return t(language, "projectSearchSummaryOneMatch", {
      files: String(files),
    });
  }
  if (files === 1) {
    return t(language, "projectSearchSummaryOneFile", {
      matches: String(matches),
    });
  }
  return t(language, "projectSearchSummary", {
    matches: String(matches),
    files: String(files),
  });
}

export function projectSearchFileDir(path: string): string {
  const parts = path.split("/");
  parts.pop();
  return parts.join("/");
}

const WORD_CHARACTER = /[\p{L}\p{N}_]/u;

function isWordCharacterAt(text: string, index: number): boolean {
  if (index < 0 || index >= text.length) return false;
  return WORD_CHARACTER.test(text[index]);
}

function isWholeWordMatch(text: string, start: number, end: number): boolean {
  return !isWordCharacterAt(text, start - 1) && !isWordCharacterAt(text, end);
}

/**
 * Merges each match's 5-line window. Windows that touch or overlap become one
 * block; separated windows keep a divider so the file stays readable.
 */
export function buildProjectSearchContextBlocks(
  matches: readonly SearchMatch[],
): ProjectSearchContextBlock[] {
  const blocks: ProjectSearchContextBlock[] = [];
  for (const match of matches) {
    const context = match.context?.length
      ? match.context
      : [{ line: match.line, text: match.snippet, isMatch: true }];
    const start = context[0].line;
    const end = context[context.length - 1].line;
    const last = blocks[blocks.length - 1];
    if (last && start <= last.end + 1) {
      const merged = new Map<number, SearchContextLine>(
        last.lines.map((line) => [line.line, line]),
      );
      for (const line of context) {
        const previous = merged.get(line.line);
        merged.set(line.line, {
          ...line,
          isMatch: line.isMatch || previous?.isMatch === true,
        });
      }
      last.lines = [...merged.values()].sort((a, b) => a.line - b.line);
      last.end = Math.max(last.end, end);
      continue;
    }
    blocks.push({
      start,
      end,
      lines: [...context].sort((a, b) => a.line - b.line),
    });
  }
  return blocks;
}

function replaceRanges(
  line: string,
  ranges: SearchHighlightRange[],
  replacement: string,
): string {
  let result = line;
  for (let index = ranges.length - 1; index >= 0; index -= 1) {
    const range = ranges[index];
    result =
      result.slice(0, range.start) + replacement + result.slice(range.end);
  }
  return result;
}

function detectNewline(text: string): string {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

export function replaceSearchInLine(
  line: string,
  query: SearchBarQuery,
  replacement: string,
): { text: string; replacements: number } {
  const ranges = findSearchHighlights(line, query);
  if (ranges.length === 0) return { text: line, replacements: 0 };
  return {
    text: replaceRanges(line, ranges, replacement),
    replacements: ranges.length,
  };
}

export function replaceSearchInText(
  text: string,
  query: SearchBarQuery,
  replacement: string,
): ProjectReplaceTextResult {
  const newline = detectNewline(text);
  const lines = text.split(/\r?\n/);
  let replacements = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const result = replaceSearchInLine(lines[index], query, replacement);
    if (result.replacements === 0) continue;
    lines[index] = result.text;
    replacements += result.replacements;
  }
  return { content: lines.join(newline), replacements };
}

export function replaceSearchInTextAtLine(
  text: string,
  line: number,
  query: SearchBarQuery,
  replacement: string,
): ProjectReplaceTextResult {
  const newline = detectNewline(text);
  const lines = text.split(/\r?\n/);
  const index = line - 1;
  if (index < 0 || index >= lines.length) {
    return { content: text, replacements: 0 };
  }
  const result = replaceSearchInLine(lines[index], query, replacement);
  if (result.replacements === 0) return { content: text, replacements: 0 };
  lines[index] = result.text;
  return { content: lines.join(newline), replacements: result.replacements };
}

/** Client-side ranges for painting the query inside a result snippet. */
export function findSearchHighlights(
  text: string,
  query: SearchBarQuery,
): SearchHighlightRange[] {
  if (!query.search) return [];
  const ranges: SearchHighlightRange[] = [];
  const limit = 100;

  if (query.regexp) {
    let matcher: RegExp;
    try {
      matcher = new RegExp(
        query.search,
        query.caseSensitive ? "g" : "gi",
      );
    } catch {
      return [];
    }
    let match: RegExpExecArray | null;
    while ((match = matcher.exec(text)) && ranges.length < limit) {
      if (match[0].length === 0) {
        matcher.lastIndex += 1;
        continue;
      }
      const start = match.index;
      const end = start + match[0].length;
      if (!query.wholeWord || isWholeWordMatch(text, start, end)) {
        ranges.push({ start, end });
      }
    }
    return ranges;
  }

  const haystack = query.caseSensitive ? text : text.toLocaleLowerCase();
  const needle = query.caseSensitive
    ? query.search
    : query.search.toLocaleLowerCase();
  let from = 0;
  while (from <= haystack.length && ranges.length < limit) {
    const start = haystack.indexOf(needle, from);
    if (start < 0) break;
    const end = start + needle.length;
    if (!query.wholeWord || isWholeWordMatch(text, start, end)) {
      ranges.push({ start, end });
    }
    from = start + Math.max(1, needle.length);
  }
  return ranges;
}
