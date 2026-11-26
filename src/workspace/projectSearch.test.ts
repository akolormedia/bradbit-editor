import { describe, expect, it } from "vitest";
import { SearchBarQuery } from "../editor/searchBar";
import { SearchMatch } from "../types";
import { TabListState } from "./state";
import {
  buildProjectSearchContextBlocks,
  findSearchHighlights,
  groupProjectSearchMatches,
  isProjectSearchPath,
  openProjectSearchInTabs,
  PROJECT_SEARCH_PATH,
  projectSearchFileDir,
  projectSearchFileName,
  projectSearchSummary,
  replaceSearchInText,
  replaceSearchInTextAtLine,
} from "./projectSearch";

const query = (overrides: Partial<SearchBarQuery> = {}): SearchBarQuery => ({
  search: "gato",
  caseSensitive: false,
  wholeWord: false,
  regexp: false,
  ...overrides,
});

const match = (
  path: string,
  line: number,
  contextLines: number[] = [],
): SearchMatch => ({
  path,
  line,
  column: 1,
  snippet: "gato",
  context: contextLines.length
    ? contextLines.map((current) => ({
        line: current,
        text: current === line ? "gato" : `línea ${current}`,
        isMatch: current === line,
      }))
    : undefined,
});

describe("project search state", () => {
  it("opens a single pinned search tab and reuses it", () => {
    const empty: TabListState = { tabs: [], activeTabPath: null };
    const first = openProjectSearchInTabs(empty, "es");
    expect(first.activeTabPath).toBe(PROJECT_SEARCH_PATH);
    expect(first.tabs).toHaveLength(1);
    expect(first.tabs[0].name).toBe("Buscar en proyecto");
    expect(first.tabs[0].preview).toBe(false);
    expect(isProjectSearchPath(first.tabs[0].path)).toBe(true);

    const other = openProjectSearchInTabs(
      {
        tabs: [...first.tabs, {
          path: "notas.md",
          name: "notas.md",
          content: "",
          savedContent: "",
          preview: false,
          cursorLine: 1,
          cursorCol: 1,
          viewMode: "edit",
        }],
        activeTabPath: "notas.md",
      },
      "en",
    );
    expect(other.tabs).toHaveLength(2);
    expect(other.activeTabPath).toBe(PROJECT_SEARCH_PATH);
    expect(other.tabs[0].name).toBe("Find in Project");
  });

  it("groups matches by file and splits file paths", () => {
    const groups = groupProjectSearchMatches([
      match("biblia/premisa.md", 2),
      match("guion/acto-1.fountain", 4),
      match("biblia/premisa.md", 8),
    ]);
    expect(groups.map((group) => group.path)).toEqual([
      "biblia/premisa.md",
      "guion/acto-1.fountain",
    ]);
    expect(groups[0].matches).toHaveLength(2);
    expect(projectSearchFileName("biblia/premisa.md")).toBe("premisa.md");
    expect(projectSearchFileDir("biblia/premisa.md")).toBe("biblia");
  });

  it("merges close context windows and separates distant ones", () => {
    const far = buildProjectSearchContextBlocks([
      match("notas.md", 10, [8, 9, 10, 11, 12]),
      match("notas.md", 20, [18, 19, 20, 21, 22]),
    ]);
    expect(far).toHaveLength(2);
    expect(far[0].start).toBe(8);
    expect(far[0].end).toBe(12);

    const close = buildProjectSearchContextBlocks([
      match("notas.md", 10, [8, 9, 10, 11, 12]),
      match("notas.md", 13, [11, 12, 13, 14, 15]),
    ]);
    expect(close).toHaveLength(1);
    expect(close[0].start).toBe(8);
    expect(close[0].end).toBe(15);
    expect(close[0].lines.map((line) => line.line)).toEqual([
      8, 9, 10, 11, 12, 13, 14, 15,
    ]);
    expect(close[0].lines.find((line) => line.line === 13)?.isMatch).toBe(
      true,
    );
  });

  it("replaces matches in text and single lines while preserving newlines", () => {
    const all = replaceSearchInText(
      "Gato gato\r\nGATO\r\n",
      query(),
      "perro",
    );
    expect(all.replacements).toBe(3);
    expect(all.content).toBe("perro perro\r\nperro\r\n");

    const one = replaceSearchInTextAtLine(
      "gato\nGato\ngato\n",
      2,
      query(),
      "perro",
    );
    expect(one.replacements).toBe(1);
    expect(one.content).toBe("gato\nperro\ngato\n");

    const regex = replaceSearchInText(
      "Ana y ana",
      query({ search: "ana", regexp: true, caseSensitive: true }),
      "Elena",
    );
    expect(regex.replacements).toBe(1);
    expect(regex.content).toBe("Ana y Elena");
  });

  it("formats singular and plural result summaries", () => {
    expect(projectSearchSummary("es", 1, 1)).toBe(
      "1 coincidencia en 1 archivo",
    );
    expect(projectSearchSummary("es", 1, 3)).toBe(
      "1 coincidencia en 3 archivos",
    );
    expect(projectSearchSummary("es", 4, 1)).toBe(
      "4 coincidencias en 1 archivo",
    );
    expect(projectSearchSummary("en", 4, 2)).toBe("4 matches in 2 files");
  });

  it("finds literal ranges with case and whole-word options", () => {
    const text = "Gato gatito GATO gato.";
    expect(findSearchHighlights(text, query())).toEqual([
      { start: 0, end: 4 },
      { start: 12, end: 16 },
      { start: 17, end: 21 },
    ]);
    expect(
      findSearchHighlights(text, query({ caseSensitive: true })),
    ).toEqual([{ start: 17, end: 21 }]);
    expect(findSearchHighlights(text, query({ wholeWord: true }))).toEqual([
      { start: 0, end: 4 },
      { start: 12, end: 16 },
      { start: 17, end: 21 },
    ]);
  });

  it("finds regex ranges and ignores invalid expressions", () => {
    expect(
      findSearchHighlights("Ana y ana", query({ search: "ana", regexp: true })),
    ).toEqual([
      { start: 0, end: 3 },
      { start: 6, end: 9 },
    ]);
    expect(
      findSearchHighlights(
        "Ana y ana",
        query({ search: "ana", regexp: true, caseSensitive: true }),
      ),
    ).toEqual([{ start: 6, end: 9 }]);
    expect(findSearchHighlights("Ana", query({ search: "[", regexp: true }))).toEqual([]);
  });
});
