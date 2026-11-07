// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { MenuUiState } from "../types";
import { AppMenu, buildAppMenu } from "./appMenu";

function state(overrides: Partial<MenuUiState> = {}): MenuUiState {
  return {
    language: "es",
    hasFolder: true,
    hasActiveTab: true,
    isMarkdown: true,
    isFountain: false,
    previewMode: false,
    sidebarVisible: true,
    wordWrap: true,
    lineNumbers: false,
    ...overrides,
  };
}

function commandIds(): string[] {
  return buildAppMenu(state()).flatMap((group) =>
    group.items.map((item) => item.command.id),
  );
}

function commandItem(
  groups: ReturnType<typeof buildAppMenu>,
  id: string,
) {
  for (const group of groups) {
    const item = group.items.find((entry) => entry.command.id === id);
    if (item) return item;
  }
  throw new Error(`Missing command ${id}`);
}

const menus: AppMenu[] = [];

function makeMenu(onCommand: (command: { id: string }) => void): AppMenu {
  const menu = new AppMenu({ onCommand });
  menus.push(menu);
  document.body.appendChild(menu.element);
  return menu;
}

afterEach(() => {
  for (const menu of menus.splice(0)) menu.dispose();
  document.body.innerHTML = "";
});

describe("application menu model (T-2.4.2)", () => {
  it("groups the expected file, edit, view and app commands", () => {
    const groups = buildAppMenu(state());
    expect(groups.map((group) => group.id)).toEqual([
      "file",
      "edit",
      "view",
      "app",
    ]);
    expect(commandIds()).toEqual([
      "file.openFolder",
      "file.newProject",
      "file.newFile",
      "file.quickOpen",
      "file.save",
      "file.closeTab",
      "file.closeFolder",
      "edit.find",
      "edit.findInProject",
      "view.toggleSidebar",
      "view.versions",
      "view.togglePreview",
      "view.wordWrap",
      "view.lineNumbers",
      "view.toggleTerminal",
      "app.settings",
    ]);
  });

  it("enables folder and active-tab commands only when they can run", () => {
    const empty = buildAppMenu(
      state({ hasFolder: false, hasActiveTab: false, isMarkdown: false }),
    );
    expect(commandItem(empty, "file.newFile").enabled).toBe(false);
    expect(commandItem(empty, "file.save").enabled).toBe(false);
    expect(commandItem(empty, "view.togglePreview").enabled).toBe(false);
    expect(commandItem(empty, "view.wordWrap").enabled).toBe(true);
    expect(commandItem(empty, "app.settings").enabled).toBe(true);

    const ready = buildAppMenu(state());
    expect(commandItem(ready, "file.newFile").enabled).toBe(true);
    expect(commandItem(ready, "view.togglePreview").enabled).toBe(true);
    expect(commandItem(ready, "view.toggleTerminal").enabled).toBe(true);
  });

  it("exposes shortcuts and checked toggles for the view menu", () => {
    const groups = buildAppMenu(
      state({ previewMode: true, sidebarVisible: false, lineNumbers: true }),
    );
    expect(commandItem(groups, "file.save").shortcut).toBe("⌘S");
    expect(commandItem(groups, "view.toggleSidebar").checked).toBe(false);
    expect(commandItem(groups, "view.togglePreview").checked).toBe(true);
    expect(commandItem(groups, "view.wordWrap").checked).toBe(true);
    expect(commandItem(groups, "view.lineNumbers").checked).toBe(true);
  });
});

describe("application menu component (T-2.4.2)", () => {
  it("opens the dropdown, renders grouped items and dispatches a command", () => {
    const onCommand = vi.fn();
    const menu = makeMenu(onCommand);
    menu.update(state());

    const trigger = menu.element.querySelector<HTMLButtonElement>(
      '[data-testid="app-menu-trigger"]',
    )!;
    const popover = menu.element.querySelector<HTMLDivElement>(
      ".app-menu-popover",
    )!;

    trigger.click();
    expect(popover.hidden).toBe(false);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(popover.querySelectorAll(".app-menu-group")).toHaveLength(4);
    expect(
      popover.querySelectorAll('[data-command="file.newFile"]'),
    ).toHaveLength(1);

    popover
      .querySelector<HTMLButtonElement>('[data-command="file.newFile"]')!
      .click();

    expect(onCommand).toHaveBeenCalledWith({ id: "file.newFile" });
    expect(popover.hidden).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("does not dispatch disabled commands", () => {
    const onCommand = vi.fn();
    const menu = makeMenu(onCommand);
    menu.update(state({ hasFolder: false, hasActiveTab: false }));

    const trigger = menu.element.querySelector<HTMLButtonElement>(
      '[data-testid="app-menu-trigger"]',
    )!;
    trigger.click();

    const disabled = menu.element.querySelector<HTMLButtonElement>(
      '[data-command="file.newFile"]',
    )!;
    expect(disabled.disabled).toBe(true);
    disabled.click();
    expect(onCommand).not.toHaveBeenCalled();
  });

  it("closes with Escape and outside clicks", () => {
    const menu = makeMenu(vi.fn());
    menu.update(state());
    const trigger = menu.element.querySelector<HTMLButtonElement>(
      '[data-testid="app-menu-trigger"]',
    )!;
    const popover = menu.element.querySelector<HTMLDivElement>(
      ".app-menu-popover",
    )!;

    trigger.click();
    popover.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(popover.hidden).toBe(true);

    trigger.click();
    document.body.click();
    expect(popover.hidden).toBe(true);
  });

  it("moves focus with arrow keys between enabled items", () => {
    const menu = makeMenu(vi.fn());
    menu.update(state());
    const trigger = menu.element.querySelector<HTMLButtonElement>(
      '[data-testid="app-menu-trigger"]',
    )!;
    const popover = menu.element.querySelector<HTMLDivElement>(
      ".app-menu-popover",
    )!;

    trigger.click();
    const items = Array.from(
      popover.querySelectorAll<HTMLButtonElement>(
        ".app-menu-item:not(:disabled)",
      ),
    );
    expect(document.activeElement).toBe(items[0]);

    popover.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    expect(document.activeElement).toBe(items[1]);

    popover.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
    );
    expect(document.activeElement).toBe(items[0]);
  });
});
