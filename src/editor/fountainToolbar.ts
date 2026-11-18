import { t } from "../i18n";
import { Language } from "../types";
import {
  FOUNTAIN_COMMANDS,
  FountainCommand,
} from "./fountainCommands";

export function createFountainToolbar(
  language: Language,
  onCommand: (command: FountainCommand) => void,
): HTMLElement {
  const toolbar = document.createElement("div");
  toolbar.className = "fountain-toolbar";
  toolbar.dataset.testid = "fountain-toolbar";
  toolbar.setAttribute("aria-label", t(language, "fountainToolbarLabel"));
  toolbar.title = t(language, "fountainToolbarHint");

  for (const command of FOUNTAIN_COMMANDS) {
    const label = t(language, command.labelKey);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "fountain-toolbar-btn";
    button.dataset.command = command.id;
    button.title = `${label} (${command.shortcut})`;
    const text = document.createElement("span");
    text.className = "fountain-toolbar-text";
    text.textContent = label;
    const shortcut = document.createElement("span");
    shortcut.className = "fountain-toolbar-shortcut";
    shortcut.textContent = command.shortcut;
    button.append(text, shortcut);
    button.onclick = () => onCommand(command.id);
    toolbar.appendChild(button);
  }

  return toolbar;
}
