import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  buildEditorSearchQuery,
  normalizeGeneratedRegex,
  searchMatchInfo,
} from "./searchQuery";

function state(doc: string) {
  return EditorState.create({ doc });
}

describe("editor search query helpers", () => {
  it("counts literal, whole-word and case-sensitive matches", () => {
    const doc = state("test test\nTest\ntesting");
    const insensitive = buildEditorSearchQuery({
      search: "test",
      caseSensitive: false,
      wholeWord: false,
      regexp: false,
    });
    expect(searchMatchInfo(doc, insensitive)).toEqual({
      current: 1,
      total: 4,
    });

    const wholeWord = buildEditorSearchQuery({
      search: "test",
      caseSensitive: false,
      wholeWord: true,
      regexp: false,
    });
    expect(searchMatchInfo(doc, wholeWord)).toEqual({
      current: 1,
      total: 3,
    });

    const sensitive = buildEditorSearchQuery({
      search: "test",
      caseSensitive: true,
      wholeWord: true,
      regexp: false,
    });
    expect(searchMatchInfo(doc, sensitive)).toEqual({
      current: 1,
      total: 2,
    });
  });

  it("reports the current match and rejects invalid regexes", () => {
    const doc = state("uno dos uno");
    const query = buildEditorSearchQuery({
      search: "uno",
      caseSensitive: false,
      wholeWord: false,
      regexp: false,
    });
    const withSelection = doc.update({
      selection: { anchor: 8, head: 11 },
    }).state;
    expect(searchMatchInfo(withSelection, query)).toEqual({
      current: 2,
      total: 2,
    });

    const afterFirst = doc.update({ selection: { anchor: 5, head: 5 } }).state;
    expect(searchMatchInfo(afterFirst, query)).toEqual({
      current: 2,
      total: 2,
    });

    const invalid = buildEditorSearchQuery({
      search: "[",
      caseSensitive: false,
      wholeWord: false,
      regexp: true,
    });
    expect(invalid.valid).toBe(false);
    expect(searchMatchInfo(doc, invalid)).toEqual({ current: 0, total: 0 });
  });
});

describe("generated regex cleanup", () => {
  it("removes code fences, quotes and slash delimiters", () => {
    expect(normalizeGeneratedRegex("```regex\n\\d{3}\n```")).toBe("\\d{3}");
    expect(normalizeGeneratedRegex("/\\d{3}/gi")).toBe("\\d{3}");
    expect(normalizeGeneratedRegex('"\\d{3}"')).toBe("\\d{3}");
    expect(normalizeGeneratedRegex("  ana@example\\.com  ")).toBe(
      "ana@example\\.com",
    );
  });
});
