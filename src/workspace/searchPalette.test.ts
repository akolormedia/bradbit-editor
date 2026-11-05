// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchPalette } from "./searchPalette";

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
});

function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function press(input: HTMLInputElement, key: string): void {
  input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

describe("search palette (T-1.2.4)", () => {
  it("filters files and opens the selected result with Enter", () => {
    const onOpenFile = vi.fn();
    const onClose = vi.fn();
    const palette = new SearchPalette({
      mode: "files",
      language: "es",
      files: [
        { path: "biblia/premisa.md", name: "premisa.md" },
        { path: "guion/acto-1.fountain", name: "acto-1.fountain" },
      ],
      onOpenFile,
      onClose,
    });
    document.body.appendChild(palette.element());
    const input = palette.element().querySelector<HTMLInputElement>("input");
    expect(input).not.toBeNull();
    expect(palette.element().querySelectorAll(".search-palette-item")).toHaveLength(2);

    type(input!, "acto");
    expect(palette.element().querySelectorAll(".search-palette-item")).toHaveLength(1);
    press(input!, "Enter");
    expect(onOpenFile).toHaveBeenCalledWith("guion/acto-1.fountain");

    press(input!, "Escape");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("navigates results with the arrow keys", () => {
    const onOpenFile = vi.fn();
    const palette = new SearchPalette({
      mode: "files",
      language: "es",
      files: [
        { path: "a.md", name: "a.md" },
        { path: "b.md", name: "b.md" },
      ],
      onOpenFile,
      onClose: () => {},
    });
    document.body.appendChild(palette.element());
    const input = palette.element().querySelector<HTMLInputElement>("input")!;

    press(input, "ArrowDown");
    press(input, "Enter");
    expect(onOpenFile).toHaveBeenCalledWith("b.md");
  });

  it("searches project content after the debounce and opens a match", async () => {
    vi.useFakeTimers();
    const match = {
      path: "biblia/premisa.md",
      line: 3,
      column: 5,
      snippet: "Una idea sobre Ana.",
    };
    const search = vi.fn(async () => [match]);
    const onOpenMatch = vi.fn();
    const palette = new SearchPalette({
      mode: "content",
      language: "es",
      search,
      onOpenMatch,
      onClose: () => {},
    });
    document.body.appendChild(palette.element());
    const input = palette.element().querySelector<HTMLInputElement>("input")!;

    type(input, "ana");
    await vi.advanceTimersByTimeAsync(200);

    expect(search).toHaveBeenCalledWith("ana");
    const rows = palette.element().querySelectorAll<HTMLButtonElement>(".search-palette-item");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("biblia/premisa.md:3");
    rows[0].click();
    expect(onOpenMatch).toHaveBeenCalledWith(match);
  });

  it("waits for at least two characters in content mode", async () => {
    vi.useFakeTimers();
    const search = vi.fn(async () => []);
    const palette = new SearchPalette({
      mode: "content",
      language: "es",
      search,
      onOpenMatch: () => {},
      onClose: () => {},
    });
    document.body.appendChild(palette.element());
    const input = palette.element().querySelector<HTMLInputElement>("input")!;

    type(input, "a");
    await vi.advanceTimersByTimeAsync(300);
    expect(search).not.toHaveBeenCalled();
    expect(palette.element().textContent).toContain("al menos 2 caracteres");
  });
});
