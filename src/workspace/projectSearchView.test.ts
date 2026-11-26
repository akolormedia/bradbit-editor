// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchBarQuery } from "../editor/searchBar";
import { SearchMatch } from "../types";
import { ProjectSearchView } from "./projectSearchView";

const query: SearchBarQuery = {
  search: "gato",
  caseSensitive: false,
  wholeWord: false,
  regexp: false,
};

const match = (
  path: string,
  line: number,
  snippet: string,
): SearchMatch => ({
  path,
  line,
  column: snippet.indexOf("gato") + 1,
  snippet,
});

const results = [
  match("biblia/premisa.md", 2, "El gato duerme."),
  match("biblia/premisa.md", 8, "Otro gato mira."),
  match("guion/acto-1.fountain", 4, "GATO en mayúsculas."),
];

function mount() {
  const onOpenMatch = vi.fn();
  const view = new ProjectSearchView({ language: "es", onOpenMatch });
  document.body.appendChild(view.element());
  return { view, onOpenMatch };
}

function update(view: ProjectSearchView, overrides = {}) {
  view.update({
    language: "es",
    query,
    results,
    loading: false,
    error: "",
    ...overrides,
  });
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("project search view", () => {
  it("renders file accordions, summary and highlighted snippets", () => {
    const { view } = mount();
    update(view);
    expect(view.element().textContent).toContain(
      "3 coincidencias en 2 archivos",
    );
    expect(
      view.element().querySelectorAll(".project-search-file-card"),
    ).toHaveLength(2);
    expect(view.element().textContent).toContain("premisa.md");
    expect(view.element().textContent).toContain("biblia");
    expect(
      view.element().querySelectorAll("mark.project-search-highlight").length,
    ).toBe(3);
    expect(
      view.element().querySelectorAll(".project-search-result"),
    ).toHaveLength(3);
    expect(
      view.element().querySelector(
        '.project-search-result[data-index="0"]',
      )!.classList.contains("selected"),
    ).toBe(true);
  });

  it("shows context blocks with dividers and merges close matches", () => {
    const { view } = mount();
    const context = (line: number, start: number) => ({
      ...match("biblia/premisa.md", line, "El gato duerme."),
      context: Array.from({ length: 5 }, (_, offset) => ({
        line: start + offset,
        text: start + offset === line ? "El gato duerme." : `línea ${start + offset}`,
        isMatch: start + offset === line,
      })),
    });
    update(view, { results: [context(10, 8), context(20, 18)] });
    expect(
      view.element().querySelectorAll(".project-search-context-line"),
    ).toHaveLength(10);
    expect(
      view.element().querySelectorAll(".project-search-context-divider"),
    ).toHaveLength(1);
    expect(
      view.element().querySelectorAll(".project-search-result"),
    ).toHaveLength(2);

    const close = mount();
    update(close.view, { results: [context(10, 8), context(13, 11)] });
    expect(
      close.view.element().querySelectorAll(".project-search-context-line"),
    ).toHaveLength(8);
    expect(
      close.view.element().querySelectorAll(
        ".project-search-context-divider",
      ),
    ).toHaveLength(0);
  });

  it("opens a result and the file header action", () => {
    const { view } = mount();
    update(view);
    const firstToggle = view.element().querySelectorAll<HTMLButtonElement>(
      '[data-testid="project-search-toggle"]',
    )[0]!;
    firstToggle.click();
    expect(
      view.element().querySelectorAll(".project-search-result"),
    ).toHaveLength(1);

    view.selectNext();
    expect(view.selectionInfo()).toEqual({ current: 2, total: 3 });
    expect(
      view.element().querySelectorAll(".project-search-result"),
    ).toHaveLength(3);
    expect(
      view.element().querySelector(
        '.project-search-result[data-index="1"].selected',
      ),
    ).not.toBeNull();
  });

  it("opens a result and the file header action", () => {
    const { view, onOpenMatch } = mount();
    update(view);
    view.element()
      .querySelectorAll<HTMLButtonElement>('[data-testid="project-search-result"]')[2]!
      .click();
    expect(onOpenMatch).toHaveBeenCalledWith(results[2]);

    onOpenMatch.mockClear();
    view.element()
      .querySelectorAll<HTMLButtonElement>(
        '[data-testid="project-search-open-file"]',
      )[0]!
      .click();
    expect(onOpenMatch).toHaveBeenCalledWith(results[0]);
  });

  it("shows loading, error and empty states", () => {
    const { view } = mount();
    update(view, { results: [], loading: true });
    expect(view.element().textContent).toContain("Buscando…");

    update(view, { results: [], loading: false, error: "boom" });
    expect(
      view.element().querySelector(".project-search-message.error")
        ?.textContent,
    ).toBe("boom");

    update(view, {
      results: [],
      loading: false,
      error: "",
      query: { ...query, search: "g" },
    });
    expect(view.element().textContent).toContain(
      "Escribe al menos 2 caracteres",
    );

    update(view, { results: [], loading: false, error: "" });
    expect(view.element().textContent).toContain("Sin coincidencias");
  });
});
