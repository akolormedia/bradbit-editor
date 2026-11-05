import { t } from "../i18n";
import { Language, OpenTab } from "../types";
import { isMarkdownPath } from "./state";

export interface DocumentHeaderOptions {
  tab: OpenTab;
  language: Language;
  onTogglePreview: () => void;
  onCopy: () => Promise<boolean>;
}

/**
 * Builds the active-document header shown above the editor, mirroring the
 * compact document bar of opencode-desktop: file identity on the left and
 * preview/copy actions on the right.
 */
export function createDocumentHeader(options: DocumentHeaderOptions): HTMLElement {
  const { tab, language } = options;
  const header = document.createElement("div");
  header.className = "document-header";

  const info = document.createElement("div");
  info.className = "document-header-info";

  const name = document.createElement("span");
  name.className = "document-name";
  name.textContent = tab.name;
  name.title = tab.path;

  const path = document.createElement("span");
  path.className = "document-path";
  path.textContent = tab.path;

  info.append(name, path);

  const actions = document.createElement("div");
  actions.className = "document-actions";

  if (isMarkdownPath(tab.path)) {
    const previewBtn = document.createElement("button");
    const previewing = tab.viewMode === "preview";
    previewBtn.className = "icon-btn document-action";
    previewBtn.classList.toggle("active", previewing);
    previewBtn.dataset.action = "preview";
    previewBtn.setAttribute("aria-pressed", String(previewing));
    previewBtn.title = `${t(language, previewing ? "editDocument" : "previewDocument")} (⌘⌥P)`;
    previewBtn.setAttribute(
      "aria-label",
      t(language, previewing ? "editDocument" : "previewDocument"),
    );
    previewBtn.textContent = "</>";
    previewBtn.onclick = () => options.onTogglePreview();
    actions.appendChild(previewBtn);
  }

  const copyBtn = document.createElement("button");
  copyBtn.className = "icon-btn document-action";
  copyBtn.dataset.action = "copy";
  copyBtn.title = t(language, "copyDocument");
  copyBtn.setAttribute("aria-label", t(language, "copyDocument"));
  copyBtn.textContent = "⧉";
  copyBtn.onclick = () => {
    void options.onCopy().then((copied) => {
      if (!copied || !copyBtn.isConnected) return;
      copyBtn.textContent = `✓ ${t(language, "copied")}`;
      copyBtn.classList.add("copied");
      window.setTimeout(() => {
        if (!copyBtn.isConnected) return;
        copyBtn.textContent = "⧉";
        copyBtn.classList.remove("copied");
      }, 1500);
    });
  };
  actions.appendChild(copyBtn);

  header.append(info, actions);
  return header;
}
