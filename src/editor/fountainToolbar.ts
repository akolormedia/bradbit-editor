import { t } from "../i18n";
import { Language } from "../types";
import { FountainElement } from "./fountainEditing";

const ELEMENTS: Array<{ id: FountainElement; labelKey: Parameters<typeof t>[1] }> = [
  { id: "scene", labelKey: "fountainElementScene" },
  { id: "action", labelKey: "fountainElementAction" },
  { id: "character", labelKey: "fountainElementCharacter" },
  { id: "dialogue", labelKey: "fountainElementDialogue" },
  { id: "parenthetical", labelKey: "fountainElementParenthetical" },
  { id: "transition", labelKey: "fountainElementTransition" },
  { id: "section", labelKey: "fountainElementSection" },
  { id: "note", labelKey: "fountainElementNote" },
];

export function createFountainToolbar(
  language: Language,
  onApply: (element: FountainElement) => void,
): HTMLElement {
  const toolbar = document.createElement("div");
  toolbar.className = "fountain-toolbar";
  toolbar.dataset.testid = "fountain-toolbar";
  toolbar.setAttribute("aria-label", t(language, "fountainToolbarLabel"));
  toolbar.title = t(language, "fountainToolbarHint");

  for (const element of ELEMENTS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "fountain-toolbar-btn";
    button.dataset.element = element.id;
    button.textContent = t(language, element.labelKey);
    button.onclick = () => onApply(element.id);
    toolbar.appendChild(button);
  }

  return toolbar;
}
