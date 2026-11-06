import { backend, isTauriEnvironment } from "./backend";
import { BradbitCodeMirror } from "./editor/codemirror";
import { BradbitDiffView } from "./editor/diff";
import { renderMarkdownPreview } from "./editor/preview";
import { t } from "./i18n";
import {
  AppSettings,
  FileTreeNode,
  FsChangeEvent,
  GitBranch,
  GitCommit,
  GitCommitFile,
  GitStatus,
  MenuCommand,
  MenuUiState,
  OpenedFolder,
  OpenTab,
  RecentProject,
  SearchMatch,
  TemplateInfo,
} from "./types";
import { copyTextToClipboard } from "./workspace/clipboard";
import { createDocumentHeader } from "./workspace/documentHeader";
import { badgeClass, buildGitBadgeMap } from "./git/status";
import {
  defaultVersionMessage,
  isValidBranchName,
  isValidGitAuthor,
} from "./git/versions";
import { createVersionsPanel } from "./workspace/versionsPanel";
import { MenuSyncQueue } from "./workspace/menuSync";
import { extractOutline, OutlineItem } from "./workspace/outline";
import {
  defaultProjectDestination,
  projectPathPreview,
  validateProjectDraft,
  ProjectDraftError,
} from "./workspace/projectCreation";
import { flattenFileTree } from "./workspace/quickOpen";
import { isTabAffected, reconcileTabsWithDisk } from "./workspace/reconcile";
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
  setTabViewMode,
  TabListState,
  toggleTabViewMode,
  updateTabContent,
} from "./workspace/state";

type ModalState =
  | { kind: "none" }
  | { kind: "settings"; error?: string }
  | { kind: "quick-open" }
  | { kind: "global-search" }
  | {
      kind: "new-project";
      templates: TemplateInfo[];
      selectedTemplateId: string;
      name: string;
      destination: string;
      error?: string;
      submitting?: boolean;
    }
  | { kind: "save-template"; name: string; error?: string; saving?: boolean }
  | { kind: "entry-input"; mode: "new-file" | "new-folder" | "rename"; targetPath: string; value: string; error?: string }
  | { kind: "branch-input"; value: string; error?: string }
  | { kind: "confirm-delete"; targetPath: string; error?: string }
  | { kind: "confirm-discard"; path: string; name: string; error?: string }
  | {
      kind: "confirm-restore-version";
      commitId: string;
      commitSubject: string;
      path: string;
      error?: string;
    }
  | { kind: "confirm-unsaved"; tabPath: string; tabName: string };

/** Shortcuts owned by the native menu when running inside Tauri. */
const NATIVE_MENU_KEYS = new Set(["b", "i", "s", "o", "n", "w", ",", "f"]);

function isNativeMenuShortcut(key: string, _shift: boolean, alt: boolean): boolean {
  if (key === "e") return true;
  if (key === "p") return true;
  if (key === "g" && alt) return true;
  return NATIVE_MENU_KEYS.has(key);
}

class BradbitApp {
  private settings: AppSettings = { ...DEFAULT_SETTINGS };
  private folder: OpenedFolder | null = null;
  private recents: RecentProject[] = [];
  private tabState: TabListState = { tabs: [], activeTabPath: null };
  private collapsedDirs = new Set<string>();
  private sidebarVisible = true;
  private sidebarTab: "files" | "outline" | "versions" = "files";
  private sidebarWidth = 260;
  private outlineRefreshTimer: number | null = null;
  private modal: ModalState = { kind: "none" };
  private statusNotice = "";
  private gitStatus: GitStatus | null = null;
  private gitHistory: GitCommit[] = [];
  private gitBranches: GitBranch[] = [];
  private gitCommitMessage = "";
  private gitExpandedCommitId: string | null = null;
  private gitCommitFiles: Record<string, GitCommitFile[] | undefined> = {};
  private gitBusy = false;
  private gitHistoryLoading = false;
  private gitPanelError = "";
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
  private diffHostEl: HTMLElement | null = null;
  private diffView: BradbitDiffView | null = null;
  private diffViewKey: string | null = null;
  private diffData: { path: string; original: string; isNew: boolean } | null = null;
  private diffLoadingPath: string | null = null;
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
    try {
      await backend.listenFsChanges((event) => {
        void this.handleFsChange(event);
      });
    } catch (err) {
      console.error("No se pudo escuchar los cambios de archivos", err);
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
      this.gitHistory = [];
      this.gitBranches = [];
      this.gitCommitMessage = "";
      this.gitExpandedCommitId = null;
      this.gitCommitFiles = {};
      this.gitPanelError = "";
      this.editor?.destroy();
      this.editor = null;
      this.recents = await backend.listRecentProjects();
      try {
        await backend.startWatching(opened.rootPath);
      } catch (err) {
        console.error("No se pudo iniciar el watcher", err);
        this.statusNotice = err instanceof Error ? err.message : String(err);
      }
      await this.refreshGitStatus();
      await this.refreshGitMeta();
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
    await this.refreshGitStatus();
  }

  private async refreshGitStatus(): Promise<void> {
    if (!this.folder || !isTauriEnvironment()) {
      this.gitStatus = null;
      return;
    }
    try {
      this.gitStatus = await backend.gitStatus(this.folder.rootPath);
    } catch (err) {
      console.error("No se pudo leer el estado de Git", err);
      this.gitStatus = null;
    }
  }

  private async refreshGitMeta(): Promise<void> {
    if (
      !this.folder ||
      !isTauriEnvironment() ||
      !this.gitStatus?.isRepository
    ) {
      this.gitHistory = [];
      this.gitBranches = [];
      this.gitHistoryLoading = false;
      return;
    }
    const root = this.folder.rootPath;
    this.gitHistoryLoading = true;
    try {
      const [branches, history] = await Promise.all([
        backend.gitBranches(root),
        backend.gitHistory(root, 30),
      ]);
      if (!this.folder || this.folder.rootPath !== root) return;
      const currentBranch = this.gitStatus?.branch ?? null;
      this.gitBranches =
        branches.length === 0 && currentBranch
          ? [{ name: currentBranch, id: "", current: true }]
          : branches;
      this.gitHistory = history;
      this.gitPanelError = "";
    } catch (err) {
      this.gitPanelError = err instanceof Error ? err.message : String(err);
    } finally {
      this.gitHistoryLoading = false;
    }
  }

  private async refreshGitPanelData(): Promise<void> {
    if (!this.folder) return;
    await this.refreshGitStatus();
    await this.refreshGitMeta();
    this.render();
  }

  private openVersionsPanel(): void {
    this.sidebarVisible = true;
    this.sidebarTab = "versions";
    this.render();
    void this.refreshGitPanelData();
  }

  private async enableVersionHistory(): Promise<void> {
    if (!this.folder || this.gitBusy) return;
    this.gitBusy = true;
    this.gitPanelError = "";
    try {
      this.gitStatus = await backend.gitInit(this.folder.rootPath);
      this.statusNotice = t(this.settings.language, "versionsEnabled");
      await this.refreshTree();
      await this.refreshGitMeta();
    } catch (err) {
      this.gitPanelError = err instanceof Error ? err.message : String(err);
    } finally {
      this.gitBusy = false;
      this.render();
    }
  }

  private async saveVersion(): Promise<void> {
    if (!this.folder || this.gitBusy) return;
    const name = this.settings.gitAuthorName.trim();
    const email = this.settings.gitAuthorEmail.trim();
    if (!isValidGitAuthor(name, email)) {
      this.modal = { kind: "settings" };
      this.statusNotice = t(this.settings.language, "versionsAuthorMissing");
      this.render();
      return;
    }

    const message =
      this.gitCommitMessage.trim() ||
      defaultVersionMessage(this.settings.language);
    this.gitBusy = true;
    this.gitPanelError = "";
    try {
      this.gitStatus = await backend.gitSaveVersion(
        this.folder.rootPath,
        message,
        name,
        email,
      );
      this.gitCommitMessage = "";
      this.gitExpandedCommitId = null;
      await this.refreshTree();
      await this.refreshGitMeta();
      this.statusNotice = t(this.settings.language, "versionsSaved");
    } catch (err) {
      this.gitPanelError = err instanceof Error ? err.message : String(err);
    } finally {
      this.gitBusy = false;
      this.render();
    }
  }

  private async toggleCommit(commitId: string): Promise<void> {
    if (this.gitExpandedCommitId === commitId) {
      this.gitExpandedCommitId = null;
      this.render();
      return;
    }
    this.gitExpandedCommitId = commitId;
    this.render();
    if (this.gitCommitFiles[commitId] || !this.folder) return;

    const root = this.folder.rootPath;
    try {
      const files = await backend.gitCommitFiles(root, commitId);
      if (!this.folder || this.folder.rootPath !== root) return;
      this.gitCommitFiles = { ...this.gitCommitFiles, [commitId]: files };
    } catch (err) {
      this.gitPanelError = err instanceof Error ? err.message : String(err);
      this.gitCommitFiles = { ...this.gitCommitFiles, [commitId]: [] };
    }
    this.render();
  }

  private requestRestoreFromCommit(commitId: string, path: string): void {
    const commit = this.gitHistory.find((item) => item.id === commitId);
    this.modal = {
      kind: "confirm-restore-version",
      commitId,
      commitSubject: commit?.subject ?? commitId.slice(0, 7),
      path,
    };
    this.render();
  }

  private async restoreFromCommit(): Promise<void> {
    const modal = this.modal;
    if (modal.kind !== "confirm-restore-version" || !this.folder) return;
    this.gitPanelError = "";
    try {
      this.gitStatus = await backend.gitRestoreFromCommit(
        this.folder.rootPath,
        modal.commitId,
        modal.path,
      );
      this.editor?.closeDocumentState(modal.path);
      const tab = this.tabState.tabs.find((item) => item.path === modal.path);
      if (tab) {
        const content = await backend.readTextFile(
          this.folder.rootPath,
          modal.path,
        );
        this.tabState = updateTabContent(this.tabState, modal.path, content);
        this.tabState = markTabSaved(this.tabState, modal.path);
        this.tabState = setTabViewMode(this.tabState, modal.path, "edit");
      }
      await this.refreshTree();
      await this.refreshGitMeta();
      this.modal = { kind: "none" };
      if (!tab) {
        await this.openFileFromTree(modal.path, true);
      }
      this.statusNotice = t(this.settings.language, "versionsRestored");
      this.render();
    } catch (err) {
      if (this.modal.kind === "confirm-restore-version") {
        this.modal.error = err instanceof Error ? err.message : String(err);
        this.render();
      }
    }
  }

  private requestNewBranch(): void {
    this.modal = { kind: "branch-input", value: "" };
    this.render();
  }

  private async submitBranchInput(): Promise<void> {
    const modal = this.modal;
    if (modal.kind !== "branch-input" || !this.folder || this.gitBusy) return;
    const name = modal.value.trim();
    if (!isValidBranchName(name)) {
      this.modal = {
        ...modal,
        error: t(this.settings.language, "versionsBranchNameInvalid"),
      };
      this.render();
      return;
    }

    this.gitBusy = true;
    this.gitPanelError = "";
    try {
      this.gitStatus = await backend.gitCreateBranch(
        this.folder.rootPath,
        name,
      );
      await this.refreshAfterGitOperation();
      this.gitCommitMessage = "";
      this.gitExpandedCommitId = null;
      this.modal = { kind: "none" };
      this.statusNotice = t(this.settings.language, "versionsBranchCreated", {
        name,
      });
    } catch (err) {
      if (this.modal.kind === "branch-input") {
        this.modal.error = err instanceof Error ? err.message : String(err);
      }
    } finally {
      this.gitBusy = false;
      this.render();
    }
  }

  private async checkoutBranch(name: string): Promise<void> {
    if (!this.folder || this.gitBusy || name === this.gitStatus?.branch) return;
    this.gitBusy = true;
    this.gitPanelError = "";
    try {
      this.gitStatus = await backend.gitCheckoutBranch(
        this.folder.rootPath,
        name,
      );
      await this.refreshAfterGitOperation();
      this.gitCommitMessage = "";
      this.gitExpandedCommitId = null;
      this.statusNotice = t(this.settings.language, "versionsBranchSwitched", {
        name,
      });
    } catch (err) {
      this.gitPanelError = err instanceof Error ? err.message : String(err);
    } finally {
      this.gitBusy = false;
      this.render();
    }
  }

  private async refreshAfterGitOperation(): Promise<void> {
    await this.refreshTree();
    await this.refreshGitMeta();
    await this.reloadOpenTabsFromDisk();
  }

  private async reloadOpenTabsFromDisk(): Promise<void> {
    if (!this.folder) return;
    const root = this.folder.rootPath;
    const paths = this.tabState.tabs.map((tab) => tab.path);
    if (paths.length === 0) return;
    const diskContents = new Map<string, string | null>();
    for (const path of paths) {
      try {
        diskContents.set(path, await backend.readTextFile(root, path));
      } catch {
        diskContents.set(path, null);
      }
    }
    if (!this.folder || this.folder.rootPath !== root) return;
    const result = reconcileTabsWithDisk(this.tabState, paths, diskContents);
    for (const path of [...result.closed, ...result.reloaded]) {
      this.editor?.closeDocumentState(path);
    }
    this.tabState = result.state;
  }

  private async saveGitAuthor(name: string, email: string): Promise<void> {
    if (!isValidGitAuthor(name, email)) {
      if (this.modal.kind === "settings") {
        this.modal.error = t(this.settings.language, "gitAuthorInvalid");
      }
      this.render();
      return;
    }
    this.statusNotice = t(this.settings.language, "gitAuthorSaved");
    if (this.modal.kind === "settings") {
      this.modal = { kind: "settings" };
    }
    await this.updateSettings({
      gitAuthorName: name.trim(),
      gitAuthorEmail: email.trim(),
    });
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
      await this.refreshGitStatus();
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
    if (this.modal.kind === "settings" && this.modal.error) {
      this.modal = { kind: "settings" };
    }
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

  private toggleDiff(): void {
    const active = this.getActiveTab();
    if (!active || !this.folder) return;

    const entering = active.viewMode !== "diff";
    this.tabState = setTabViewMode(
      this.tabState,
      active.path,
      entering ? "diff" : "edit",
    );
    if (!entering) {
      this.diffData = null;
      this.destroyDiffView();
    }
    this.render();
  }

  private destroyDiffView(): void {
    this.diffView?.destroy();
    this.diffView = null;
    this.diffViewKey = null;
  }

  private syncDiffView(activeTab: OpenTab | null): void {
    if (!activeTab || activeTab.viewMode !== "diff") {
      this.destroyDiffView();
      this.diffData = null;
      return;
    }
    if (!this.diffHostEl) return;

    const data = this.diffData;
    if (!data || data.path !== activeTab.path) {
      void this.loadDiffData(activeTab);
      return;
    }

    const key = `${activeTab.path}\u0000${data.original}\u0000${activeTab.content}`;
    if (this.diffView && this.diffViewKey === key) return;

    this.destroyDiffView();
    this.diffView = new BradbitDiffView(this.diffHostEl);
    this.diffViewKey = key;
    this.diffView.open(data.original, activeTab.content, this.settings);
  }

  private async loadDiffData(tab: OpenTab): Promise<void> {
    if (!this.folder || this.diffLoadingPath === tab.path) return;
    this.diffLoadingPath = tab.path;
    try {
      const original = await backend.gitHeadFile(this.folder.rootPath, tab.path);
      if (this.getActiveTab()?.path !== tab.path) return;
      this.diffData = {
        path: tab.path,
        original: original ?? "",
        isNew: original === null,
      };
      this.render();
    } catch (err) {
      console.error("No se pudo cargar la versión guardada", err);
      this.tabState = setTabViewMode(this.tabState, tab.path, "edit");
      this.render();
    } finally {
      this.diffLoadingPath = null;
    }
  }

  private requestDiscard(): void {
    const active = this.getActiveTab();
    if (!active || !this.folder) return;
    this.requestDiscardPath(active.path);
  }

  private async discardChanges(): Promise<void> {
    const modal = this.modal;
    if (modal.kind !== "confirm-discard" || !this.folder) return;
    try {
      const result = await backend.gitDiscardFile(this.folder.rootPath, modal.path);
      this.gitStatus = result.status;
      this.editor?.closeDocumentState(modal.path);
      this.destroyDiffView();
      this.diffData = null;

      if (result.deleted) {
        this.tabState = closeTabInState(this.tabState, modal.path);
        await this.refreshTree();
      } else {
        const content = await backend.readTextFile(this.folder.rootPath, modal.path);
        this.tabState = updateTabContent(this.tabState, modal.path, content);
        this.tabState = markTabSaved(this.tabState, modal.path);
        this.tabState = setTabViewMode(this.tabState, modal.path, "edit");
      }

      this.modal = { kind: "none" };
      this.render();
      this.showStatusNotice(t(this.settings.language, "changesDiscarded"));
    } catch (err) {
      if (this.modal.kind === "confirm-discard") {
        this.modal.error = err instanceof Error ? err.message : String(err);
        this.render();
      }
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

  private async handleFsChange(event: FsChangeEvent): Promise<void> {
    if (!this.folder || event.paths.length === 0) return;
    const root = this.folder.rootPath;
    const affected = this.tabState.tabs.filter((tab) =>
      isTabAffected(tab.path, event.paths),
    );
    const diskContents = new Map<string, string | null>();
    for (const tab of affected) {
      try {
        diskContents.set(tab.path, await backend.readTextFile(root, tab.path));
      } catch {
        diskContents.set(tab.path, null);
      }
    }
    if (!this.folder || this.folder.rootPath !== root) return;

    try {
      await this.refreshTree();
    } catch (err) {
      console.error("No se pudo actualizar el árbol de archivos", err);
    }

    const result = reconcileTabsWithDisk(this.tabState, event.paths, diskContents);
    for (const path of [...result.closed, ...result.reloaded]) {
      this.editor?.closeDocumentState(path);
    }
    this.tabState = result.state;

    if (result.conflicts.length > 0) {
      this.statusNotice = t(this.settings.language, "fileChangedExternal", {
        name: this.fileName(result.conflicts[0]),
      });
    } else if (result.deletedConflicts.length > 0) {
      this.statusNotice = t(this.settings.language, "fileDeletedExternal", {
        name: this.fileName(result.deletedConflicts[0]),
      });
    }
    this.render();
  }

  private fileName(path: string): string {
    return path.split("/").pop() ?? path;
  }

  private async openNewProjectModal(): Promise<void> {
    if (!isTauriEnvironment()) return;
    try {
      const templates = await backend.listTemplates();
      this.modal = {
        kind: "new-project",
        templates,
        selectedTemplateId: templates[0]?.id ?? "",
        name: "",
        destination: defaultProjectDestination(this.folder?.rootPath ?? null),
      };
      this.render();
    } catch (err) {
      this.showStatusNotice(err instanceof Error ? err.message : String(err));
    }
  }

  private openSaveTemplateModal(): void {
    if (!this.folder || !isTauriEnvironment()) return;
    this.modal = { kind: "save-template", name: this.folder.name };
    this.render();
  }

  private async chooseProjectDestination(): Promise<void> {
    if (this.modal.kind !== "new-project") return;
    try {
      const picked = await backend.pickFolderDialog();
      if (picked && this.modal.kind === "new-project") {
        this.modal.destination = picked;
        this.render();
      }
    } catch (err) {
      this.showStatusNotice(err instanceof Error ? err.message : String(err));
    }
  }

  private async submitNewProject(): Promise<void> {
    const modal = this.modal;
    if (modal.kind !== "new-project") return;
    const validation = validateProjectDraft({
      templateId: modal.selectedTemplateId,
      name: modal.name,
      destination: modal.destination,
    });
    if (validation) {
      modal.error = t(this.settings.language, this.projectErrorKey(validation));
      this.render();
      return;
    }

    modal.submitting = true;
    this.render();
    try {
      const created = await backend.createProjectFromTemplate(
        modal.selectedTemplateId,
        modal.name.trim(),
        modal.destination.trim(),
      );
      this.modal = { kind: "none" };
      await this.openFolderByPath(created.path);
      this.showStatusNotice(
        t(
          this.settings.language,
          created.gitInitialized ? "projectCreated" : "projectCreatedNoGit",
        ),
      );
    } catch (err) {
      if (this.modal.kind === "new-project") {
        this.modal.submitting = false;
        this.modal.error = err instanceof Error ? err.message : String(err);
        this.render();
      }
    }
  }

  private async submitSaveTemplate(): Promise<void> {
    const modal = this.modal;
    if (modal.kind !== "save-template" || !this.folder) return;
    const name = modal.name.trim();
    if (!name) {
      modal.error = t(this.settings.language, "projectErrorName");
      this.render();
      return;
    }

    modal.saving = true;
    this.render();
    try {
      await backend.saveCurrentAsTemplate(this.folder.rootPath, name);
      this.modal = { kind: "none" };
      this.render();
      this.showStatusNotice(t(this.settings.language, "templateSaved"));
    } catch (err) {
      if (this.modal.kind === "save-template") {
        this.modal.saving = false;
        this.modal.error = err instanceof Error ? err.message : String(err);
        this.render();
      }
    }
  }

  private async openTemplatesFolder(): Promise<void> {
    if (!isTauriEnvironment()) return;
    try {
      await backend.openTemplatesFolder();
    } catch (err) {
      this.showStatusNotice(err instanceof Error ? err.message : String(err));
    }
  }

  private projectErrorKey(
    error: ProjectDraftError,
  ):
    | "projectErrorTemplate"
    | "projectErrorName"
    | "projectErrorNameInvalid"
    | "projectErrorDestination" {
    switch (error) {
      case "template":
        return "projectErrorTemplate";
      case "name":
        return "projectErrorName";
      case "nameInvalid":
        return "projectErrorNameInvalid";
      case "destination":
        return "projectErrorDestination";
    }
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
      case "file.newProject":
        await this.openNewProjectModal();
        break;
      case "file.saveAsTemplate":
        this.openSaveTemplateModal();
        break;
      case "file.openTemplatesFolder":
        await this.openTemplatesFolder();
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
      case "view.versions":
        this.openVersionsPanel();
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
      } else if (letter === "n" && e.shiftKey) {
        e.preventDefault();
        void this.openNewProjectModal();
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
      } else if (letter === "g" && e.altKey) {
        e.preventDefault();
        this.openVersionsPanel();
      }
    });
  }

  public render(): void {
    const lang = this.settings.language;
    const activeTab = this.getActiveTab();

    // Preserve CodeMirror and diff hosts across renders so typing/focus never drops
    if (!this.cmHostEl) {
      this.cmHostEl = document.createElement("div");
      this.cmHostEl.className = "cm-host";
    }
    if (!this.diffHostEl) {
      this.diffHostEl = document.createElement("div");
      this.diffHostEl.className = "diff-host";
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
      if (activeTab.viewMode !== "diff") {
        this.editor.openDocument(activeTab.path, activeTab.content, this.settings);
      }
    }

    this.syncDiffView(activeTab);

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
        dot.textContent = active.externalChange
          ? "⚠"
          : isTabDirty(active)
            ? "•"
            : "";
        dot.classList.toggle("external", Boolean(active.externalChange));
        dot.title = active.externalChange
          ? t(this.settings.language, "externalChangeBadge")
          : "";
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

    if (isTauriEnvironment()) {
      const newProjectBtn = document.createElement("button");
      newProjectBtn.className = "toolbar-btn";
      newProjectBtn.dataset.testid = "topbar-new-project-btn";
      newProjectBtn.textContent = `＋ ${t(lang, "projectShort")}`;
      newProjectBtn.title = `${t(lang, "newProjectButton")} (⇧⌘N)`;
      newProjectBtn.onclick = () => void this.openNewProjectModal();
      right.appendChild(newProjectBtn);
    }

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
        void backend.stopWatching().catch((err) => {
          console.error("No se pudo detener el watcher", err);
        });
        this.folder = null;
        this.tabState = { tabs: [], activeTabPath: null };
        this.gitStatus = null;
        this.gitHistory = [];
        this.gitBranches = [];
        this.gitCommitMessage = "";
        this.gitExpandedCommitId = null;
        this.gitCommitFiles = {};
        this.gitPanelError = "";
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

    actions.append(openBtn);
    if (isTauriEnvironment()) {
      const newProjectBtn = document.createElement("button");
      newProjectBtn.className = "toolbar-btn";
      newProjectBtn.dataset.testid = "welcome-new-project-btn";
      newProjectBtn.textContent = t(lang, "newProjectButton");
      newProjectBtn.onclick = () => void this.openNewProjectModal();
      actions.appendChild(newProjectBtn);
    }
    actions.appendChild(demoBtn);

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
    const titles = {
      files: "explorerTitle",
      outline: "outlineTitle",
      versions: "versionsTitle",
    } as const;
    title.textContent = t(lang, titles[this.sidebarTab]);

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
    } else if (this.sidebarTab === "outline") {
      aside.appendChild(this.renderOutline(lang));
    } else {
      aside.appendChild(this.renderVersions(lang));
    }
    return aside;
  }

  private renderSidebarTabs(lang: AppSettings["language"]): HTMLElement {
    const tabs = document.createElement("div");
    tabs.className = "sidebar-tabs";

    const makeTab = (
      label: string,
      tab: "files" | "outline" | "versions",
    ): HTMLButtonElement => {
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
        if (tab === "versions") {
          void this.refreshGitPanelData();
        }
      };
      return button;
    };

    tabs.append(
      makeTab(t(lang, "filesTab"), "files"),
      makeTab(t(lang, "outlineTab"), "outline"),
      makeTab(t(lang, "versionsTab"), "versions"),
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
    const gitBadges = buildGitBadgeMap(this.gitStatus?.entries ?? []);

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

        const badge = gitBadges.get(node.path);
        if (badge) {
          const badgeEl = document.createElement("span");
          badgeEl.className = `tree-git-badge git-badge-${badgeClass(badge)}`;
          badgeEl.textContent = badge;
          label.appendChild(badgeEl);
        }

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

  private renderVersions(lang: AppSettings["language"]): HTMLElement {
    return createVersionsPanel(
      {
        language: lang,
        isRepository: Boolean(this.gitStatus?.isRepository),
        branch: this.gitStatus?.branch ?? null,
        entries: this.gitStatus?.entries ?? [],
        history: this.gitHistory,
        branches: this.gitBranches,
        commitMessage: this.gitCommitMessage,
        authorReady: isValidGitAuthor(
          this.settings.gitAuthorName,
          this.settings.gitAuthorEmail,
        ),
        busy: this.gitBusy,
        historyLoading: this.gitHistoryLoading,
        expandedCommitId: this.gitExpandedCommitId,
        commitFiles: this.gitCommitFiles,
        error: this.gitPanelError,
      },
      {
        onInit: () => void this.enableVersionHistory(),
        onCommitMessageChange: (value) => {
          this.gitCommitMessage = value;
        },
        onSaveVersion: () => void this.saveVersion(),
        onOpenChange: (path) => void this.openChangeDiff(path),
        onDiscardChange: (path) => this.requestDiscardPath(path),
        onToggleCommit: (id) => void this.toggleCommit(id),
        onRestoreFile: (commitId, path) =>
          this.requestRestoreFromCommit(commitId, path),
        onCreateBranch: () => this.requestNewBranch(),
        onCheckoutBranch: (name) => void this.checkoutBranch(name),
        onOpenSettings: () => {
          this.modal = { kind: "settings" };
          this.render();
        },
      },
    );
  }

  private async openChangeDiff(path: string): Promise<void> {
    await this.openFileFromTree(path, true);
    const active = this.getActiveTab();
    if (!active || active.path !== path || active.viewMode === "diff") return;
    this.toggleDiff();
  }

  private requestDiscardPath(path: string): void {
    this.modal = {
      kind: "confirm-discard",
      path,
      name: this.fileName(path),
    };
    this.render();
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
      const gitBadges = buildGitBadgeMap(this.gitStatus?.entries ?? []);

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

        const gitBadge = gitBadges.get(tab.path);
        let badgeEl: HTMLSpanElement | null = null;
        if (gitBadge) {
          badgeEl = document.createElement("span");
          badgeEl.className = `tab-git-badge git-badge-${badgeClass(gitBadge)}`;
          badgeEl.textContent = gitBadge;
        }

        const dirtyDot = document.createElement("span");
        dirtyDot.className = "tab-dirty-dot";
        dirtyDot.textContent = tab.externalChange
          ? "⚠"
          : isTabDirty(tab)
            ? "•"
            : "";
        dirtyDot.classList.toggle("external", Boolean(tab.externalChange));
        dirtyDot.title = tab.externalChange
          ? t(lang, "externalChangeBadge")
          : "";

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

        tabEl.appendChild(title);
        if (badgeEl) {
          tabEl.appendChild(badgeEl);
        }
        tabEl.append(dirtyDot, closeBtn);
        tabsBar.appendChild(tabEl);
      }

      col.appendChild(tabsBar);
    }

    const gitEntry = activeTab
      ? this.gitStatus?.entries.find((entry) => entry.path === activeTab.path)
      : undefined;
    const tabDirty = activeTab ? isTabDirty(activeTab) : false;
    const canDiff = Boolean(
      activeTab &&
        this.gitStatus?.isRepository &&
        (gitEntry || tabDirty || activeTab.viewMode === "diff"),
    );
    const canDiscard = Boolean(activeTab && (gitEntry || tabDirty));

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
          canDiff,
          diffActive: activeTab.viewMode === "diff",
          onToggleDiff: () => void this.toggleDiff(),
          canDiscard,
          onDiscard: () => this.requestDiscard(),
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
    } else if (activeTab && activeTab.viewMode === "diff") {
      const wrapper = document.createElement("div");
      wrapper.className = "diff-wrapper";

      const banner = document.createElement("div");
      banner.className = "diff-banner";
      const ready = this.diffData?.path === activeTab.path;
      if (!ready) {
        banner.textContent = t(lang, "diffLoading");
      } else if (this.diffData?.isNew) {
        banner.textContent = t(lang, "diffNewFile");
        banner.classList.add("new-file");
      } else {
        banner.textContent = t(lang, "diffWithHead");
      }
      wrapper.appendChild(banner);

      if (ready && this.diffHostEl) {
        wrapper.appendChild(this.diffHostEl);
      } else {
        const loading = document.createElement("div");
        loading.className = "diff-loading";
        loading.textContent = t(lang, "diffLoading");
        wrapper.appendChild(loading);
      }

      surface.appendChild(wrapper);
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

    if (this.gitStatus?.isRepository) {
      const branchSpan = document.createElement("span");
      branchSpan.className = "git-branch";
      const ahead = this.gitStatus.ahead > 0 ? ` ↑${this.gitStatus.ahead}` : "";
      const behind = this.gitStatus.behind > 0 ? ` ↓${this.gitStatus.behind}` : "";
      branchSpan.textContent = `⑂ ${this.gitStatus.branch ?? t(lang, "gitNoBranch")}${ahead}${behind}`;
      left.appendChild(branchSpan);
    }

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

  private renderNewProjectModal(
    dialog: HTMLElement,
    lang: AppSettings["language"],
  ): void {
    const modal = this.modal;
    if (modal.kind !== "new-project") return;
    dialog.classList.add("new-project-dialog");

    const h3 = document.createElement("h3");
    h3.textContent = t(lang, "newProjectTitle");

    const templateField = document.createElement("div");
    templateField.className = "form-row";
    const templateLabel = document.createElement("label");
    templateLabel.className = "form-label";
    templateLabel.textContent = t(lang, "templateLabel");
    const templateSelect = document.createElement("select");
    templateSelect.className = "select-input";
    templateSelect.dataset.testid = "new-project-template";
    for (const template of modal.templates) {
      const option = document.createElement("option");
      option.value = template.id;
      option.textContent = template.name;
      templateSelect.appendChild(option);
    }
    if (modal.selectedTemplateId) {
      templateSelect.value = modal.selectedTemplateId;
    }
    templateSelect.disabled = modal.templates.length === 0;

    const templateDescription = document.createElement("p");
    templateDescription.className = "template-description";
    const updateDescription = () => {
      if (this.modal.kind !== "new-project") return;
      const selected = this.modal.templates.find(
        (template) => template.id === templateSelect.value,
      );
      templateDescription.textContent =
        selected?.description ?? t(lang, "noTemplates");
    };
    updateDescription();
    templateSelect.onchange = () => {
      if (this.modal.kind !== "new-project") return;
      this.modal.selectedTemplateId = templateSelect.value;
      updateDescription();
    };
    templateField.append(templateLabel, templateSelect, templateDescription);

    const nameField = document.createElement("div");
    nameField.className = "form-row";
    const nameLabel = document.createElement("label");
    nameLabel.className = "form-label";
    nameLabel.textContent = t(lang, "projectNameLabel");
    const nameInput = document.createElement("input");
    nameInput.className = "text-input";
    nameInput.dataset.testid = "new-project-name";
    nameInput.value = modal.name;
    nameInput.placeholder = t(lang, "projectNamePlaceholder");

    const destinationField = document.createElement("div");
    destinationField.className = "form-row";
    const destinationLabel = document.createElement("label");
    destinationLabel.className = "form-label";
    destinationLabel.textContent = t(lang, "projectDestinationLabel");
    const destinationRow = document.createElement("div");
    destinationRow.className = "destination-row";
    const destinationInput = document.createElement("input");
    destinationInput.className = "text-input";
    destinationInput.dataset.testid = "new-project-destination";
    destinationInput.value = modal.destination;
    destinationInput.placeholder = t(lang, "projectDestinationPlaceholder");
    const chooseButton = document.createElement("button");
    chooseButton.className = "toolbar-btn";
    chooseButton.textContent = t(lang, "chooseFolder");
    chooseButton.onclick = () => void this.chooseProjectDestination();
    destinationRow.append(destinationInput, chooseButton);
    destinationField.append(destinationLabel, destinationRow);

    const preview = document.createElement("div");
    preview.className = "project-path-preview";
    const updatePreview = () => {
      if (this.modal.kind !== "new-project") return;
      const path = projectPathPreview(this.modal.destination, this.modal.name);
      preview.textContent = path
        ? `${t(lang, "projectWillBeCreatedAt")} ${path}`
        : "";
    };
    updatePreview();

    nameInput.oninput = () => {
      if (this.modal.kind !== "new-project") return;
      this.modal.name = nameInput.value;
      updatePreview();
    };
    destinationInput.oninput = () => {
      if (this.modal.kind !== "new-project") return;
      this.modal.destination = destinationInput.value;
      updatePreview();
    };
    nameField.append(nameLabel, nameInput);

    const footer = document.createElement("div");
    footer.className = "modal-footer new-project-footer";
    const left = document.createElement("div");
    left.className = "modal-footer-left";
    const templatesButton = document.createElement("button");
    templatesButton.className = "toolbar-btn";
    templatesButton.textContent = t(lang, "openTemplatesFolder");
    templatesButton.onclick = () => void this.openTemplatesFolder();
    left.appendChild(templatesButton);
    if (this.folder) {
      const saveButton = document.createElement("button");
      saveButton.className = "toolbar-btn";
      saveButton.textContent = t(lang, "saveAsTemplate");
      saveButton.onclick = () => this.openSaveTemplateModal();
      left.appendChild(saveButton);
    }

    const right = document.createElement("div");
    right.className = "modal-footer-right";
    const cancelButton = document.createElement("button");
    cancelButton.className = "toolbar-btn";
    cancelButton.textContent = t(lang, "cancel");
    cancelButton.onclick = () => this.closeModal();
    const createButton = document.createElement("button");
    createButton.className = "toolbar-btn primary";
    createButton.dataset.testid = "new-project-create";
    createButton.disabled = Boolean(modal.submitting) || modal.templates.length === 0;
    createButton.textContent = modal.submitting
      ? t(lang, "creatingProject")
      : t(lang, "createProject");
    createButton.onclick = () => void this.submitNewProject();
    right.append(cancelButton, createButton);
    footer.append(left, right);

    dialog.append(h3, templateField, nameField, destinationField, preview);
    if (modal.error) {
      const error = document.createElement("div");
      error.className = "error-banner";
      error.textContent = modal.error;
      dialog.appendChild(error);
    }
    dialog.appendChild(footer);
    window.setTimeout(() => nameInput.focus(), 10);
  }

  private renderSaveTemplateModal(
    dialog: HTMLElement,
    lang: AppSettings["language"],
  ): void {
    const modal = this.modal;
    if (modal.kind !== "save-template") return;
    dialog.classList.add("save-template-dialog");

    const h3 = document.createElement("h3");
    h3.textContent = t(lang, "saveAsTemplateTitle");
    const hint = document.createElement("p");
    hint.textContent = t(lang, "saveTemplateHint", {
      name: this.folder?.name ?? "",
    });

    const field = document.createElement("div");
    field.className = "form-row";
    const label = document.createElement("label");
    label.className = "form-label";
    label.textContent = t(lang, "templateNameLabel");
    const input = document.createElement("input");
    input.className = "text-input";
    input.dataset.testid = "save-template-name";
    input.value = modal.name;
    input.oninput = () => {
      if (this.modal.kind === "save-template") {
        this.modal.name = input.value;
      }
    };
    input.onkeydown = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void this.submitSaveTemplate();
      }
    };
    field.append(label, input);

    const footer = document.createElement("div");
    footer.className = "modal-footer save-template-footer";
    const left = document.createElement("div");
    left.className = "modal-footer-left";
    const templatesButton = document.createElement("button");
    templatesButton.className = "toolbar-btn";
    templatesButton.textContent = t(lang, "openTemplatesFolder");
    templatesButton.onclick = () => void this.openTemplatesFolder();
    left.appendChild(templatesButton);

    const right = document.createElement("div");
    right.className = "modal-footer-right";
    const cancelButton = document.createElement("button");
    cancelButton.className = "toolbar-btn";
    cancelButton.textContent = t(lang, "cancel");
    cancelButton.onclick = () => this.closeModal();
    const saveButton = document.createElement("button");
    saveButton.className = "toolbar-btn primary";
    saveButton.dataset.testid = "save-template-submit";
    saveButton.disabled = Boolean(modal.saving);
    saveButton.textContent = modal.saving
      ? t(lang, "savingTemplate")
      : t(lang, "saveTemplateAction");
    saveButton.onclick = () => void this.submitSaveTemplate();
    right.append(cancelButton, saveButton);
    footer.append(left, right);

    dialog.append(h3, hint, field);
    if (modal.error) {
      const error = document.createElement("div");
      error.className = "error-banner";
      error.textContent = modal.error;
      dialog.appendChild(error);
    }
    dialog.appendChild(footer);
    window.setTimeout(() => input.focus(), 10);
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

      const authorSection = document.createElement("div");
      authorSection.className = "settings-author";
      const authorTitle = document.createElement("div");
      authorTitle.className = "settings-section-title";
      authorTitle.textContent = t(lang, "gitAuthorSection");
      const authorHint = document.createElement("p");
      authorHint.className = "settings-hint";
      authorHint.textContent = t(lang, "gitAuthorHint");

      const authorNameRow = document.createElement("div");
      authorNameRow.className = "form-row";
      const authorNameLabel = document.createElement("label");
      authorNameLabel.className = "form-label";
      authorNameLabel.textContent = t(lang, "gitAuthorName");
      const authorNameInput = document.createElement("input");
      authorNameInput.className = "text-input";
      authorNameInput.dataset.testid = "git-author-name";
      authorNameInput.value = this.settings.gitAuthorName;
      authorNameInput.placeholder = "Ada Lovelace";
      authorNameRow.append(authorNameLabel, authorNameInput);

      const authorEmailRow = document.createElement("div");
      authorEmailRow.className = "form-row";
      const authorEmailLabel = document.createElement("label");
      authorEmailLabel.className = "form-label";
      authorEmailLabel.textContent = t(lang, "gitAuthorEmail");
      const authorEmailInput = document.createElement("input");
      authorEmailInput.className = "text-input";
      authorEmailInput.dataset.testid = "git-author-email";
      authorEmailInput.type = "email";
      authorEmailInput.value = this.settings.gitAuthorEmail;
      authorEmailInput.placeholder = "ada@example.com";
      authorEmailRow.append(authorEmailLabel, authorEmailInput);

      const authorSave = document.createElement("button");
      authorSave.className = "toolbar-btn";
      authorSave.dataset.testid = "save-git-author";
      authorSave.textContent = t(lang, "save");
      authorSave.onclick = () =>
        void this.saveGitAuthor(authorNameInput.value, authorEmailInput.value);

      authorSection.append(
        authorTitle,
        authorHint,
        authorNameRow,
        authorEmailRow,
        authorSave,
      );

      if (this.modal.error) {
        const errEl = document.createElement("div");
        errEl.className = "error-banner";
        errEl.textContent = this.modal.error;
        dialog.appendChild(errEl);
      }

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

      dialog.append(
        langRow,
        themeRow,
        fontRow,
        wrapRow,
        lnRow,
        cfgRow,
        authorSection,
        footer,
      );
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
    } else if (this.modal.kind === "new-project") {
      this.renderNewProjectModal(dialog, lang);
    } else if (this.modal.kind === "save-template") {
      this.renderSaveTemplateModal(dialog, lang);
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
    } else if (this.modal.kind === "confirm-discard") {
      const { path, name } = this.modal;
      const h3 = document.createElement("h3");
      h3.textContent = t(lang, "discardChangesTitle");
      const p = document.createElement("p");
      p.textContent = t(lang, "discardChangesPrompt", { name });
      const pathEl = document.createElement("p");
      pathEl.className = "modal-hint";
      pathEl.textContent = path;
      dialog.append(h3, p, pathEl);

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

      const discardBtn = document.createElement("button");
      discardBtn.className = "toolbar-btn danger";
      discardBtn.dataset.testid = "confirm-discard-btn";
      discardBtn.textContent = t(lang, "discardChanges");
      discardBtn.onclick = () => void this.discardChanges();

      footer.append(cancelBtn, discardBtn);
      dialog.appendChild(footer);
      setTimeout(() => cancelBtn.focus(), 10);
    } else if (this.modal.kind === "branch-input") {
      const modalState = this.modal;
      const h3 = document.createElement("h3");
      h3.textContent = t(lang, "versionsBranchCreateTitle");
      const p = document.createElement("p");
      p.textContent = t(lang, "versionsBranchCreateHint");

      const label = document.createElement("label");
      label.className = "form-label";
      label.textContent = t(lang, "versionsBranchNameLabel");
      const input = document.createElement("input");
      input.className = "text-input";
      input.dataset.testid = "branch-name-input";
      input.value = modalState.value;
      input.placeholder = t(lang, "versionsBranchNamePlaceholder");
      input.oninput = () => {
        if (this.modal.kind === "branch-input") {
          this.modal.value = input.value;
        }
      };
      input.onkeydown = (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void this.submitBranchInput();
        }
      };

      dialog.append(h3, p, label, input);
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

      const createBtn = document.createElement("button");
      createBtn.className = "toolbar-btn primary";
      createBtn.dataset.testid = "branch-submit";
      createBtn.textContent = t(lang, "create");
      createBtn.onclick = () => void this.submitBranchInput();

      footer.append(cancelBtn, createBtn);
      dialog.appendChild(footer);
      setTimeout(() => input.focus(), 10);
    } else if (this.modal.kind === "confirm-restore-version") {
      const { path, commitSubject } = this.modal;
      const h3 = document.createElement("h3");
      h3.textContent = t(lang, "versionsRestoreTitle");
      const p = document.createElement("p");
      p.textContent = t(lang, "versionsRestorePrompt", {
        path,
        subject: commitSubject,
      });
      const pathEl = document.createElement("p");
      pathEl.className = "modal-hint";
      pathEl.textContent = path;
      dialog.append(h3, p, pathEl);

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

      const restoreBtn = document.createElement("button");
      restoreBtn.className = "toolbar-btn danger";
      restoreBtn.dataset.testid = "confirm-restore-btn";
      restoreBtn.textContent = t(lang, "versionsRestore");
      restoreBtn.onclick = () => void this.restoreFromCommit();

      footer.append(cancelBtn, restoreBtn);
      dialog.appendChild(footer);
      setTimeout(() => cancelBtn.focus(), 10);
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
