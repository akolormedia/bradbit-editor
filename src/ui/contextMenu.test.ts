// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { closeContextMenu, openContextMenu } from "./contextMenu";

afterEach(() => {
  closeContextMenu();
  document.body.innerHTML = "";
});

describe("context menu (T-3.8.1)", () => {
  it("renders accessible items and focuses the first enabled action", () => {
    const menu = openContextMenu({
      x: 40,
      y: 60,
      label: "Actions",
      items: [
        { id: "open", label: "Open", action: vi.fn() },
        { id: "disabled", label: "Disabled", disabled: true },
        { id: "delete", label: "Delete", danger: true, action: vi.fn() },
      ],
    });

    expect(menu.getAttribute("role")).toBe("menu");
    expect(menu.getAttribute("aria-label")).toBe("Actions");
    expect(menu.querySelectorAll('[role="menuitem"]')).toHaveLength(3);
    expect(
      menu
        .querySelector('[data-context-menu-item="delete"]')
        ?.classList.contains("is-danger"),
    ).toBe(true);
    expect(document.activeElement?.getAttribute("data-context-menu-item")).toBe(
      "open",
    );
  });

  it("runs the action, closes the menu and ignores disabled items", () => {
    const action = vi.fn();
    const disabledAction = vi.fn();
    openContextMenu({
      x: 10,
      y: 10,
      label: "Actions",
      items: [
        { id: "one", label: "One", action },
        { id: "two", label: "Two", disabled: true, action: disabledAction },
      ],
    });

    document
      .querySelector<HTMLButtonElement>('[data-context-menu-item="two"]')
      ?.click();
    expect(disabledAction).not.toHaveBeenCalled();

    document
      .querySelector<HTMLButtonElement>('[data-context-menu-item="one"]')
      ?.click();
    expect(action).toHaveBeenCalledTimes(1);
    expect(document.querySelector("[data-context-menu]")).toBeNull();
  });

  it("supports arrow navigation and Escape", () => {
    openContextMenu({
      x: 10,
      y: 10,
      label: "Actions",
      items: [
        { id: "one", label: "One", action: vi.fn() },
        { id: "two", label: "Two", action: vi.fn() },
      ],
    });

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    expect(document.activeElement?.getAttribute("data-context-menu-item")).toBe(
      "two",
    );

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
    expect(document.activeElement?.getAttribute("data-context-menu-item")).toBe(
      "one",
    );

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector("[data-context-menu]")).toBeNull();
  });

  it("closes when clicking outside", () => {
    openContextMenu({
      x: 10,
      y: 10,
      label: "Actions",
      items: [{ id: "one", label: "One", action: vi.fn() }],
    });

    document.body.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true }),
    );
    expect(document.querySelector("[data-context-menu]")).toBeNull();
  });
});
