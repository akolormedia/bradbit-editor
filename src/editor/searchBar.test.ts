// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { SearchBar, SearchBarHandlers } from "./searchBar";

function handlers(): SearchBarHandlers {
  return {
    onSearchChange: vi.fn(),
    onFindNext: vi.fn(),
    onFindPrevious: vi.fn(),
    onReplace: vi.fn(),
    onReplaceAll: vi.fn(),
    onClose: vi.fn(),
    onGenerateRegex: vi.fn().mockResolvedValue("\\d{3}"),
    onOpenSettings: vi.fn(),
  };
}

function mount() {
  const calls = handlers();
  const bar = new SearchBar("es", calls);
  document.body.appendChild(bar.element());
  return { bar, calls };
}

describe("editor search bar", () => {
  it("emits query and option changes", () => {
    const { bar, calls } = mount();
    const input = bar.element().querySelector<HTMLInputElement>(
      '[data-testid="search-query-input"]',
    )!;
    input.value = "gato";
    input.dispatchEvent(new Event("input"));
    expect(calls.onSearchChange).toHaveBeenLastCalledWith({
      search: "gato",
      caseSensitive: false,
      wholeWord: false,
      regexp: false,
    });

    bar
      .element()
      .querySelector<HTMLButtonElement>('[data-search-option="caseSensitive"]')!
      .click();
    expect(calls.onSearchChange).toHaveBeenLastCalledWith({
      search: "gato",
      caseSensitive: true,
      wholeWord: false,
      regexp: false,
    });
  });

  it("navigates and closes with the keyboard", () => {
    const { bar, calls } = mount();
    const input = bar.element().querySelector<HTMLInputElement>(
      '[data-testid="search-query-input"]',
    )!;

    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    expect(calls.onFindNext).toHaveBeenCalledOnce();

    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        shiftKey: true,
        bubbles: true,
      }),
    );
    expect(calls.onFindPrevious).toHaveBeenCalledOnce();

    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(calls.onClose).toHaveBeenCalledOnce();
  });

  it("opens replacement and calls replace actions", () => {
    const { bar, calls } = mount();
    bar
      .element()
      .querySelector<HTMLButtonElement>(
        '[data-testid="search-replace-toggle"]',
      )!
      .click();
    const replaceRow = bar.element().querySelector<HTMLElement>(
      ".search-replace-row",
    )!;
    expect(replaceRow.hidden).toBe(false);

    const input = bar.element().querySelector<HTMLInputElement>(
      '[data-testid="search-replace-input"]',
    )!;
    input.value = "perro";
    bar
      .element()
      .querySelector<HTMLButtonElement>('[data-testid="search-replace"]')!
      .click();
    expect(calls.onReplace).toHaveBeenCalledWith("perro");

    bar
      .element()
      .querySelector<HTMLButtonElement>('[data-testid="search-replace-all"]')!
      .click();
    expect(calls.onReplaceAll).toHaveBeenCalledWith("perro");
  });

  it("shows the match counter", () => {
    const { bar } = mount();
    bar.setMatchInfo(2, 8);
    expect(
      bar
        .element()
        .querySelector('[data-testid="search-count"]')!.textContent,
    ).toBe("2/8");
  });

  it("shows a thinking state while generating", async () => {
    const { bar, calls } = mount();
    let resolve: (value: string) => void = () => {};
    calls.onGenerateRegex = vi.fn(
      () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    );
    bar
      .element()
      .querySelector<HTMLButtonElement>('[data-testid="search-ai-btn"]')!
      .click();
    bar.element().querySelector<HTMLTextAreaElement>(
      '[data-testid="search-ai-input"]',
    )!.value = "números";
    bar
      .element()
      .querySelector<HTMLButtonElement>('[data-testid="search-ai-generate"]')!
      .click();

    const status = bar.element().querySelector<HTMLElement>(
      '[data-testid="search-ai-status"]',
    )!;
    await vi.waitFor(() => expect(status.hidden).toBe(false));
    resolve("\\d{3}");
    await vi.waitFor(() => expect(status.hidden).toBe(true));
  });

  it("ignores a generation that the user canceled", async () => {
    const { bar, calls } = mount();
    let resolve: (value: string) => void = () => {};
    calls.onGenerateRegex = vi.fn(
      () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    );
    bar
      .element()
      .querySelector<HTMLButtonElement>('[data-testid="search-ai-btn"]')!
      .click();
    bar.element().querySelector<HTMLTextAreaElement>(
      '[data-testid="search-ai-input"]',
    )!.value = "números";
    bar
      .element()
      .querySelector<HTMLButtonElement>('[data-testid="search-ai-generate"]')!
      .click();
    bar
      .element()
      .querySelector<HTMLButtonElement>(".search-ai-actions .search-action-btn:last-child")!
      .click();
    resolve("\\d{3}");
    await Promise.resolve();
    expect(bar.getQuery().search).toBe("");
    expect(
      bar.element().querySelector<HTMLInputElement>(
        '[data-testid="search-query-input"]',
      )!.value,
    ).toBe("");
  });

  it("opens the AI settings from the popover", () => {
    const { bar, calls } = mount();
    bar
      .element()
      .querySelector<HTMLButtonElement>('[data-testid="search-ai-btn"]')!
      .click();
    bar
      .element()
      .querySelector<HTMLButtonElement>('[data-testid="search-ai-settings"]')!
      .click();
    expect(calls.onOpenSettings).toHaveBeenCalledOnce();
    expect(
      bar.element().querySelector<HTMLElement>(".search-ai-popover")!.hidden,
    ).toBe(true);
  });

  it("keeps the AI panel open when generation returns nothing", async () => {
    const { bar, calls } = mount();
    calls.onGenerateRegex = vi.fn().mockResolvedValue("```\n```");
    bar
      .element()
      .querySelector<HTMLButtonElement>('[data-testid="search-ai-btn"]')!
      .click();
    const prompt = bar.element().querySelector<HTMLTextAreaElement>(
      '[data-testid="search-ai-input"]',
    )!;
    prompt.value = "algo";
    bar
      .element()
      .querySelector<HTMLButtonElement>('[data-testid="search-ai-generate"]')!
      .click();

    await vi.waitFor(() => {
      const error = bar.element().querySelector<HTMLElement>(
        ".search-ai-error",
      )!;
      expect(error.hidden).toBe(false);
      expect(error.textContent).toBe(
        "El modelo no devolvió texto. Prueba con otro modelo desde Ajustes.",
      );
    });
    expect(bar.getQuery().search).toBe("");
  });

  it("generates a regular expression with AI", async () => {
    const { bar, calls } = mount();
    bar
      .element()
      .querySelector<HTMLButtonElement>('[data-testid="search-ai-btn"]')!
      .click();
    const prompt = bar.element().querySelector<HTMLTextAreaElement>(
      '[data-testid="search-ai-input"]',
    )!;
    prompt.value = "números de tres cifras";
    bar
      .element()
      .querySelector<HTMLButtonElement>('[data-testid="search-ai-generate"]')!
      .click();

    await vi.waitFor(() => {
      expect(calls.onGenerateRegex).toHaveBeenCalledWith(
        "números de tres cifras",
      );
    });
    await vi.waitFor(() => {
      const input = bar.element().querySelector<HTMLInputElement>(
        '[data-testid="search-query-input"]',
      )!;
      expect(input.value).toBe("\\d{3}");
    });
    expect(bar.getQuery().regexp).toBe(true);
    expect(calls.onSearchChange).toHaveBeenLastCalledWith({
      search: "\\d{3}",
      caseSensitive: false,
      wholeWord: false,
      regexp: true,
    });
  });
});
