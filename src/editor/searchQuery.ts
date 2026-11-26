import { EditorState } from "@codemirror/state";
import { SearchQuery } from "@codemirror/search";

export interface EditorSearchQuery {
  search: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regexp: boolean;
}

export function buildEditorSearchQuery(
  config: EditorSearchQuery,
  replace = "",
): SearchQuery {
  return new SearchQuery({
    search: config.search,
    caseSensitive: config.caseSensitive,
    wholeWord: config.wholeWord,
    regexp: config.regexp,
    replace,
  });
}

export function searchMatchInfo(
  state: EditorState,
  query: SearchQuery,
): { current: number; total: number } {
  if (!query.valid || !query.search) return { current: 0, total: 0 };
  const cursor = query.getCursor(state);
  const matches: Array<{ from: number; to: number }> = [];
  for (;;) {
    const next = cursor.next();
    if (next.done) break;
    matches.push(next.value);
  }
  if (matches.length === 0) return { current: 0, total: 0 };
  const selection = state.selection.main;
  const selected = matches.findIndex(
    (match) => match.from === selection.from && match.to === selection.to,
  );
  const next = matches.findIndex((match) => match.from >= selection.to);
  const index = selected >= 0 ? selected : next;
  return {
    current: index >= 0 ? index + 1 : 1,
    total: matches.length,
  };
}

/**
 * Models sometimes wrap a regex in a code fence, quotes, or /slashes/flags.
 * CodeMirror expects only the source, so keep the payload and drop the wrapper.
 */
export function normalizeGeneratedRegex(raw: string): string {
  let value = raw
    .trim()
    .replace(/^```[a-z]*\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  const quoted = /^(["'`])([\s\S]*)\1$/.exec(value);
  if (quoted) value = quoted[2].trim();
  const delimited = /^\/([\s\S]+)\/([a-z]*)$/.exec(value);
  if (delimited) value = delimited[1];
  return value.trim();
}
