import { t } from "../i18n";
import { Language, OpenTab } from "../types";
import { createIcon } from "../ui/icons";
import { createIconButton } from "../ui/iconButton";
import { isFountainPath, isMarkdownPath } from "./state";

export interface DocumentHeaderOptions {
  tab: OpenTab;
  language: Language;
  onTogglePreview: () => void;
  onCopy: () => Promise<boolean>;
  onSendSelection?: () => void;
  onExportPdf?: () => void;
  canDiff?: boolean;
  diffActive?: boolean;
  onToggleDiff?: () => void;
  canDiscard?: boolean;
  onDiscard?: () => void;
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
  name.title = tab.untitled ? tab.name : tab.path;

  const path = document.createElement("span");
  path.className = "document-path";
  path.textContent = tab.untitled
    ? t(language, "untitledFileHint")
    : tab.path;

  info.append(name, path);

  const actions = document.createElement("div");
  actions.className = "document-actions";

  if (options.onSendSelection) {
    const sendBtn = createIconButton({
      icon: "arrow-up-right",
      label: t(language, "chatSendSelection"),
      className: "document-action",
      onClick: () => options.onSendSelection?.(),
    });
    sendBtn.dataset.action = "send-selection";
    actions.appendChild(sendBtn);
  }

  if (isMarkdownPath(tab.path)) {
    const previewing = tab.viewMode === "preview";
    const previewBtn = createIconButton({
      icon: previewing ? "pencil" : "eye",
      label: t(language, previewing ? "editDocument" : "previewDocument"),
      title: `${t(language, previewing ? "editDocument" : "previewDocument")} (⌘⌥P)`,
      className: "document-action",
      active: previewing,
      onClick: () => options.onTogglePreview(),
    });
    previewBtn.dataset.action = "preview";
    actions.appendChild(previewBtn);
  }

  if (options.canDiff && options.onToggleDiff) {
    const diffBtn = createIconButton({
      icon: "file-diff",
      label: t(language, "diffButton"),
      className: "document-action",
      active: Boolean(options.diffActive),
      onClick: () => options.onToggleDiff?.(),
    });
    diffBtn.dataset.action = "diff";
    actions.appendChild(diffBtn);
  }

  if (options.canDiscard && options.onDiscard) {
    const discardBtn = createIconButton({
      icon: "rotate-ccw",
      label: t(language, "discardChangesTitle"),
      className: "document-action",
      onClick: () => options.onDiscard?.(),
    });
    discardBtn.dataset.action = "discard";
    actions.appendChild(discardBtn);
  }

  if (isFountainPath(tab.path) && options.onExportPdf) {
    const exportBtn = createIconButton({
      icon: "download",
      label: t(language, "exportPdf"),
      title: `${t(language, "exportPdf")} (⌘E)`,
      className: "document-action",
      onClick: () => options.onExportPdf?.(),
    });
    exportBtn.dataset.action = "export-pdf";
    actions.appendChild(exportBtn);
  }

  const copyBtn = createIconButton({
    icon: "copy",
    label: t(language, "copyDocument"),
    className: "document-action",
  });
  copyBtn.dataset.action = "copy";
  copyBtn.onclick = () => {
    void options.onCopy().then((copied) => {
      if (!copied || !copyBtn.isConnected) return;
      copyBtn.replaceChildren(createIcon("check", 16));
      copyBtn.title = t(language, "copied");
      copyBtn.setAttribute("aria-label", t(language, "copied"));
      copyBtn.classList.add("copied");
      window.setTimeout(() => {
        if (!copyBtn.isConnected) return;
        copyBtn.replaceChildren(createIcon("copy", 16));
        copyBtn.title = t(language, "copyDocument");
        copyBtn.setAttribute("aria-label", t(language, "copyDocument"));
        copyBtn.classList.remove("copied");
      }, 1500);
    });
  };
  actions.appendChild(copyBtn);

  header.append(info, actions);
  return header;
}
