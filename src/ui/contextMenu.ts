import { createIcon, type IconName } from "./icons";

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: IconName;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  action?: () => void;
}

export interface ContextMenuOptions {
  x: number;
  y: number;
  items: ContextMenuItem[];
  label: string;
  onClose?: () => void;
}

let active: {
  element: HTMLElement;
  cleanup: () => void;
  restoreFocus: HTMLElement | null;
} | null = null;

export function closeContextMenu(): void {
  if (!active) return;
  const current = active;
  active = null;
  current.cleanup();
  current.element.remove();
  if (current.restoreFocus?.isConnected) {
    current.restoreFocus.focus({ preventScroll: true });
  }
}

function enabledItems(menu: HTMLElement): HTMLButtonElement[] {
  return [...menu.querySelectorAll<HTMLButtonElement>(".context-menu-item")].filter(
    (item) => !item.disabled,
  );
}

function focusItem(menu: HTMLElement, direction: 1 | -1): void {
  const items = enabledItems(menu);
  if (items.length === 0) return;
  const current = document.activeElement;
  const index = items.indexOf(current as HTMLButtonElement);
  const next =
    index === -1
      ? direction === 1
        ? 0
        : items.length - 1
      : (index + direction + items.length) % items.length;
  items[next].focus({ preventScroll: true });
}

/**
 * Opens a small, accessible context menu at viewport coordinates.
 *
 * The editor keeps the native WebView menu so macOS spelling, Look Up and
 * services remain available. This menu is used by the file tree and tabs,
 * where the native menu only exposes developer-oriented actions.
 */
export function openContextMenu(options: ContextMenuOptions): HTMLElement {
  closeContextMenu();

  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.dataset.contextMenu = "true";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", options.label);

  for (const item of options.items) {
    if (item.separator) {
      const separator = document.createElement("div");
      separator.className = "context-menu-separator";
      separator.setAttribute("role", "separator");
      menu.appendChild(separator);
      continue;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "context-menu-item";
    button.dataset.contextMenuItem = item.id;
    button.setAttribute("role", "menuitem");
    button.tabIndex = -1;
    button.disabled = Boolean(item.disabled);
    if (item.danger) button.classList.add("is-danger");

    if (item.icon) {
      const icon = document.createElement("span");
      icon.className = "context-menu-icon";
      icon.appendChild(createIcon(item.icon, 15));
      button.appendChild(icon);
    }

    const label = document.createElement("span");
    label.className = "context-menu-label";
    label.textContent = item.label;
    button.appendChild(label);

    if (item.shortcut) {
      const shortcut = document.createElement("span");
      shortcut.className = "context-menu-shortcut";
      shortcut.textContent = item.shortcut;
      button.appendChild(shortcut);
    }

    button.addEventListener("click", () => {
      if (button.disabled) return;
      closeContextMenu();
      item.action?.();
    });

    menu.appendChild(button);
  }

  if (!menu.querySelector(".context-menu-item")) {
    menu.appendChild(document.createElement("div")).className =
      "context-menu-empty";
  }

  document.body.appendChild(menu);

  // Measure after mounting so the menu never overflows the viewport.
  const margin = 8;
  const rect = menu.getBoundingClientRect();
  const left = Math.max(
    margin,
    Math.min(options.x, window.innerWidth - rect.width - margin),
  );
  const top = Math.max(
    margin,
    Math.min(options.y, window.innerHeight - rect.height - margin),
  );
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeContextMenu();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusItem(menu, 1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusItem(menu, -1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      enabledItems(menu)[0]?.focus({ preventScroll: true });
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      const items = enabledItems(menu);
      items[items.length - 1]?.focus({ preventScroll: true });
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      closeContextMenu();
    }
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.target instanceof Node && menu.contains(event.target)) return;
    closeContextMenu();
  };

  const onViewportChange = () => closeContextMenu();

  const restoreFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("blur", onViewportChange);
  window.addEventListener("resize", onViewportChange);
  window.addEventListener("scroll", onViewportChange, true);

  const cleanup = () => {
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("pointerdown", onPointerDown, true);
    window.removeEventListener("blur", onViewportChange);
    window.removeEventListener("resize", onViewportChange);
    window.removeEventListener("scroll", onViewportChange, true);
    options.onClose?.();
  };

  active = { element: menu, cleanup, restoreFocus };

  // Focus the first enabled item so keyboard users can act immediately.
  enabledItems(menu)[0]?.focus({ preventScroll: true });

  return menu;
}

export function isContextMenuOpen(): boolean {
  return Boolean(active);
}
