import { createIcon, IconName } from "./icons";

export const ICON_BUTTON_SIZE = 24;

export interface IconButtonOptions {
  icon: IconName;
  label: string;
  onClick?: (event: MouseEvent) => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  testId?: string;
  title?: string;
  size?: number;
  /**
   * When true, the button only gets the neutral `.icon-button` sizing class
   * instead of the default `.icon-btn` chrome. Useful for primary/destructive
   * buttons that define their own background and hover treatment.
   */
  plain?: boolean;
}

/**
 * Builds a consistent, accessible icon-only button.
 *
 * Every icon button in the app shares the same 24×24 box and the same SVG
 * stroke treatment; callers only provide the semantic label and action.
 */
export function createIconButton(
  options: IconButtonOptions,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = options.plain ? "icon-button" : "icon-btn icon-button";

  if (options.className) {
    for (const className of options.className.split(/\s+/)) {
      if (className) button.classList.add(className);
    }
  }

  if (options.testId) button.dataset.testid = options.testId;

  button.title = options.title ?? options.label;
  button.setAttribute("aria-label", options.label);
  button.disabled = options.disabled ?? false;

  if (options.active !== undefined) {
    button.classList.toggle("active", options.active);
    button.setAttribute("aria-pressed", String(options.active));
  }

  button.appendChild(createIcon(options.icon, options.size ?? 16));

  if (options.onClick) button.onclick = options.onClick;
  return button;
}
