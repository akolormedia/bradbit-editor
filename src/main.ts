import { backend, isTauriEnvironment } from "./backend";
import { BradbitCodeMirror } from "./editor/codemirror";
import { renderMarkdownPreview } from "./editor/preview";
import { t } from "./i18n";
import {
  AppSettings,
  FileTreeNode,
  MenuCommand,
  MenuUiState,
  OpenedFolder,
  OpenTab,
  RecentProject,
  SearchMatch,
} from "./types";
import { copyTextToClipboard } from "./workspace/clipboard";
import { createDocumentHeader } from "./workspace/documentHeader";
import { MenuSyncQueue } from "./workspace/menuSync";
import { extractOutline, OutlineItem } from "./workspace/outline";
import { flattenFileTree } from "./workspace/quickOpen";
import { SearchPalette } from "./workspace/searchPalette";
import {
  buildMenuUiState,
  closeTabInState,
  countWordsAndChars,
  DEFAULT_SETTINGS,
  filterTreeNodes,
  isFountainPath,
  isMarkdownPath,
  isTabDirty,
  markTabSaved,
  openFileInTabs,
  renamePathInTabs,
  resolveProjectLink,
  TabListState,
  toggleTabViewMode,
  updateTabContent,
} from "./workspace/state";

type ModalState =
  | { kind: "none" }
  | { kind: "settings" }
  | { kind: "quick-open" }
  | { kind: "global-search" }
  | { kind: "entry-input"; mode: "new-file" | "new-folder" | "rename"; targetPath: string; value: string; error?: string }
  | { kind: "confirm-delete"; targetPath: string; error?: string }
  | { kind: "confirm-unsaved"; tabPath: string; tabName: string };

/** Shortcuts owned by the native menu when running inside Tauri. */
const NATIVE_MENU_KEYS = new Set(["b", "i", "s", "o", "n", "w", ",", "f"]);

function isNativeMenuShortcut(key: string, _shift: boolean, _alt: boolean): boolean {
  if (key === "e") return true;
  if (key === "p") return true;
  return NATIVE_MENU_KEYS.has(key);
}

class BradbitApp {
  private settings: AppSettings = { ...DEFAULT_SETTINGS };
  private folder: OpenedFolder | null = null;
  private recents: RecentProject[] = [];
  private tabState: TabListState = { tabs: [], activeTabPath: null };
  private collapsedDirs = new Set<string>();
  private sidebarVisible = true;
  private sidebarTab: "files" | "outline" = "files";
  private sidebarWidth = 260;
  private outlineRefreshTimer: number | null = null;
  private modal: ModalState = { kind: "none" };
  private statusNotice = "";
  private menuQueue = new MenuSyncQueue<MenuUiState>(
    () => {
      const activeTab = this.getActiveTab();
      return buildMenuUiState({
        settings: this.settings,
        hasFolder: this.folder !== null,
        hasActiveTab: activeTab !== null,
        isMarkdown: activeTab ? isMarkdownPath(activeTab.path) : false,
        isFountain: activeTab ? isFountainPath(activeTab.path) : false,
        previewMode: activeTab?.viewMode === "preview",
        sidebarVisible: this.sidebarVisible,
      });
    },
    (state) => backend.refreshMenu(state),
    (err) => console.error("No se pudo actualizar el menú nativo", err),
  );

  private rootEl: HTMLElement;
  private cmHostEl: HTMLElement | null = null;
  private editor: BradbitCodeMirror | null = null;

  constructor(rootEl: HTMLElement) {
    this.rootEl = rootEl;
    this.bindGlobalShortcuts();
  }

  public async init(): Promise<void> {
    this.settings = await backend.loadSettings();
    this.recents = await backend.listRecentProjects();
    try {
      await backend.listenMenuCommands((command) => {
        void this.executeMenuCommand(command);
      });
    } catch (err) {
      console.error("No se pudo conectar el menú nativo", err);
    }
    this.applyThemeAttribute();
    this.render();
  }

  private applyThemeAttribute(): void {
    let effective = this.settings.theme;
    if (effective === "system") {
      effective = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }
    document.documentElement.setAttribute("data-theme", effective);
  }

  private getActiveTab(): OpenTab | null {
    if (!this.tabState.activeTabPath) return null;
    return this.tabState.tabs.find((t) => t.path === this.tabState.activeTabPath) ?? null;
  }

  private async handleOpenFolderDialog(): Promise<void> {
    const picked = await backend.pickFolderDialog();
    if (!picked) return;
    await this.openFolderByPath(picked);
  }

  public async openFolderByPath(path: string): Promise<void> {
    try {
      const opened = await backend.openFolder(path, this.settings.showConfigFiles);
      this.folder = opened;
      this.tabState = { tabs: [], activeTabPath: null };
      this.collapsedDirs.clear();
      this.editor?.destroy();
      this.editor = null;
      this.recents = await backend.listRecentProjects();
      this.render();
    } catch (err) {
      this.statusNotice = err instanceof Error ? err.message : String(err);
      this.render();
    }
  }

  private async refreshTree(): Promise<void> {
    if (!this.folder) return;
    const tree = await backend.listDirectoryTree(
      this.folder.rootPath,
      this.settings.showConfigFiles,
    );
    this.folder = {
      ...this.folder,
      tree,
    };
  }

  private async openFileFromTree(relPath: string, pin: boolean): Promise<void> {
    if (!this.folder) return;
    try {
      const existing = this.tabState.tabs.find((t) => t.path === relPath);
      const content = existing
        ? existing.content
        : await backend.readTextFile(this.folder.rootPath, relPath);
      const name = relPath.split("/").pop() || relPath;
      this.tabState = openFileInTabs(this.tabState, { path: relPath, name, content }, pin);
      this.render();
    } catch (err) {
      this.statusNotice = err instanceof Error ? err.message : String(err);
      this.render();
    }
  }

  private async saveActiveTab(): Promise<boolean> {
    const active = this.getActiveTab();
    if (!active || !this.folder) return false;
    try {
      await backend.writeTextFile(this.folder.rootPath, active.path, active.content);
      this.tabState = markTabSaved(this.tabState, active.path);
      this.statusNotice = t(this.settings.language, "saved");
      this.render();
      return true;
    } catch (err) {
      this.statusNotice = err instanceof Error ? err.message : String(err);
      this.render();
      return false;
    }
  }

  private requestCloseTab(path: string): void {
    const tab = this.tabState.tabs.find((t) => t.path === path);
    if (!tab) return;
    if (isTabDirty(tab)) {
      this.modal = { kind: "confirm-unsaved", tabPath: tab.path, tabName: tab.name };
      this.render();
      return;
    }
    this.performCloseTab(path);
  }

  private performCloseTab(path: string): void {
    this.editor?.closeDocumentState(path);
    this.tabState = closeTabInState(this.tabState, path);
    this.modal = { kind: "none" };
    this.render();
  }

  private openEntryModal(
    mode: "new-file" | "new-folder" | "rename",
    basePath = "",
  ): void {
    let initialValue = "";
    if (mode === "rename") {
      initialValue = basePath;
    } else if (basePath) {
      initialValue = `${basePath}/`;
    } else if (mode === "new-file") {
      initialValue = "nuevo-documento.md";
    } else {
      initialValue = "nueva-carpeta";
    }
    this.modal = {
      kind: "entry-input",
      mode,
      targetPath: basePath,
      value: initialValue,
    };
    this.render();
  }

  private async submitEntryModal(): Promise<void> {
    if (this.modal.kind !== "entry-input" || !this.folder) return;
    const currentModal = this.modal;
    const rawValue = currentModal.value.trim().replace(/^\/+|\/+$/g, "");
    if (!rawValue || rawValue.includes("..")) {
      this.modal = { ...currentModal, error: "Nombre o ruta inválida" };
      this.render();
      return;
    }

    try {
      if (currentModal.mode === "new-file") {
        await backend.createEntry(this.folder.rootPath, rawValue, false);
        await this.refreshTree();
        this.modal = { kind: "none" };
        await this.openFileFromTree(rawValue, true);
      } else if (currentModal.mode === "new-folder") {
        await backend.createEntry(this.folder.rootPath, rawValue, true);
        await this.refreshTree();
        this.modal = { kind: "none" };
        this.render();
      } else if (currentModal.mode === "rename") {
        const oldPath = currentModal.targetPath;
        if (oldPath !== rawValue) {
          await backend.renameEntry(this.folder.rootPath, oldPath, rawValue);
          this.editor?.renameDocumentState(oldPath, rawValue);
          this.tabState = renamePathInTabs(this.tabState, oldPath, rawValue);
          await this.refreshTree();
        }
        this.modal = { kind: "none" };
        this.render();
      }
    } catch (err) {
      this.modal = {
        ...currentModal,
        error: err instanceof Error ? err.message : String(err),
      };
      this.render();
    }
  }

  private async confirmDeleteEntry(): Promise<void> {
    if (this.modal.kind !== "confirm-delete" || !this.folder) return;
    const currentModal = this.modal;
    const target = currentModal.targetPath;
    try {
      await backend.deleteEntry(this.folder.rootPath, target);
      for (const tab of [...this.tabState.tabs]) {
        if (tab.path === target || tab.path.startsWith(`${target}/`)) {
          this.editor?.closeDocumentState(tab.path);
          this.tabState = closeTabInState(this.tabState, tab.path);
        }
      }
      await this.refreshTree();
      this.modal = { kind: "none" };
      this.render();
    } catch (err) {
      this.modal = {
        ...currentModal,
        error: err instanceof Error ? err.message : String(err),
      };
      this.render();
    }
  }

  private async updateSettings(patch: Partial<AppSettings>): Promise<void> {
    const prevShowConfig = this.settings.showConfigFiles;
    this.settings = await backend.saveSettings({
      ...this.settings,
      ...patch,
    });
    this.applyThemeAttribute();
    if (this.folder && prevShowConfig !== this.settings.showConfigFiles) {
      await this.refreshTree();
    }
    this.editor?.applySettings(this.settings);
    this.render();
  }

  private syncMenu(): void {
    this.menuQueue.request();
  }

  private toggleSidebar(): void {
    this.sidebarVisible = !this.sidebarVisible;
    this.render();
  }

  private togglePreview(): void {
    const active = this.getActiveTab();
    if (!active || !isMarkdownPath(active.path)) return;
    this.tabState = toggleTabViewMode(this.tabState, active.path);
    this.render();
    if (this.getActiveTab()?.viewMode === "edit") {
      this.editor?.focus();
    }
  }

  private ensureEditMode(): void {
    if (this.getActiveTab()?.viewMode === "preview") {
      this.togglePreview();
    }
  }

  private openQuickOpen(): void {
    if (!this.folder) return;
    this.modal = { kind: "quick-open" };
    this.render();
  }

  private openGlobalSearch(): void {
    if (!this.folder) return;
    this.modal = { kind: "global-search" };
    this.render();
  }

  private closeModal(): void {
    this.modal = { kind: "none" };
    this.render();
  }

  private openQuickFile(path: string): void {
    this.modal = { kind: "none" };
    void this.openFileFromTree(path, true);
  }

  private openSearchMatch(match: SearchMatch): void {
    this.modal = { kind: "none" };
    void this.openFileAtLine(match.path, match.line);
  }

  private async openFileAtLine(path: string, line: number): Promise<void> {
    await this.openFileFromTree(path, true);
    this.editor?.gotoLine(line);
  }

  private async copyActiveDocument(): Promise<boolean> {
    const active = this.getActiveTab();
    if (!active) return false;
    const copied = await copyTextToClipboard(active.content);
    if (!copied) {
      this.showStatusNotice(t(this.settings.language, "copyError"));
    }
    return copied;
  }

  private async exportActiveFountainPdf(): Promise<void> {
    const active = this.getActiveTab();
    if (!active || !this.folder || !isTauriEnvironment() || !isFountainPath(active.path)) {
      return;
    }
    try {
      const output = await backend.exportFountainPdf(
        this.folder.rootPath,
        active.path,
        active.content,
      );
      this.showStatusNotice(
        `${t(this.settings.language, "pdfExported")}: ${output}`,
      );
    } catch (err) {
      this.showStatusNotice(err instanceof Error ? err.message : String(err));
    }
  }

  private showStatusNotice(message: string): void {
    this.statusNotice = message;
    const active = this.getActiveTab();
    const statusBar = this.rootEl.querySelector(".statusbar");
    if (statusBar) {
      statusBar.replaceWith(this.renderStatusbar(this.settings.language, active));
    }
  }

  private performUndo(): void {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
      document.execCommand("undo");
      return;
    }
    this.editor?.undo();
  }

  private performRedo(): void {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
      document.execCommand("redo");
      return;
    }
    this.editor?.redo();
  }

  private async executeMenuCommand(command: MenuCommand): Promise<void> {
    const activeElement = document.activeElement;
    const editingTextInput =
      activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement;
    const isInputUndo =
      editingTextInput && (command.id === "edit.undo" || command.id === "edit.redo");

    if (this.modal.kind !== "none" && command.id !== "app.settings" && !isInputUndo) {
      return;
    }

    switch (command.id) {
      case "app.settings":
        this.modal = { kind: "settings" };
        this.render();
        break;
      case "file.openFolder":
        await this.handleOpenFolderDialog();
        break;
      case "file.openRecent":
        if (command.path) {
          await this.openFolderByPath(command.path);
        }
        break;
      case "file.newFile":
        if (this.folder) {
          this.openEntryModal("new-file");
        }
        break;
      case "file.save":
        await this.saveActiveTab();
        break;
      case "file.exportPdf":
        await this.exportActiveFountainPdf();
        break;
      case "file.quickOpen":
        this.openQuickOpen();
        break;
      case "file.closeTab":
        if (this.tabState.activeTabPath) {
          this.requestCloseTab(this.tabState.activeTabPath);
        }
        break;
      case "edit.undo":
        this.performUndo();
        break;
      case "edit.redo":
        this.performRedo();
        break;
      case "edit.bold":
        this.ensureEditMode();
        this.editor?.toggleBold();
        break;
      case "edit.italic":
        this.ensureEditMode();
        this.editor?.toggleItalic();
        break;
      case "edit.find":
        this.editor?.openFindPanel();
        break;
      case "edit.findReplace":
        this.editor?.openReplacePanel();
        break;
      case "edit.findInProject":
        this.openGlobalSearch();
        break;
      case "view.toggleSidebar":
        this.toggleSidebar();
        break;
      case "view.togglePreview":
        this.togglePreview();
        break;
      case "view.wordWrap":
        await this.updateSettings({ wordWrap: !this.settings.wordWrap });
        break;
      case "view.lineNumbers":
        await this.updateSettings({ lineNumbers: !this.settings.lineNumbers });
        break;
    }
  }

  private bindGlobalShortcuts(): void {
    window.addEventListener("keydown", (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === "Escape" && this.modal.kind !== "none") {
        e.preventDefault();
        this.modal = { kind: "none" };
        this.render();
        return;
      }
      if (!mod) return;
      if (e.defaultPrevented) return;

      const letter = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3).toLowerCase() : e.key.toLowerCase();
      if (isTauriEnvironment() && isNativeMenuShortcut(letter, e.shiftKey, e.altKey)) {
        // On macOS the native menu owns these accelerators. Preventing the
        // webview default avoids running the command twice.
        e.preventDefault();
        return;
      }
      if (letter === "e" && e.shiftKey) {
        e.preventDefault();
        this.toggleSidebar();
      } else if (letter === "s") {
        e.preventDefault();
        void this.saveActiveTab();
      } else if (letter === "o") {
        e.preventDefault();
        void this.handleOpenFolderDialog();
      } else if (letter === "n" && this.folder) {
        e.preventDefault();
        this.openEntryModal("new-file");
      } else if (letter === "w" && this.tabState.activeTabPath) {
        e.preventDefault();
        this.requestCloseTab(this.tabState.activeTabPath);
      } else if (letter === ",") {
        e.preventDefault();
        this.modal = { kind: "settings" };
        this.render();
      } else if (letter === "f" && e.shiftKey) {
        e.preventDefault();
        this.openGlobalSearch();
      } else if (letter === "f" && this.getActiveTab()) {
        e.preventDefault();
        this.editor?.openFindPanel();
      } else if (letter === "p" && e.altKey && this.getActiveTab()) {
        e.preventDefault();
        this.togglePreview();
      } else if (letter === "p") {
        e.preventDefault();
        this.openQuickOpen();
      }
    });
  }

  public render(): void {
    const lang = this.settings.language;
    const activeTab = this.getActiveTab();

    // Preserve CodeMirror host element across renders so typing/focus never drops
    if (!this.cmHostEl) {
      this.cmHostEl = document.createElement("div");
      this.cmHostEl.className = "cm-host";
    }

    this.rootEl.innerHTML = "";
    const shell = document.createElement("div");
    shell.className = "app-shell";

    // Topbar
    shell.appendChild(this.renderTopbar(lang, activeTab));

    if (!this.folder) {
      shell.appendChild(this.renderWelcomeScreen(lang));
    } else {
      const body = document.createElement("div");
      body.className = "workspace-body";

      if (this.sidebarVisible) {
        body.appendChild(this.renderSidebar(lang));
        body.appendChild(this.renderSidebarResizer());
      }

      body.appendChild(this.renderEditorColumn(lang, activeTab));
      shell.appendChild(body);
    }

    shell.appendChild(this.renderStatusbar(lang, activeTab));

    if (this.modal.kind !== "none") {
      shell.appendChild(this.renderModal(lang));
    }

    this.rootEl.appendChild(shell);

    // Sync CodeMirror instance if a tab is active
    if (this.folder && activeTab && this.cmHostEl) {
      if (!this.editor) {
        this.editor = new BradbitCodeMirror(this.cmHostEl, this.settings, {
          onContentChange: (path, content) => {
            this.tabState = updateTabContent(this.tabState, path, content);
            this.updateLightweightChrome();
            this.refreshOutlineSoon();
          },
          onCursorChange: (path, line, col) => {
            this.tabState = {
              ...this.tabState,
              tabs: this.tabState.tabs.map((tab) =>
                tab.path === path ? { ...tab, cursorLine: line, cursorCol: col } : tab,
              ),
            };
            this.updateLightweightChrome();
          },
          onSaveShortcut: () => {
            void this.saveActiveTab();
          },
        });
      }
      this.editor.openDocument(activeTab.path, activeTab.content, this.settings);
    }

    // Keep native menu labels, check marks and enabled items aligned with the UI.
    this.syncMenu();
  }

  /**
   * Updates tab dirty indicators and statusbar metrics on each keystroke without rebuilding the DOM.
   */
  private updateLightweightChrome(): void {
    const active = this.getActiveTab();
    if (!active) return;

    const tabEl = this.rootEl.querySelector(
      `.tab-item[data-tab-path="${CSS.escape(active.path)}"]`,
    );
    if (tabEl) {
      tabEl.classList.toggle("preview", active.preview);
      const dot = tabEl.querySelector(".tab-dirty-dot") as HTMLElement | null;
      if (dot) {
        dot.textContent = isTabDirty(active) ? "•" : "";
      }
    }

    const statusBar = this.rootEl.querySelector(".statusbar");
    if (statusBar) {
      statusBar.replaceWith(this.renderStatusbar(this.settings.language, active));
    }
  }

  private renderTopbar(lang: AppSettings["language"], activeTab: OpenTab | null): HTMLElement {
    const bar = document.createElement("header");
    bar.className = "topbar";

    const left = document.createElement("div");
    left.className = "topbar-left";

    if (this.folder) {
      const toggleBtn = document.createElement("button");
      toggleBtn.className = "icon-btn";
      toggleBtn.title = `${t(lang, "toggleSidebar")} (⌘⇧E)`;
      toggleBtn.textContent = "☰";
      toggleBtn.onclick = () => this.toggleSidebar();
      left.appendChild(toggleBtn);

      const badge = document.createElement("span");
      badge.className = "project-badge";
      badge.textContent = this.folder.name;
      badge.title = this.folder.rootPath;
      left.appendChild(badge);
    } else {
      const brand = document.createElement("span");
      brand.className = "project-badge";
      brand.textContent = t(lang, "appName");
      left.appendChild(brand);
    }

    const right = document.createElement("div");
    right.className = "topbar-right";

    const openBtn = document.createElement("button");
    openBtn.className = "toolbar-btn";
    openBtn.textContent = t(lang, "openFolder");
    openBtn.onclick = () => void this.handleOpenFolderDialog();
    right.appendChild(openBtn);

    if (this.folder) {
      const newFileBtn = document.createElement("button");
      newFileBtn.className = "toolbar-btn";
      newFileBtn.textContent = `+ ${t(lang, "newFile")}`;
      newFileBtn.onclick = () => this.openEntryModal("new-file");
      right.appendChild(newFileBtn);

      if (activeTab) {
        const findBtn = document.createElement("button");
        findBtn.className = "toolbar-btn";
        findBtn.textContent = `🔍 ${t(lang, "findReplace")}`;
        findBtn.onclick = () => this.editor?.openFindPanel();
        right.appendChild(findBtn);

        const saveBtn = document.createElement("button");
        saveBtn.className = "toolbar-btn primary";
        saveBtn.textContent = `${t(lang, "save")} (⌘S)`;
        saveBtn.onclick = () => void this.saveActiveTab();
        right.appendChild(saveBtn);
      }

      const closeFolderBtn = document.createElement("button");
      closeFolderBtn.className = "toolbar-btn";
      closeFolderBtn.textContent = t(lang, "closeFolder");
      closeFolderBtn.onclick = () => {
        this.folder = null;
        this.tabState = { tabs: [], activeTabPath: null };
        this.editor?.destroy();
        this.editor = null;
        this.render();
      };
      right.appendChild(closeFolderBtn);
    }

    const settingsBtn = document.createElement("button");
    settingsBtn.className = "toolbar-btn";
    settingsBtn.dataset.testid = "open-settings-btn";
    settingsBtn.textContent = `⚙ ${t(lang, "settings")}`;
    settingsBtn.onclick = () => {
      this.modal = { kind: "settings" };
      this.render();
    };
    right.appendChild(settingsBtn);

    bar.append(left, right);
    return bar;
  }

  private renderWelcomeScreen(lang: AppSettings["language"]): HTMLElement {
    const container = document.createElement("main");
    container.className = "welcome-screen";

    const card = document.createElement("div");
    card.className = "welcome-card";

    const header = document.createElement("div");
    header.className = "welcome-header";
    const h1 = document.createElement("h1");
    h1.textContent = t(lang, "welcomeTitle");
    const p = document.createElement("p");
    p.textContent = t(lang, "welcomeSubtitle");
    header.append(h1, p);

    const actions = document.createElement("div");
    actions.className = "welcome-actions";

    const openBtn = document.createElement("button");
    openBtn.className = "toolbar-btn primary";
    openBtn.dataset.testid = "welcome-open-folder-btn";
    openBtn.textContent = `${t(lang, "openFolder")} (⌘O)`;
    openBtn.onclick = () => void this.handleOpenFolderDialog();

    const demoBtn = document.createElement("button");
    demoBtn.className = "toolbar-btn";
    demoBtn.dataset.testid = "welcome-open-guionista-kit-btn";
    demoBtn.textContent = t(lang, "openGuionistaKitDemo");
    demoBtn.onclick = () =>
      void this.openFolderByPath("/Users/rafaelolivares/Documents/GitHub/guionista-kit");

    actions.append(openBtn, demoBtn);

    const recentsSec = document.createElement("div");
    recentsSec.className = "recents-section";
    const h3 = document.createElement("h3");
    h3.textContent = t(lang, "recentProjects");
    recentsSec.appendChild(h3);

    if (this.recents.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = t(lang, "noRecentProjects");
      recentsSec.appendChild(empty);
    } else {
      const list = document.createElement("div");
      list.className = "recents-list";
      for (const item of this.recents) {
        const row = document.createElement("div");
        row.className = "recent-item";
        row.onclick = () => void this.openFolderByPath(item.path);

        const info = document.createElement("div");
        info.className = "recent-info";
        const nameEl = document.createElement("span");
        nameEl.className = "recent-name";
        nameEl.textContent = item.name;
        const pathEl = document.createElement("span");
        pathEl.className = "recent-path";
        pathEl.textContent = item.path;
        info.append(nameEl, pathEl);

        const removeBtn = document.createElement("button");
        removeBtn.className = "tree-mini-btn";
        removeBtn.title = t(lang, "removeRecent");
        removeBtn.textContent = "×";
        removeBtn.onclick = async (e) => {
          e.stopPropagation();
          this.recents = await backend.removeRecentProject(item.path);
          this.render();
        };

        row.append(info, removeBtn);
        list.appendChild(row);
      }
      recentsSec.appendChild(list);
    }

    card.append(header, actions, recentsSec);
    container.appendChild(card);
    return container;
  }

  private renderSidebar(lang: AppSettings["language"]): HTMLElement {
    const aside = document.createElement("aside");
    aside.className = "sidebar";
    aside.style.width = `${this.sidebarWidth}px`;

    const tabs = this.renderSidebarTabs(lang);

    const header = document.createElement("div");
    header.className = "sidebar-header";
    const title = document.createElement("span");
    title.textContent = t(lang, this.sidebarTab === "files" ? "explorerTitle" : "outlineTitle");

    const actions = document.createElement("div");
    actions.className = "sidebar-actions";

    if (this.sidebarTab === "files") {
      const newFileBtn = document.createElement("button");
      newFileBtn.className = "tree-mini-btn";
      newFileBtn.dataset.testid = "sidebar-new-file-btn";
      newFileBtn.title = `${t(lang, "newFile")} (⌘N)`;
      newFileBtn.textContent = "+📄";
      newFileBtn.onclick = () => this.openEntryModal("new-file");

      const newFolderBtn = document.createElement("button");
      newFolderBtn.className = "tree-mini-btn";
      newFolderBtn.dataset.testid = "sidebar-new-folder-btn";
      newFolderBtn.title = t(lang, "newFolder");
      newFolderBtn.textContent = "+📁";
      newFolderBtn.onclick = () => this.openEntryModal("new-folder");

      actions.append(newFileBtn, newFolderBtn);
    }

    header.append(title, actions);
    aside.append(tabs, header);

    if (this.sidebarTab === "files") {
      aside.appendChild(this.renderFileTree(lang));
    } else {
      aside.appendChild(this.renderOutline(lang));
    }
    return aside;
  }

  private renderSidebarTabs(lang: AppSettings["language"]): HTMLElement {
    const tabs = document.createElement("div");
    tabs.className = "sidebar-tabs";

    const makeTab = (label: string, tab: "files" | "outline"): HTMLButtonElement => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "sidebar-tab";
      button.dataset.sidebarTab = tab;
      button.textContent = label;
      button.classList.toggle("active", this.sidebarTab === tab);
      button.onclick = () => {
        if (this.sidebarTab === tab) return;
        this.sidebarTab = tab;
        this.render();
      };
      return button;
    };

    tabs.append(
      makeTab(t(lang, "filesTab"), "files"),
      makeTab(t(lang, "outlineTab"), "outline"),
    );
    return tabs;
  }

  private renderFileTree(lang: AppSettings["language"]): HTMLElement {
    const treeContainer = document.createElement("div");
    treeContainer.className = "tree-container";
    const visibleTree = filterTreeNodes(
      this.folder?.tree ?? [],
      this.settings.showConfigFiles,
    );

    const renderNodes = (nodes: FileTreeNode[], depth: number) => {
      for (const node of nodes) {
        const row = document.createElement("div");
        row.className = "tree-row";
        row.setAttribute("role", "button");
        row.tabIndex = 0;
        row.dataset.treePath = node.path;
        if (!node.isDir && this.tabState.activeTabPath === node.path) {
          row.classList.add("active");
        }
        row.style.paddingLeft = `${8 + depth * 14}px`;

        const label = document.createElement("div");
        label.className = "tree-row-label";

        const icon = document.createElement("span");
        const isCollapsed = this.collapsedDirs.has(node.path);
        if (node.isDir) {
          icon.textContent = isCollapsed ? "▸ 📁" : "▾ 📂";
        } else if (node.name.endsWith(".fountain")) {
          icon.textContent = "🎬";
        } else if (node.name.endsWith(".md") || node.name.endsWith(".mdx")) {
          icon.textContent = "📝";
        } else {
          icon.textContent = "📄";
        }

        const nameSpan = document.createElement("span");
        nameSpan.textContent = node.name;
        label.append(icon, nameSpan);

        const rowActions = document.createElement("div");
        rowActions.className = "tree-row-actions";

        if (node.isDir) {
          const addInDirBtn = document.createElement("button");
          addInDirBtn.className = "tree-mini-btn";
          addInDirBtn.title = t(lang, "newFile");
          addInDirBtn.textContent = "+";
          addInDirBtn.onclick = (e) => {
            e.stopPropagation();
            this.openEntryModal("new-file", node.path);
          };
          rowActions.appendChild(addInDirBtn);
        }

        const renameBtn = document.createElement("button");
        renameBtn.className = "tree-mini-btn";
        renameBtn.title = t(lang, "rename");
        renameBtn.textContent = "✎";
        renameBtn.onclick = (e) => {
          e.stopPropagation();
          this.openEntryModal("rename", node.path);
        };

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "tree-mini-btn";
        deleteBtn.title = t(lang, "delete");
        deleteBtn.textContent = "🗑";
        deleteBtn.onclick = (e) => {
          e.stopPropagation();
          this.modal = { kind: "confirm-delete", targetPath: node.path };
          this.render();
        };

        rowActions.append(renameBtn, deleteBtn);
        row.append(label, rowActions);

        row.onclick = () => {
          if (node.isDir) {
            if (this.collapsedDirs.has(node.path)) {
              this.collapsedDirs.delete(node.path);
            } else {
              this.collapsedDirs.add(node.path);
            }
            this.render();
          } else {
            void this.openFileFromTree(node.path, false);
          }
        };

        row.ondblclick = () => {
          if (!node.isDir) {
            void this.openFileFromTree(node.path, true);
          }
        };

        treeContainer.appendChild(row);

        if (node.isDir && node.children && !isCollapsed) {
          renderNodes(node.children, depth + 1);
        }
      }
    };

    renderNodes(visibleTree, 0);
    return treeContainer;
  }

  private renderOutline(lang: AppSettings["language"]): HTMLElement {
    const container = document.createElement("div");
    container.className = "outline-container";

    const activeTab = this.getActiveTab();
    if (!activeTab) {
      container.appendChild(this.outlineMessage(t(lang, "outlineEmpty")));
      return container;
    }

    const outline = extractOutline(activeTab.path, activeTab.content);
    if (!outline) {
      container.appendChild(this.outlineMessage(t(lang, "outlineUnsupported")));
      return container;
    }
    if (outline.items.length === 0) {
      container.appendChild(this.outlineMessage(t(lang, "outlineNoHeadings")));
      return container;
    }

    for (const item of outline.items) {
      container.appendChild(this.renderOutlineItem(item, lang));
    }

    if (outline.pageCount !== null) {
      const pages = document.createElement("div");
      pages.className = "outline-pages";
      pages.textContent = t(lang, "estimatedPages", { count: String(outline.pageCount) });
      container.appendChild(pages);
    }

    return container;
  }

  private renderOutlineItem(item: OutlineItem, lang: AppSettings["language"]): HTMLButtonElement {
    const row = document.createElement("button");
    row.type = "button";
    row.className = `outline-item outline-level-${Math.min(Math.max(item.level, 1), 6)}`;
    row.dataset.outlineLine = String(item.line);
    row.title = `${t(lang, "lineShort")} ${item.line}`;

    const icon = document.createElement("span");
    icon.className = "outline-icon";
    icon.textContent = item.kind === "scene" ? "🎬" : item.kind === "section" ? "§" : "";
    if (icon.textContent) {
      row.appendChild(icon);
    }

    const label = document.createElement("span");
    label.className = "outline-label";
    label.textContent = item.title;
    row.appendChild(label);

    row.onclick = () => this.jumpToLine(item.line);
    return row;
  }

  private outlineMessage(text: string): HTMLElement {
    const message = document.createElement("div");
    message.className = "outline-empty";
    message.textContent = text;
    return message;
  }

  private refreshOutlineSoon(): void {
    if (this.sidebarTab !== "outline" || !this.sidebarVisible) return;
    if (this.outlineRefreshTimer !== null) {
      window.clearTimeout(this.outlineRefreshTimer);
    }
    this.outlineRefreshTimer = window.setTimeout(() => {
      this.outlineRefreshTimer = null;
      const current = this.rootEl.querySelector(".outline-container");
      if (!current) return;
      const scrollTop = current.scrollTop;
      const next = this.renderOutline(this.settings.language);
      current.replaceWith(next);
      next.scrollTop = scrollTop;
    }, 250);
  }

  private jumpToLine(line: number): void {
    const active = this.getActiveTab();
    if (!active) return;
    if (active.viewMode === "preview") {
      this.togglePreview();
    }
    this.editor?.gotoLine(line);
  }

  private renderSidebarResizer(): HTMLElement {
    const resizer = document.createElement("div");
    resizer.className = "sidebar-resizer";
    resizer.onmousedown = (e) => {
      e.preventDefault();
      resizer.classList.add("dragging");
      const onMove = (moveEvent: MouseEvent) => {
        const nextWidth = Math.min(480, Math.max(180, moveEvent.clientX));
        this.sidebarWidth = nextWidth;
        const sidebar = this.rootEl.querySelector(".sidebar") as HTMLElement | null;
        if (sidebar) {
          sidebar.style.width = `${nextWidth}px`;
        }
      };
      const onUp = () => {
        resizer.classList.remove("dragging");
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    };
    return resizer;
  }

  private renderEditorColumn(lang: AppSettings["language"], activeTab: OpenTab | null): HTMLElement {
    const col = document.createElement("section");
    col.className = "editor-column";

    if (this.tabState.tabs.length > 0) {
      const tabsBar = document.createElement("div");
      tabsBar.className = "tabs-bar";

      for (const tab of this.tabState.tabs) {
        const tabEl = document.createElement("div");
        tabEl.className = "tab-item";
        tabEl.setAttribute("role", "tab");
        tabEl.tabIndex = 0;
        tabEl.dataset.tabPath = tab.path;
        if (tab.path === this.tabState.activeTabPath) {
          tabEl.classList.add("active");
        }
        if (tab.preview) {
          tabEl.classList.add("preview");
        }

        const title = document.createElement("span");
        title.className = "tab-title";
        title.textContent = tab.name;
        title.title = tab.path;

        const dirtyDot = document.createElement("span");
        dirtyDot.className = "tab-dirty-dot";
        dirtyDot.textContent = isTabDirty(tab) ? "•" : "";

        const closeBtn = document.createElement("button");
        closeBtn.className = "tab-close-btn";
        closeBtn.textContent = "×";
        closeBtn.onclick = (e) => {
          e.stopPropagation();
          this.requestCloseTab(tab.path);
        };

        tabEl.onclick = () => {
          this.tabState = { ...this.tabState, activeTabPath: tab.path };
          this.render();
        };

        tabEl.ondblclick = () => {
          this.tabState = openFileInTabs(this.tabState, tab, true);
          this.render();
        };

        tabEl.append(title, dirtyDot, closeBtn);
        tabsBar.appendChild(tabEl);
      }

      col.appendChild(tabsBar);
    }

    if (activeTab) {
      col.appendChild(
        createDocumentHeader({
          tab: activeTab,
          language: lang,
          onTogglePreview: () => this.togglePreview(),
          onCopy: () => this.copyActiveDocument(),
          onExportPdf: isTauriEnvironment()
            ? () => void this.exportActiveFountainPdf()
            : undefined,
        }),
      );
    }

    const surface = document.createElement("div");
    surface.className = "editor-surface";

    if (activeTab && isMarkdownPath(activeTab.path) && activeTab.viewMode === "preview") {
      const preview = document.createElement("div");
      preview.className = "markdown-preview";
      const inner = document.createElement("div");
      inner.className = "markdown-preview-inner";
      inner.innerHTML = renderMarkdownPreview(activeTab.content);
      preview.appendChild(inner);
      preview.addEventListener("click", (e) => this.handlePreviewClick(e, activeTab));
      surface.appendChild(preview);
    } else if (activeTab && this.cmHostEl) {
      surface.appendChild(this.cmHostEl);
    } else {
      const empty = document.createElement("div");
      empty.className = "empty-editor-state";
      const h2 = document.createElement("h2");
      h2.textContent = t(lang, "emptyEditorTitle");
      const p = document.createElement("p");
      p.textContent = t(lang, "emptyEditorHint");
      empty.append(h2, p);
      surface.appendChild(empty);
    }

    col.appendChild(surface);
    return col;
  }

  private handlePreviewClick(event: MouseEvent, activeTab: OpenTab): void {
    const anchor = (event.target as HTMLElement).closest("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href");
    if (!href) return;
    if (href.startsWith("#")) return;

    event.preventDefault();
    if (/^(https?:|mailto:)/i.test(href)) {
      void backend.openExternalUrl(href).catch((err) => {
        console.error("No se pudo abrir el enlace", err);
        this.showStatusNotice(t(this.settings.language, "linkOpenError"));
      });
      return;
    }

    const resolved = resolveProjectLink(activeTab.path, href);
    if (resolved) {
      void this.openFileFromTree(resolved, true);
    }
  }

  private renderStatusbar(lang: AppSettings["language"], activeTab: OpenTab | null): HTMLElement {
    const bar = document.createElement("footer");
    bar.className = "statusbar";

    const left = document.createElement("div");
    left.className = "statusbar-left";

    if (activeTab) {
      const pathSpan = document.createElement("span");
      pathSpan.textContent = activeTab.path;
      left.appendChild(pathSpan);

      const dirtySpan = document.createElement("span");
      const dirty = isTabDirty(activeTab);
      dirtySpan.className = `status-pill ${dirty ? "dirty" : "saved"}`;
      dirtySpan.textContent = dirty ? `● ${t(lang, "unsaved")}` : `✓ ${t(lang, "saved")}`;
      left.appendChild(dirtySpan);

      if (this.statusNotice) {
        const noticeSpan = document.createElement("span");
        noticeSpan.className = "status-notice";
        noticeSpan.textContent = this.statusNotice;
        left.appendChild(noticeSpan);
      }
    } else if (this.statusNotice) {
      const noticeSpan = document.createElement("span");
      noticeSpan.textContent = this.statusNotice;
      left.appendChild(noticeSpan);
    }

    const right = document.createElement("div");
    right.className = "statusbar-right";

    if (activeTab) {
      const counts = countWordsAndChars(activeTab.content);
      const countSpan = document.createElement("span");
      countSpan.textContent = `${counts.words} ${t(lang, "words")} · ${counts.chars} ${t(lang, "chars")}`;

      const posSpan = document.createElement("span");
      posSpan.textContent = `${t(lang, "lineShort")} ${activeTab.cursorLine}, ${t(lang, "colShort")} ${activeTab.cursorCol}`;

      right.append(countSpan, posSpan);
    }

    bar.append(left, right);
    return bar;
  }

  private renderModal(lang: AppSettings["language"]): HTMLElement {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.onclick = (e) => {
      if (e.target === backdrop) {
        this.modal = { kind: "none" };
        this.render();
      }
    };

    const dialog = document.createElement("div");
    dialog.className = "modal-dialog";

    if (this.modal.kind === "settings") {
      const h3 = document.createElement("h3");
      h3.textContent = t(lang, "settings");
      dialog.appendChild(h3);

      // Language
      const langRow = document.createElement("div");
      langRow.className = "form-row-inline";
      const langLabel = document.createElement("label");
      langLabel.className = "form-label";
      langLabel.textContent = t(lang, "language");
      const langSelect = document.createElement("select");
      langSelect.className = "select-input";
      langSelect.style.width = "160px";
      langSelect.innerHTML = `<option value="es">Español</option><option value="en">English</option>`;
      langSelect.value = this.settings.language;
      langSelect.onchange = () =>
        void this.updateSettings({ language: langSelect.value as AppSettings["language"] });
      langRow.append(langLabel, langSelect);

      // Theme
      const themeRow = document.createElement("div");
      themeRow.className = "form-row-inline";
      const themeLabel = document.createElement("label");
      themeLabel.className = "form-label";
      themeLabel.textContent = t(lang, "theme");
      const themeSelect = document.createElement("select");
      themeSelect.className = "select-input";
      themeSelect.style.width = "160px";
      themeSelect.innerHTML = `
        <option value="dark">${t(lang, "themeDark")}</option>
        <option value="light">${t(lang, "themeLight")}</option>
        <option value="system">${t(lang, "themeSystem")}</option>
      `;
      themeSelect.value = this.settings.theme;
      themeSelect.onchange = () =>
        void this.updateSettings({ theme: themeSelect.value as AppSettings["theme"] });
      themeRow.append(themeLabel, themeSelect);

      // Font size
      const fontRow = document.createElement("div");
      fontRow.className = "form-row-inline";
      const fontLabel = document.createElement("label");
      fontLabel.className = "form-label";
      fontLabel.textContent = `${t(lang, "fontSize")} (${this.settings.fontSize}px)`;
      const fontInput = document.createElement("input");
      fontInput.type = "range";
      fontInput.min = "12";
      fontInput.max = "24";
      fontInput.value = String(this.settings.fontSize);
      fontInput.onchange = () =>
        void this.updateSettings({ fontSize: Number(fontInput.value) });
      fontRow.append(fontLabel, fontInput);

      // Word wrap
      const wrapRow = document.createElement("div");
      wrapRow.className = "form-row-inline";
      const wrapLabel = document.createElement("label");
      wrapLabel.className = "form-label";
      wrapLabel.textContent = t(lang, "wordWrap");
      const wrapCheck = document.createElement("input");
      wrapCheck.type = "checkbox";
      wrapCheck.checked = this.settings.wordWrap;
      wrapCheck.onchange = () => void this.updateSettings({ wordWrap: wrapCheck.checked });
      wrapRow.append(wrapLabel, wrapCheck);

      // Line numbers
      const lnRow = document.createElement("div");
      lnRow.className = "form-row-inline";
      const lnLabel = document.createElement("label");
      lnLabel.className = "form-label";
      lnLabel.textContent = t(lang, "lineNumbers");
      const lnCheck = document.createElement("input");
      lnCheck.type = "checkbox";
      lnCheck.checked = this.settings.lineNumbers;
      lnCheck.onchange = () => void this.updateSettings({ lineNumbers: lnCheck.checked });
      lnRow.append(lnLabel, lnCheck);

      // Show config files
      const cfgRow = document.createElement("div");
      cfgRow.className = "form-row-inline";
      const cfgLabel = document.createElement("label");
      cfgLabel.className = "form-label";
      cfgLabel.textContent = t(lang, "showConfigFiles");
      const cfgCheck = document.createElement("input");
      cfgCheck.type = "checkbox";
      cfgCheck.dataset.testid = "toggle-config-files-checkbox";
      cfgCheck.checked = this.settings.showConfigFiles;
      cfgCheck.onchange = () =>
        void this.updateSettings({ showConfigFiles: cfgCheck.checked });
      cfgRow.append(cfgLabel, cfgCheck);

      const footer = document.createElement("div");
      footer.className = "modal-footer";
      const closeBtn = document.createElement("button");
      closeBtn.className = "toolbar-btn primary";
      closeBtn.textContent = t(lang, "close");
      closeBtn.onclick = () => {
        this.modal = { kind: "none" };
        this.render();
      };
      footer.appendChild(closeBtn);

      dialog.append(langRow, themeRow, fontRow, wrapRow, lnRow, cfgRow, footer);
    } else if (this.modal.kind === "quick-open" || this.modal.kind === "global-search") {
      backdrop.classList.add("palette-backdrop");
      dialog.classList.add("search-palette-dialog");

      const files = this.folder
        ? flattenFileTree(filterTreeNodes(this.folder.tree, this.settings.showConfigFiles))
        : [];
      const palette =
        this.modal.kind === "quick-open"
          ? new SearchPalette({
              mode: "files",
              language: lang,
              files,
              onOpenFile: (path) => this.openQuickFile(path),
              onClose: () => this.closeModal(),
            })
          : new SearchPalette({
              mode: "content",
              language: lang,
              search: (query) =>
                this.folder
                  ? backend.searchInFolder(
                      this.folder.rootPath,
                      query,
                      200,
                      this.settings.showConfigFiles,
                    )
                  : Promise.resolve([]),
              onOpenMatch: (match) => this.openSearchMatch(match),
              onClose: () => this.closeModal(),
            });
      dialog.appendChild(palette.element());
    } else if (this.modal.kind === "entry-input") {
      const modalState = this.modal;
      const h3 = document.createElement("h3");
      h3.textContent =
        modalState.mode === "new-file"
          ? t(lang, "newFileTitle")
          : modalState.mode === "new-folder"
            ? t(lang, "newFolderTitle")
            : t(lang, "renameTitle");

      const input = document.createElement("input");
      input.className = "text-input";
      input.dataset.testid = "entry-modal-input";
      input.value = modalState.value;
      input.placeholder = t(lang, "enterNamePlaceholder");
      input.oninput = () => {
        if (this.modal.kind === "entry-input") {
          this.modal.value = input.value;
        }
      };
      input.onkeydown = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          void this.submitEntryModal();
        }
      };

      dialog.append(h3, input);
      if (modalState.error) {
        const errEl = document.createElement("div");
        errEl.className = "error-banner";
        errEl.textContent = modalState.error;
        dialog.appendChild(errEl);
      }

      const footer = document.createElement("div");
      footer.className = "modal-footer";
      const cancelBtn = document.createElement("button");
      cancelBtn.className = "toolbar-btn";
      cancelBtn.textContent = t(lang, "cancel");
      cancelBtn.onclick = () => {
        this.modal = { kind: "none" };
        this.render();
      };

      const submitBtn = document.createElement("button");
      submitBtn.className = "toolbar-btn primary";
      submitBtn.dataset.testid = "entry-modal-submit";
      submitBtn.textContent =
        modalState.mode === "rename" ? t(lang, "confirm") : t(lang, "create");
      submitBtn.onclick = () => void this.submitEntryModal();

      footer.append(cancelBtn, submitBtn);
      dialog.appendChild(footer);
      setTimeout(() => input.focus(), 10);
    } else if (this.modal.kind === "confirm-delete") {
      const h3 = document.createElement("h3");
      h3.textContent = t(lang, "deleteConfirmTitle");
      const p = document.createElement("p");
      p.textContent = t(lang, "deleteConfirmPrompt", { path: this.modal.targetPath });
      dialog.append(h3, p);

      if (this.modal.error) {
        const errEl = document.createElement("div");
        errEl.className = "error-banner";
        errEl.textContent = this.modal.error;
        dialog.appendChild(errEl);
      }

      const footer = document.createElement("div");
      footer.className = "modal-footer";
      const cancelBtn = document.createElement("button");
      cancelBtn.className = "toolbar-btn";
      cancelBtn.textContent = t(lang, "cancel");
      cancelBtn.onclick = () => {
        this.modal = { kind: "none" };
        this.render();
      };

      const delBtn = document.createElement("button");
      delBtn.className = "toolbar-btn danger";
      delBtn.dataset.testid = "confirm-delete-btn";
      delBtn.textContent = t(lang, "delete");
      delBtn.onclick = () => void this.confirmDeleteEntry();

      footer.append(cancelBtn, delBtn);
      dialog.appendChild(footer);
    } else if (this.modal.kind === "confirm-unsaved") {
      const { tabPath, tabName } = this.modal;
      const h3 = document.createElement("h3");
      h3.textContent = t(lang, "saveChangesTitle");
      const p = document.createElement("p");
      p.textContent = t(lang, "saveChangesPrompt", { name: tabName });

      const footer = document.createElement("div");
      footer.className = "modal-footer";

      const cancelBtn = document.createElement("button");
      cancelBtn.className = "toolbar-btn";
      cancelBtn.textContent = t(lang, "cancel");
      cancelBtn.onclick = () => {
        this.modal = { kind: "none" };
        this.render();
      };

      const discardBtn = document.createElement("button");
      discardBtn.className = "toolbar-btn danger";
      discardBtn.textContent = t(lang, "discardChanges");
      discardBtn.onclick = () => this.performCloseTab(tabPath);

      const saveBtn = document.createElement("button");
      saveBtn.className = "toolbar-btn primary";
      saveBtn.textContent = t(lang, "saveAndClose");
      saveBtn.onclick = async () => {
        this.tabState = { ...this.tabState, activeTabPath: tabPath };
        const saved = await this.saveActiveTab();
        if (saved) {
          this.performCloseTab(tabPath);
        }
      };

      footer.append(cancelBtn, discardBtn, saveBtn);
      dialog.append(h3, p, footer);
    }

    backdrop.appendChild(dialog);
    return backdrop;
  }
}

const appRoot = document.getElementById("app");
if (appRoot) {
  const app = new BradbitApp(appRoot);
  void app.init();
}
