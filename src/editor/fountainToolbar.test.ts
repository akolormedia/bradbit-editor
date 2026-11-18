// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFountainToolbar } from "./fountainToolbar";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Fountain toolbar", () => {
  it("renders every element and reports clicks", () => {
    const onApply = vi.fn();
    const toolbar = createFountainToolbar("es", onApply);
    document.body.appendChild(toolbar);

    expect(toolbar.dataset.testid).toBe("fountain-toolbar");
    expect(
      [...toolbar.querySelectorAll<HTMLButtonElement>(".fountain-toolbar-btn")].map(
        (button) => button.dataset.element,
      ),
    ).toEqual([
      "scene",
      "action",
      "character",
      "dialogue",
      "parenthetical",
      "transition",
      "section",
      "note",
    ]);

    toolbar
      .querySelector<HTMLButtonElement>('[data-element="character"]')!
      .click();
    expect(onApply).toHaveBeenCalledWith("character");
    expect(toolbar.title).toContain("Tab");
  });
});
