// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFountainToolbar } from "./fountainToolbar";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Fountain toolbar", () => {
  it("renders commands, shortcuts and reports clicks", () => {
    const onCommand = vi.fn();
    const toolbar = createFountainToolbar("es", onCommand);
    document.body.appendChild(toolbar);

    expect(toolbar.dataset.testid).toBe("fountain-toolbar");
    expect(
      [...toolbar.querySelectorAll<HTMLButtonElement>(".fountain-toolbar-btn")].map(
        (button) => button.dataset.command,
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
    expect(toolbar.querySelector('[data-command="scene"]')?.getAttribute("title"))
      .toContain("⌘1");
    expect(toolbar.querySelector('[data-command="note"]')?.getAttribute("title"))
      .toContain("⌘8");

    toolbar
      .querySelector<HTMLButtonElement>('[data-command="character"]')!
      .click();
    expect(onCommand).toHaveBeenCalledWith("character");
    expect(toolbar.title).toContain("⌘1–⌘8");
  });
});
