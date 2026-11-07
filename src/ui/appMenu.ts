import { t } from "../i18n";
import { MenuCommand, MenuUiState } from "../types";
import { createIcon } from "./icons";
import { createIconButton } from "./iconButton";

export interface AppMenuItem {
  command: MenuCommand;
  label: string;
  shortcut?: string;
  enabled: boolean;
  checked?: boolean;
  separatorBefore?: boolean;
}

export interface AppMenuGroup {
  id: "file" | "edit" | "view" | "app";
  label: string;
  items: AppMenuItem[];
}

/**
 * Declarative model for the in-app application menu.
 *
 * It mirrors the commands already handled by the native macOS menu so both
 * menus stay in sync without duplicating action logic.
 */
export function buildAppMenu(state: MenuUiState): AppMenuGroup[] {
  const lang = state.language;
  const hasFolder = state.hasFolder;
  const hasTab = state.hasActiveTab;

  return [
    {
      id: "file",
      label: t(lang, "appMenuFile"),
      items: [
        {
          command: { id: "file.openFolder" },
          label: t(lang, "openFolder"),
          shortcut: "⌘O",
          enabled: true,
        },
        {
          command: { id: "file.newProject" },
          label: t(lang, "newProjectButton"),
          shortcut: "⇧⌘N",
          enabled: true,
        },
        {
          command: { id: "file.newFile" },
          label: t(lang, "newFile"),
          shortcut: "⌘N",
          enabled: hasFolder,
          separatorBefore: true,
        },
        {
          command: { id: "file.quickOpen" },
          label: t(lang, "quickOpenTitle"),
          shortcut: "⌘P",
          enabled: hasFolder,
        },
        {
          command: { id: "file.save" },
          label: t(lang, "save"),
          shortcut: "⌘S",
          enabled: hasTab,
          separatorBefore: true,
        },
        {
          command: { id: "file.closeTab" },
          label: t(lang, "closeTab"),
          shortcut: "⌘W",
          enabled: hasTab,
        },
        {
          command: { id: "file.closeFolder" },
          label: t(lang, "closeFolder"),
          enabled: hasFolder,
          separatorBefore: true,
        },
      ],
    },
    {
      id: "edit",
      label: t(lang, "appMenuEdit"),
      items: [
        {
          command: { id: "edit.find" },
          label: t(lang, "findReplace"),
          shortcut: "⌘F",
          enabled: hasTab,
        },
        {
          command: { id: "edit.findInProject" },
          label: t(lang, "findInProject"),
          shortcut: "⇧⌘F",
          enabled: hasFolder,
        },
      ],
    },
    {
      id: "view",
      label: t(lang, "appMenuView"),
      items: [
        {
          command: { id: "view.toggleSidebar" },
          label: t(lang, "toggleSidebar"),
          shortcut: "⇧⌘E",
          enabled: hasFolder,
          checked: state.sidebarVisible,
        },
        {
          command: { id: "view.versions" },
          label: t(lang, "versionsTab"),
          shortcut: "⌥⌘G",
          enabled: hasFolder,
        },
        {
          command: { id: "view.togglePreview" },
          label: t(lang, "previewDocument"),
          shortcut: "⌥⌘P",
          enabled: hasTab && state.isMarkdown,
          checked: Boolean(state.isMarkdown && state.previewMode),
          separatorBefore: true,
        },
        {
          command: { id: "view.wordWrap" },
          label: t(lang, "wordWrap"),
          enabled: true,
          checked: state.wordWrap,
        },
        {
          command: { id: "view.lineNumbers" },
          label: t(lang, "lineNumbers"),
          enabled: true,
          checked: state.lineNumbers,
        },
        {
          command: { id: "view.toggleTerminal" },
          label: t(lang, "terminalTitle"),
          enabled: hasFolder,
          separatorBefore: true,
        },
      ],
    },
    {
      id: "app",
      label: t(lang, "appMenuApp"),
      items: [
        {
          command: { id: "app.settings" },
          label: t(lang, "settings"),
          shortcut: "⌘,",
          enabled: true,
        },
      ],
    },
  ];
}

export interface AppMenuOptions {
  onCommand: (command: MenuCommand) => void;
}

/**
 * Accessible dropdown that hosts the application commands currently spread
 * across the top bar. It closes on outside click/Escape and supports arrow-key
 * navigation between enabled items.
 */
export class AppMenu {
  public readonly element: HTMLDivElement;

  private readonly trigger: HTMLButtonElement;
  private readonly popover: HTMLDivElement;
  private readonly onCommand: (command: MenuCommand) => void;
  private state: MenuUiState | null = null;
  private isOpen = false;

  private readonly handleDocumentClick = (event: MouseEvent): void => {
    if (!this.isOpen) return;
    const target = event.target;
    if (target instanceof Node && this.element.contains(target)) return;
    this.close(false);
  };

  constructor(options: AppMenuOptions) {
    this.onCommand = options.onCommand;

    this.element = document.createElement("div");
    this.element.className = "app-menu";

    this.trigger = createIconButton({
      icon: "menu",
      label: t("es", "appMenuLabel"),
      className: "app-menu-trigger",
      testId: "app-menu-trigger",
      onClick: () => this.toggle(),
    });
    this.trigger.setAttribute("aria-haspopup", "menu");
    this.trigger.setAttribute("aria-expanded", "false");
    this.trigger.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        this.openMenu();
      } else if (event.key === "Escape") {
        event.preventDefault();
        this.close(true);
      }
    });

    this.popover = document.createElement("div");
    this.popover.className = "app-menu-popover";
    this.popover.setAttribute("role", "menu");
    this.popover.hidden = true;
    this.popover.addEventListener("keydown", (event) =>
      this.handlePopoverKeydown(event),
    );

    this.element.append(this.trigger, this.popover);
    document.addEventListener("click", this.handleDocumentClick);
  }

  public update(state: MenuUiState): void {
    this.state = state;
    const label = t(state.language, "appMenuLabel");
    this.trigger.title = label;
    this.trigger.setAttribute("aria-label", label);
    this.renderItems();
  }

  public dispose(): void {
    document.removeEventListener("click", this.handleDocumentClick);
    this.element.remove();
    this.state = null;
  }

  private toggle(): void {
    if (this.isOpen) {
      this.close(true);
    } else {
      this.openMenu();
    }
  }

  private openMenu(): void {
    if (!this.state) return;
    this.renderItems();
    this.isOpen = true;
    this.popover.hidden = false;
    this.trigger.setAttribute("aria-expanded", "true");
    this.enabledItems()[0]?.focus();
  }

  private close(restoreFocus: boolean): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.popover.hidden = true;
    this.trigger.setAttribute("aria-expanded", "false");
    if (restoreFocus) this.trigger.focus();
  }

  private enabledItems(): HTMLButtonElement[] {
    return Array.from(
      this.popover.querySelectorAll<HTMLButtonElement>(
        ".app-menu-item:not(:disabled)",
      ),
    );
  }

  private handlePopoverKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      this.close(true);
      return;
    }
    if (event.key === "Tab") {
      this.close(false);
      return;
    }
    if (
      event.key !== "ArrowDown" &&
      event.key !== "ArrowUp" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }

    const items = this.enabledItems();
    if (items.length === 0) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    let next = current;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else if (event.key === "ArrowDown") next = current < 0 ? 0 : (current + 1) % items.length;
    else if (event.key === "ArrowUp") next = current <= 0 ? items.length - 1 : current - 1;
    items[next]?.focus();
  }

  private renderItems(): void {
    this.popover.replaceChildren();
    if (!this.state) return;
    for (const group of buildAppMenu(this.state)) {
      const groupEl = document.createElement("div");
      groupEl.className = "app-menu-group";
      groupEl.setAttribute("role", "presentation");

      const label = document.createElement("div");
      label.className = "app-menu-group-label";
      label.textContent = group.label;
      groupEl.appendChild(label);

      group.items.forEach((item, index) => {
        if (item.separatorBefore && index > 0) {
          const separator = document.createElement("div");
          separator.className = "app-menu-separator";
          separator.setAttribute("role", "separator");
          groupEl.appendChild(separator);
        }

        const button = document.createElement("button");
        button.type = "button";
        button.className = "app-menu-item";
        button.dataset.command = item.command.id;
        button.disabled = !item.enabled;
        button.setAttribute(
          "role",
          item.checked === undefined ? "menuitem" : "menuitemcheckbox",
        );
        if (item.checked !== undefined) {
          button.setAttribute("aria-checked", String(item.checked));
        }

        const check = document.createElement("span");
        check.className = "app-menu-check";
        if (item.checked) check.appendChild(createIcon("check", 13));

        const text = document.createElement("span");
        text.className = "app-menu-label";
        text.textContent = item.label;

        button.append(check, text);
        if (item.shortcut) {
          const shortcut = document.createElement("span");
          shortcut.className = "app-menu-shortcut";
          shortcut.textContent = item.shortcut;
          button.appendChild(shortcut);
        }

        button.onclick = () => {
          this.close(false);
          this.onCommand(item.command);
        };
        groupEl.appendChild(button);
      });

      this.popover.appendChild(groupEl);
    }
  }
}
