import { backend, isTauriEnvironment } from "./backend";
import { BradbitCodeMirror } from "./editor/codemirror";
import { BradbitDiffView } from "./editor/diff";
import { renderMarkdownPreview } from "./editor/preview";
import { renderFountainPreview } from "./editor/fountainPreview";
import { t } from "./i18n";
import {
  AppSettings,
  ByokProviderStatus,
  FileTreeNode,
  FsChangeEvent,
  GitBranch,
  GitCommit,
  GitCommitFile,
  GitRemote,
  GitStatus,
  GitHubPullRequest,
  KitCatalog,
  MenuCommand,
  MenuUiState,
  OpenCodeChatMessage,
  OpenCodeEvent,
  OpenCodeForm,
  OpenCodeModel,
  OpenCodePermission,
  OpenedFolder,
  OpenTab,
  ProjectWorkspaceState,
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
import {
  defaultBaseBranch,
  findGitHubRemote,
  FoundGitHubRemote,
  isDefaultBranchName,
  sanitizeRepoName,
  uniqueRemoteName,
} from "./git/github";
import { createVersionsPanel } from "./workspace/versionsPanel";
import { ChatPanel } from "./session/chatPanel";
import {
  appendUserMessage,
  applyOpenCodeEvent,
  chatFailed,
  chatFormAnswered,
  chatFormFailed,
  chatFromHistory,
  chatPermissionFailed,
  chatPermissionReplied,
  chatSendFailed,
  chatStarting,
  chatStopped,
  clearChatError,
  ChatState,
  formsLoaded,
  initialChatState,
  permissionsLoaded,
} from "./session/chatState";
import { addSessionTab, removeSessionTab, SessionTabInfo } from "./session/sessionTabs";
import { projectRelativePath } from "./session/chatPaths";
import { parseSlashCommand } from "./session/composer";
import { matchesKitCommand } from "./kit/localize";
import { GENERAL_COMMANDS, mergeGeneralCommands } from "./kit/generalCommands";
import { SessionView, toggleSessionView } from "./session/sessionView";
import { SettingsPanel } from "./settings/settingsPanel";
import type { SettingsCategoryId } from "./settings/catalog";
import {
  byokProviderFromDraft,
  ByokDraft,
  ByokValidationError,
  validateByokDraft,
} from "./settings/byok";
import { TerminalPanel } from "./terminal/terminalPanel";
import { applyColorTheme, resolveColorMode } from "./theme/palettes";
import { AppMenu } from "./ui/appMenu";
import { createIcon } from "./ui/icons";
import { createIconButton } from "./ui/iconButton";
import { MenuSyncQueue } from "./workspace/menuSync";
import { extractOutline, OutlineItem } from "./workspace/outline";
import {
  defaultProjectDestination,
  projectPathPreview,
  validateProjectDraft,
  ProjectDraftError,
} from "./workspace/projectCreation";
import { flattenFileTree } from "./workspace/quickOpen";
import { SIDEBAR_SECTIONS, SidebarTab } from "./workspace/sidebarSections";
import { computeWorkspaceLayout, WorkspaceLayout } from "./workspace/layout";
import { isTabAffected, reconcileTabsWithDisk } from "./workspace/reconcile";
import { widthFromPointerDrag } from "./workspace/resizing";
import { filterTreeByQuery } from "./workspace/treeFilter";
import {
  ensureMarkdownExtension,
  isUntitledTab,
  markUntitledTabSaved,
  openUntitledInTabs,
  relativePathWithinRoot,
} from "./workspace/untitled";
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
  | { kind: "manage-models"; search: string; fromSettings?: boolean }
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
  | { kind: "entry-input"; mode: "new-folder" | "rename"; targetPath: string; value: string; error?: string }
  | { kind: "branch-input"; value: string; error?: string }
  | {
      kind: "github-publish";
      name: string;
      description: string;
      isPrivate: boolean;
      error?: string;
      submitting?: boolean;
    }
  | {
      kind: "github-pr";
      title: string;
      body: string;
      base: string;
      head: string;
      branches: string[];
      error?: string;
      submitting?: boolean;
    }
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
  private untitledSequence = 0;
  private collapsedDirs = new Set<string>();
  private sidebarVisible = true;
  private sidebarTab: SidebarTab = "files";
  private sidebarWidth = 260;
  private fileFilter = "";
  private kitCatalog: KitCatalog = { agents: [], commands: GENERAL_COMMANDS, skills: [] };
  private chatModels: OpenCodeModel[] = [];
  private sessionView: SessionView = "chat";
  private terminalPanel: TerminalPanel | null = null;
  private appMenu: AppMenu | null = null;
  private outlineRefreshTimer: number | null = null;
  private modal: ModalState = { kind: "none" };
  private settingsCategory: SettingsCategoryId = "general";
  private settingsQuery = "";
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
  private gitRemotes: GitRemote[] = [];
  private githubTokenPresent = false;
  private githubAccount: string | null = null;
  private githubAccountLoaded = false;
  private githubAccountBusy = false;
  private githubAccountError = "";
  private githubTokenDraft = "";
  private githubBusy = false;
  private githubError = "";
  private githubPullRequests: GitHubPullRequest[] = [];
  private githubPrLoading = false;
  private chatState: ChatState = { ...initialChatState };
  private byokStatus: ByokProviderStatus[] = [];
  private byokKeyDrafts: Record<string, string> = {};
  private byokBusyId: string | null = null;
  private byokError = "";
  private chatSessions = new Map<string, ChatState>();
  private chatSessionOrder: string[] = [];
  private activeChatSessionId: string | null = null;
  private workspaceState: ProjectWorkspaceState = {
    openSessionIds: [],
    activeSessionId: null,
    layout: {
      sessionWidth: 430,
      chatVisible: true,
      editorVisible: true,
    },
  };
  private chatPanel: ChatPanel | null = null;
  private chatVisible = true;
  private editorVisible = true;
  private sessionWidth = 430;
  private opencodeUnlisten: (() => void) | null = null;
  private menuQueue = new MenuSyncQueue<MenuUiState>(
    () => this.currentMenuState(),
    (state) => backend.refreshMenu(state),
    (err) => console.error("Could not update the native menu", err),
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
      console.error("Could not connect the native menu", err);
    }
    try {
      await backend.listenFsChanges((event) => {
        void this.handleFsChange(event);
      });
    } catch (err) {
      console.error("Could not listen for file changes", err);
    }
    this.applyThemeAttribute();
    this.render();
  }

  private applyThemeAttribute(): void {
    const effective = resolveColorMode(
      this.settings.theme,
      window.matchMedia("(prefers-color-scheme: light)").matches,
    );
    document.documentElement.setAttribute("data-theme", effective);
    applyColorTheme(this.settings.colorTheme, effective);
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

  private closeFolder(): void {
    if (!this.folder) return;
    void backend.stopWatching().catch((err) => {
      console.error("Could not stop the file watcher", err);
    });
    void this.stopChatSession();
    this.stopTerminalSession();
    this.chatPanel = null;
    this.folder = null;
    this.kitCatalog = { agents: [], commands: GENERAL_COMMANDS, skills: [] };
    this.chatModels = [];
    this.tabState = { tabs: [], activeTabPath: null };
    this.untitledSequence = 0;
    this.fileFilter = "";
    this.gitStatus = null;
    this.gitHistory = [];
    this.gitBranches = [];
    this.gitCommitMessage = "";
    this.gitExpandedCommitId = null;
    this.gitCommitFiles = {};
    this.gitPanelError = "";
    this.gitRemotes = [];
    this.githubPullRequests = [];
    this.githubError = "";
    this.githubPrLoading = false;
    this.githubBusy = false;
    this.editor?.destroy();
    this.editor = null;
    this.render();
  }

  public async openFolderByPath(path: string): Promise<void> {
    try {
      const opened = await backend.openFolder(path, this.settings.showConfigFiles);
      await this.stopChatSession();
      this.stopTerminalSession();
      this.chatPanel = null;
      this.folder = opened;
      this.kitCatalog = { agents: [], commands: GENERAL_COMMANDS, skills: [] };
      try {
        this.workspaceState = await backend.loadWorkspaceState(opened.rootPath);
        this.applyWorkspaceLayout(this.workspaceState.layout);
      } catch (err) {
        console.error("Could not load the workspace state", err);
        this.workspaceState = {
          openSessionIds: [],
          activeSessionId: null,
          layout: {
            sessionWidth: 430,
            chatVisible: true,
            editorVisible: true,
          },
        };
        this.applyWorkspaceLayout(this.workspaceState.layout);
      }
      this.tabState = { tabs: [], activeTabPath: null };
      this.untitledSequence = 0;
      this.collapsedDirs.clear();
      this.fileFilter = "";
      this.gitHistory = [];
      this.gitBranches = [];
      this.gitCommitMessage = "";
      this.gitExpandedCommitId = null;
      this.gitCommitFiles = {};
      this.gitPanelError = "";
      this.gitRemotes = [];
      this.githubPullRequests = [];
      this.githubError = "";
      this.githubPrLoading = false;
      this.githubBusy = false;
      this.editor?.destroy();
      this.editor = null;
      this.recents = await backend.listRecentProjects();
      try {
        await backend.startWatching(opened.rootPath);
      } catch (err) {
        console.error("Could not start the file watcher", err);
        this.statusNotice = err instanceof Error ? err.message : String(err);
      }
      await this.refreshKitCatalog();
      await this.refreshGitStatus();
      await this.refreshGitMeta();
      this.render();
      void this.startChatSession();
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
      console.error("Could not read the Git status", err);
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
      this.gitRemotes = [];
      this.gitHistoryLoading = false;
      return;
    }
    const root = this.folder.rootPath;
    this.gitHistoryLoading = true;
    try {
      const [branches, history, remotes] = await Promise.all([
        backend.gitBranches(root),
        backend.gitHistory(root, 30),
        backend.gitRemotes(root),
      ]);
      if (!this.folder || this.folder.rootPath !== root) return;
      const currentBranch = this.gitStatus?.branch ?? null;
      this.gitBranches =
        branches.length === 0 && currentBranch
          ? [{ name: currentBranch, id: "", current: true }]
          : branches;
      this.gitHistory = history;
      this.gitRemotes = remotes;
      this.gitPanelError = "";
    } catch (err) {
      this.gitPanelError = err instanceof Error ? err.message : String(err);
    } finally {
      this.gitHistoryLoading = false;
    }
  }

  private async refreshGitPanelData(): Promise<void> {
    if (!this.folder) return;
    this.githubError = "";
    await this.refreshGitStatus();
    await this.refreshGitMeta();
    await this.ensureGitHubAccount();
    await this.refreshGitHubPullRequests();
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
      this.statusNotice = t(this.settings.language, "versionsAuthorMissing");
      this.openSettingsModal();
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
    const paths = this.tabState.tabs
      .filter((tab) => !tab.untitled)
      .map((tab) => tab.path);
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

  private openSettingsAt(category: SettingsCategoryId): void {
    this.settingsCategory = category;
    this.openSettingsModal();
  }

  private openSettingsModal(): void {
    this.modal = { kind: "settings" };
    this.settingsQuery = "";
    this.githubTokenDraft = "";
    this.githubAccountError = "";
    this.render();
    void this.ensureGitHubAccount(true).then(() => {
      if (this.modal.kind === "settings") {
        this.render();
      }
    });
    if (isTauriEnvironment()) {
      void this.refreshByokStatus().then(() => {
        if (this.modal.kind === "settings") {
          this.render();
        }
      });
    }
  }

  private async refreshByokStatus(): Promise<void> {
    if (!isTauriEnvironment()) {
      this.byokStatus = [];
      return;
    }
    try {
      this.byokStatus = await backend.byokStatus();
      this.byokError = "";
    } catch (err) {
      this.byokError = err instanceof Error ? err.message : String(err);
    }
  }

  private byokErrorKey(
    error: ByokValidationError,
  ):
    | "settingsByokErrorId"
    | "settingsByokErrorName"
    | "settingsByokErrorBaseUrl"
    | "settingsByokErrorModel"
    | "settingsByokErrorDuplicate" {
    switch (error) {
      case "id":
        return "settingsByokErrorId";
      case "name":
        return "settingsByokErrorName";
      case "baseUrl":
        return "settingsByokErrorBaseUrl";
      case "model":
        return "settingsByokErrorModel";
      case "duplicate":
        return "settingsByokErrorDuplicate";
    }
  }

  private async addByokProvider(draft: ByokDraft): Promise<void> {
    const validation = validateByokDraft(
      draft,
      this.settings.byokProviders.map((provider) => provider.id),
    );
    if (validation) {
      this.byokError = t(this.settings.language, this.byokErrorKey(validation));
      this.render();
      return;
    }
    const provider = byokProviderFromDraft(draft);
    this.byokError = "";
    await this.updateSettings({
      byokProviders: [...this.settings.byokProviders, provider],
    });
    await this.refreshByokStatus();
    this.render();
  }

  private async saveByokKey(providerId: string): Promise<void> {
    if (this.byokBusyId) return;
    const key = (this.byokKeyDrafts[providerId] ?? "").trim();
    if (!key) return;
    this.byokBusyId = providerId;
    this.byokError = "";
    this.render();
    try {
      await backend.byokSetKey(providerId, key);
      delete this.byokKeyDrafts[providerId];
      await this.refreshByokStatus();
      await this.restartChatForByok();
    } catch (err) {
      this.byokError = err instanceof Error ? err.message : String(err);
    } finally {
      this.byokBusyId = null;
      this.render();
    }
  }

  private async disconnectByok(providerId: string): Promise<void> {
    if (this.byokBusyId) return;
    this.byokBusyId = providerId;
    this.byokError = "";
    this.render();
    try {
      await backend.byokDeleteKey(providerId);
      delete this.byokKeyDrafts[providerId];
      await this.refreshByokStatus();
      await this.restartChatForByok();
    } catch (err) {
      this.byokError = err instanceof Error ? err.message : String(err);
    } finally {
      this.byokBusyId = null;
      this.render();
    }
  }

  private async removeByokProvider(providerId: string): Promise<void> {
    if (this.byokBusyId) return;
    this.byokBusyId = providerId;
    this.byokError = "";
    this.render();
    try {
      await backend.byokDeleteKey(providerId);
      delete this.byokKeyDrafts[providerId];
      const providers = this.settings.byokProviders.filter(
        (provider) => provider.id !== providerId,
      );
      await this.updateSettings({ byokProviders: providers });
      await this.refreshByokStatus();
      await this.restartChatForByok();
    } catch (err) {
      this.byokError = err instanceof Error ? err.message : String(err);
    } finally {
      this.byokBusyId = null;
      this.render();
    }
  }

  private async restartChatForByok(): Promise<void> {
    if (!this.folder) return;
    await this.startChatSession(true);
  }

  private async ensureGitHubAccount(force = false): Promise<void> {
    if (this.githubAccountLoaded && !force) return;
    if (!isTauriEnvironment()) {
      this.githubTokenPresent = false;
      this.githubAccount = null;
      this.githubAccountLoaded = true;
      return;
    }
    this.githubAccountBusy = true;
    try {
      this.githubTokenPresent = await backend.githubTokenStatus();
      this.githubAccount = this.githubTokenPresent
        ? (await backend.githubVerifyAccount()).login
        : null;
      this.githubAccountError = "";
    } catch (err) {
      this.githubAccount = null;
      this.githubAccountError = err instanceof Error ? err.message : String(err);
      this.githubError = this.githubAccountError;
    } finally {
      this.githubAccountBusy = false;
      this.githubAccountLoaded = true;
    }
  }

  private foundGitHubRemote(): FoundGitHubRemote | null {
    return findGitHubRemote(this.gitRemotes);
  }

  private async refreshGitHubPullRequests(): Promise<void> {
    const found = this.foundGitHubRemote();
    if (!this.folder || !this.githubTokenPresent || !found) {
      this.githubPullRequests = [];
      this.githubPrLoading = false;
      return;
    }
    this.githubPrLoading = true;
    try {
      this.githubPullRequests = await backend.githubListPullRequests(
        found.ref.owner,
        found.ref.repo,
        "open",
        1,
      );
      this.githubError = "";
    } catch (err) {
      this.githubError = err instanceof Error ? err.message : String(err);
    } finally {
      this.githubPrLoading = false;
    }
  }

  private async connectGitHub(): Promise<void> {
    const token = this.githubTokenDraft.trim();
    if (!token || this.githubAccountBusy) return;
    this.githubAccountBusy = true;
    this.githubAccountError = "";
    this.render();
    try {
      await backend.githubSetToken(token);
      this.githubTokenPresent = true;
      const user = await backend.githubVerifyAccount();
      this.githubAccount = user.login;
      this.githubTokenDraft = "";
      this.githubAccountLoaded = true;
      this.statusNotice = t(this.settings.language, "githubConnected", {
        login: user.login,
      });
      await this.refreshGitHubPullRequests();
    } catch (err) {
      this.githubAccount = null;
      this.githubAccountError = err instanceof Error ? err.message : String(err);
      this.githubError = this.githubAccountError;
      this.githubTokenPresent = await backend
        .githubTokenStatus()
        .catch(() => this.githubTokenPresent);
    } finally {
      this.githubAccountBusy = false;
      this.render();
    }
  }

  private async disconnectGitHub(): Promise<void> {
    if (this.githubAccountBusy) return;
    this.githubAccountBusy = true;
    this.githubAccountError = "";
    this.render();
    try {
      await backend.githubClearToken();
      this.githubTokenPresent = false;
      this.githubAccount = null;
      this.githubTokenDraft = "";
      this.githubPullRequests = [];
      this.githubError = "";
      this.statusNotice = t(this.settings.language, "githubDisconnected");
    } catch (err) {
      this.githubAccountError = err instanceof Error ? err.message : String(err);
    } finally {
      this.githubAccountBusy = false;
      this.render();
    }
  }

  private openGitHubTokenPage(): void {
    void backend
      .openExternalUrl("https://github.com/settings/tokens")
      .catch((err) =>
        this.showStatusNotice(err instanceof Error ? err.message : String(err)),
      );
  }

  private openPublishModal(): void {
    if (!this.folder) return;
    if (!this.githubTokenPresent) {
      this.statusNotice = t(this.settings.language, "githubConnectHint");
      this.openSettingsModal();
      return;
    }
    if (this.foundGitHubRemote()) {
      this.githubError = t(this.settings.language, "githubExistingRemote");
      this.render();
      return;
    }
    if (this.gitHistory.length === 0) {
      this.githubError = t(this.settings.language, "githubNoVersion");
      this.render();
      return;
    }
    this.modal = {
      kind: "github-publish",
      name: sanitizeRepoName(this.folder.name),
      description: "",
      isPrivate: true,
    };
    this.render();
  }

  private async submitGitHubPublish(): Promise<void> {
    const modal = this.modal;
    if (modal.kind !== "github-publish" || !this.folder || modal.submitting) {
      return;
    }
    const name = modal.name.trim();
    if (!name) {
      this.modal = {
        ...modal,
        error: t(this.settings.language, "githubRepoName"),
      };
      this.render();
      return;
    }

    const root = this.folder.rootPath;
    this.modal = { ...modal, submitting: true };
    this.render();
    try {
      const repo = await backend.githubCreateRepository(
        name,
        modal.isPrivate,
        modal.description.trim() || undefined,
      );
      const remoteName =
        this.gitRemotes.length === 0
          ? "origin"
          : uniqueRemoteName(this.gitRemotes, "github");
      await backend.gitAddRemote(root, remoteName, repo.cloneUrl);
      const branch = this.gitStatus?.branch;
      if (!branch) {
        throw new Error(t(this.settings.language, "githubPrNoBranch"));
      }
      this.gitStatus = await backend.gitPush(root, remoteName, branch);
      await this.refreshTree();
      await this.refreshGitMeta();
      await this.refreshGitHubPullRequests();
      this.modal = { kind: "none" };
      this.statusNotice = t(this.settings.language, "githubPublished");
      this.render();
    } catch (err) {
      await this.refreshGitMeta().catch(() => {});
      if (this.modal.kind === "github-publish") {
        this.modal = {
          ...this.modal,
          submitting: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
      this.render();
    }
  }

  private async pushToGitHub(): Promise<void> {
    const found = this.foundGitHubRemote();
    const branch = this.gitStatus?.branch;
    if (!this.folder || !found || this.githubBusy) return;
    if (!branch) {
      this.githubError = t(this.settings.language, "githubPrNoBranch");
      this.render();
      return;
    }
    this.githubBusy = true;
    this.githubError = "";
    try {
      this.gitStatus = await backend.gitPush(
        this.folder.rootPath,
        found.remote.name,
        branch,
      );
      await this.refreshTree();
      await this.refreshGitMeta();
      this.statusNotice = t(this.settings.language, "githubPushDone");
    } catch (err) {
      this.githubError = err instanceof Error ? err.message : String(err);
    } finally {
      this.githubBusy = false;
      this.render();
    }
  }

  private async pullFromGitHub(): Promise<void> {
    const found = this.foundGitHubRemote();
    const branch = this.gitStatus?.branch;
    if (!this.folder || !found || this.githubBusy) return;
    if (!branch) {
      this.githubError = t(this.settings.language, "githubPrNoBranch");
      this.render();
      return;
    }
    this.githubBusy = true;
    this.githubError = "";
    try {
      this.gitStatus = await backend.gitPull(
        this.folder.rootPath,
        found.remote.name,
        branch,
      );
      await this.refreshAfterGitOperation();
      await this.refreshGitHubPullRequests();
      this.statusNotice = t(this.settings.language, "githubPullDone");
    } catch (err) {
      this.githubError = err instanceof Error ? err.message : String(err);
    } finally {
      this.githubBusy = false;
      this.render();
    }
  }

  private async openPullRequestModal(): Promise<void> {
    if (!this.folder) return;
    if (!this.githubTokenPresent) {
      this.statusNotice = t(this.settings.language, "githubConnectHint");
      this.openSettingsModal();
      return;
    }
    const found = this.foundGitHubRemote();
    if (!found) {
      this.githubError = t(this.settings.language, "githubNoRemote");
      this.render();
      return;
    }
    const branch = this.gitStatus?.branch;
    if (!branch) {
      this.githubError = t(this.settings.language, "githubPrNoBranch");
      this.render();
      return;
    }
    if (isDefaultBranchName(branch)) {
      this.githubError = t(this.settings.language, "githubPrNeedBranch");
      this.render();
      return;
    }
    if (this.githubBusy) return;

    this.githubBusy = true;
    this.githubError = "";
    try {
      const repo = await backend.githubGetRepository(
        found.ref.owner,
        found.ref.repo,
      );
      const branches = await backend.githubListBranches(
        found.ref.owner,
        found.ref.repo,
        1,
      );
      const names = branches.map((item) => item.name);
      const base = defaultBaseBranch(names, repo.defaultBranch);
      this.modal = {
        kind: "github-pr",
        title: "",
        body: "",
        base,
        head: branch,
        branches: names.length > 0 ? names : [base],
      };
    } catch (err) {
      this.githubError = err instanceof Error ? err.message : String(err);
    } finally {
      this.githubBusy = false;
      this.render();
    }
  }

  private async submitPullRequest(): Promise<void> {
    const modal = this.modal;
    if (modal.kind !== "github-pr" || !this.folder || modal.submitting) return;
    const found = this.foundGitHubRemote();
    if (!found) {
      this.modal = {
        ...modal,
        error: t(this.settings.language, "githubNoRemote"),
      };
      this.render();
      return;
    }
    if (!modal.title.trim()) {
      this.modal = {
        ...modal,
        error: t(this.settings.language, "githubPrTitleLabel"),
      };
      this.render();
      return;
    }

    const root = this.folder.rootPath;
    this.modal = { ...modal, submitting: true };
    this.render();
    try {
      this.gitStatus = await backend.gitPush(
        root,
        found.remote.name,
        modal.head,
      );
      await backend.githubCreatePullRequest(
        found.ref.owner,
        found.ref.repo,
        modal.title.trim(),
        modal.head,
        modal.base,
        modal.body.trim() || undefined,
      );
      await this.refreshTree();
      await this.refreshGitMeta();
      await this.refreshGitHubPullRequests();
      this.modal = { kind: "none" };
      this.statusNotice = t(this.settings.language, "githubPrCreated");
      this.render();
    } catch (err) {
      if (this.modal.kind === "github-pr") {
        this.modal = {
          ...this.modal,
          submitting: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
      this.render();
    }
  }

  private openGitHubUrl(url: string): void {
    void backend
      .openExternalUrl(url)
      .catch((err) =>
        this.showStatusNotice(err instanceof Error ? err.message : String(err)),
      );
  }

  private chatSessionTabs(): SessionTabInfo[] {
    const lang = this.settings.language;
    return this.chatSessionOrder.map((id) => {
      const state = this.chatSessions.get(id);
      return {
        id,
        title:
          state?.title ||
          t(lang, "chatSessionDefaultTitle", { count: "?" }),
        streaming: Boolean(state?.streaming),
        error: Boolean(state && (state.error || state.status === "error")),
      };
    });
  }

  private ensureChatPanel(): ChatPanel {
    if (!this.chatPanel) {
      this.chatPanel = new ChatPanel({
        language: this.settings.language,
        projectName: this.folder?.name ?? "",
        projectRoot: this.folder?.rootPath ?? "",
        sessions: this.chatSessionTabs(),
        activeSessionId: this.activeChatSessionId,
        canCreateSession: this.chatState.status === "ready",
        onSend: (text) => void this.sendChatMessage(text),
        onStop: () => void this.stopChatGeneration(),
        onRetry: () => void this.retryChat(),
        onOpenSettings: () => this.openSettingsAt("models"),
        onSelectSession: (id) => this.selectChatSession(id),
        onCreateSession: () => void this.createChatSession(),
        onCloseSession: (id) => void this.closeChatSession(id),
        onRenameSession: (id, title) => void this.renameChatSession(id, title),
        onOpenToolFile: (path, showDiff) =>
          void this.openChatToolFile(path, showDiff),
        onPermissionReply: (requestId, decision) =>
          void this.replyChatPermission(requestId, decision),
        onFormReply: (formId, answer) =>
          void this.replyChatForm(formId, answer),
        kit: this.kitCatalog,
        models: this.chatModels,
        projectFiles: this.projectFiles(),
        hiddenModels: this.settings.hiddenModels,
        recentModels: this.settings.recentModels,
        onAgentChange: (agent) => void this.changeChatAgent(agent),
        onModelChange: (providerId, modelId, variant) =>
          void this.changeChatModel(providerId, modelId, variant),
        onManageModels: () => this.openManageModels(),
      });
    }
    this.updateChatPanel();
    return this.chatPanel;
  }

  private updateChatPanel(): void {
    this.chatPanel?.update(this.chatState, {
      language: this.settings.language,
      projectName: this.folder?.name ?? "",
      projectRoot: this.folder?.rootPath ?? "",
      sessions: this.chatSessionTabs(),
      activeSessionId: this.activeChatSessionId,
      canCreateSession: this.chatState.status === "ready",
      kit: this.kitCatalog,
      models: this.chatModels,
      projectFiles: this.projectFiles(),
      hiddenModels: this.settings.hiddenModels,
      recentModels: this.settings.recentModels,
    });
  }

  private projectFiles() {
    return flattenFileTree(
      filterTreeNodes(this.folder?.tree ?? [], this.settings.showConfigFiles),
    );
  }

  private persistWorkspaceState(): void {
    if (!this.folder) return;
    const state: ProjectWorkspaceState = {
      openSessionIds: [...this.chatSessionOrder],
      activeSessionId: this.activeChatSessionId,
      layout: {
        sessionWidth: this.sessionWidth,
        chatVisible: this.chatVisible,
        editorVisible: this.editorVisible,
      },
    };
    this.workspaceState = state;
    void backend
      .saveWorkspaceState(this.folder.rootPath, state)
      .catch((err) => console.error("Could not save the workspace state", err));
  }

  private applyWorkspaceLayout(layout: ProjectWorkspaceState["layout"]): void {
    this.sessionWidth = Math.min(640, Math.max(320, layout.sessionWidth || 430));
    this.chatVisible = layout.chatVisible;
    this.editorVisible = layout.editorVisible;
    if (!this.chatVisible && !this.editorVisible) {
      this.chatVisible = true;
      this.editorVisible = true;
    }
  }

  private async startChatSession(force = false): Promise<void> {
    if (!this.folder) return;
    if (
      !force &&
      (this.chatState.status === "starting" || this.chatState.status === "ready")
    ) {
      return;
    }
    const root = this.folder.rootPath;
    const lang = this.settings.language;
    this.chatSessions.clear();
    this.chatSessionOrder = [];
    this.activeChatSessionId = null;
    this.chatState = chatStarting(this.chatState);
    this.ensureChatPanel();
    this.updateChatPanel();

    if (!isTauriEnvironment()) {
      this.chatState = chatFailed(
        this.chatState,
        t(lang, "chatNoDesktop"),
      );
      this.updateChatPanel();
      return;
    }

    try {
      this.opencodeUnlisten?.();
      this.opencodeUnlisten = null;
      await backend.opencodeStop();
      if (!this.folder || this.folder.rootPath !== root) return;
      await backend.opencodeStart(root);
      if (!this.folder || this.folder.rootPath !== root) {
        await backend.opencodeStop();
        return;
      }
      try {
        this.chatModels = await backend.opencodeListModels();
      } catch (err) {
        console.error("Could not list the OpenCode models", err);
        this.chatModels = [];
      }

      const available = await backend.opencodeListSessions();
      const availableIds = new Set(available.map((session) => session.id));
      let openIds = this.workspaceState.openSessionIds.filter((id) =>
        availableIds.has(id),
      );
      if (openIds.length === 0) {
        const title = t(lang, "chatSessionDefaultTitle", { count: "1" });
        const session = await backend.opencodeCreateSession(title);
        openIds = [session.id];
        available.push(session);
      }
      this.chatSessionOrder = openIds;

      const loaded = await Promise.all(
        openIds.map(async (id) => {
          const session =
            available.find((item) => item.id === id) ?? {
              id,
              title: t(lang, "chatSessionDefaultTitle", { count: "?" }),
            };
          let messages: OpenCodeChatMessage[] = [];
          let permissions: OpenCodePermission[] = [];
          let forms: OpenCodeForm[] = [];
          let error = "";
          try {
            messages = await backend.opencodeSessionMessages(id);
          } catch (err) {
            error = err instanceof Error ? err.message : String(err);
          }
          try {
            permissions = await backend.opencodePendingPermissions(id);
          } catch (err) {
            if (!error) {
              error = err instanceof Error ? err.message : String(err);
            }
          }
          try {
            forms = await backend.opencodePendingForms(id);
          } catch (err) {
            if (!error) {
              error = err instanceof Error ? err.message : String(err);
            }
          }
          const state = formsLoaded(
            permissionsLoaded(chatFromHistory(session, messages), permissions),
            forms,
          );
          return [id, error ? { ...state, error } : state] as const;
        }),
      );

      this.chatSessions = new Map(loaded);
      const persistedActive =
        this.workspaceState.activeSessionId &&
        openIds.includes(this.workspaceState.activeSessionId)
          ? this.workspaceState.activeSessionId
          : openIds[0];
      this.activeChatSessionId = persistedActive;
      this.chatState =
        this.chatSessions.get(persistedActive) ?? chatStopped();
      this.opencodeUnlisten = await backend.listenOpenCodeEvents((event) =>
        this.handleOpenCodeEvent(event),
      );
      this.persistWorkspaceState();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const action = /no models|provider|auth login/i.test(message)
        ? ("models" as const)
        : null;
      this.chatState = chatFailed(this.chatState, message, action);
    }
    this.updateChatPanel();
  }

  private async stopChatSession(): Promise<void> {
    this.opencodeUnlisten?.();
    this.opencodeUnlisten = null;
    if (isTauriEnvironment()) {
      try {
        await backend.opencodeStop();
      } catch (err) {
        console.error("Could not stop OpenCode", err);
      }
    }
    this.chatSessions.clear();
    this.chatSessionOrder = [];
    this.activeChatSessionId = null;
    this.chatModels = [];
    this.chatState = chatStopped();
    this.updateChatPanel();
  }

  private selectChatSession(id: string): void {
    const state = this.chatSessions.get(id);
    if (!state) return;
    this.activeChatSessionId = id;
    this.chatState = state;
    this.updateChatPanel();
    this.persistWorkspaceState();
  }

  private async createChatSession(): Promise<void> {
    if (!this.folder || this.chatState.status !== "ready") return;
    try {
      const count = this.chatSessionOrder.length + 1;
      const title = t(this.settings.language, "chatSessionDefaultTitle", {
        count: String(count),
      });
      const session = await backend.opencodeCreateSession(title);
      this.chatSessionOrder = addSessionTab(this.chatSessionOrder, session.id);
      this.chatSessions.set(
        session.id,
        chatFromHistory(session, []),
      );
      this.activeChatSessionId = session.id;
      this.chatState = this.chatSessions.get(session.id)!;
      this.updateChatPanel();
      this.persistWorkspaceState();
    } catch (err) {
      this.chatState = chatSendFailed(
        this.chatState,
        err instanceof Error ? err.message : String(err),
      );
      this.updateChatPanel();
    }
  }

  private async closeChatSession(id: string): Promise<void> {
    if (this.chatSessionOrder.length <= 1) return;
    const closing = this.chatSessions.get(id);
    if (closing?.streaming && isTauriEnvironment()) {
      void backend.opencodeAbort(id).catch(() => {});
    }
    const result = removeSessionTab(
      this.chatSessionOrder,
      this.activeChatSessionId,
      id,
    );
    this.chatSessionOrder = result.openIds;
    this.chatSessions.delete(id);
    this.activeChatSessionId = result.activeId;
    this.chatState = result.activeId
      ? this.chatSessions.get(result.activeId) ?? chatStopped()
      : chatStopped();
    this.updateChatPanel();
    this.persistWorkspaceState();
  }

  private async renameChatSession(id: string, title: string): Promise<void> {
    const trimmed = title.trim();
    if (!trimmed) return;
    const current = this.chatSessions.get(id);
    if (!current || current.title === trimmed) return;

    const optimistic = { ...current, title: trimmed };
    this.chatSessions.set(id, optimistic);
    if (this.activeChatSessionId === id) {
      this.chatState = optimistic;
    }
    this.updateChatPanel();

    try {
      await backend.opencodeRenameSession(id, trimmed);
    } catch (err) {
      this.chatSessions.set(id, current);
      if (this.activeChatSessionId === id) {
        this.chatState = current;
      }
      this.updateChatPanel();
      this.showStatusNotice(err instanceof Error ? err.message : String(err));
    }
  }

  private async replyChatPermission(
    requestId: string,
    decision: "once" | "always" | "reject",
  ): Promise<void> {
    const sessionId = this.activeChatSessionId;
    if (!sessionId) return;
    const current = this.chatSessions.get(sessionId);
    if (!current) return;
    const replied = chatPermissionReplied(current, requestId, decision);
    this.chatSessions.set(sessionId, replied);
    if (this.activeChatSessionId === sessionId) {
      this.chatState = replied;
    }
    this.updateChatPanel();
    try {
      await backend.opencodeReplyPermission(sessionId, requestId, decision);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const failed = chatPermissionFailed(
        this.chatSessions.get(sessionId) ?? replied,
        requestId,
        message,
      );
      this.chatSessions.set(sessionId, failed);
      if (this.activeChatSessionId === sessionId) {
        this.chatState = failed;
      }
      this.updateChatPanel();
    }
  }

  private async replyChatForm(
    formId: string,
    answer: Record<string, unknown>,
  ): Promise<void> {
    const sessionId = this.activeChatSessionId;
    if (!sessionId) return;
    const current = this.chatSessions.get(sessionId);
    if (!current) return;
    const answered = chatFormAnswered(current, formId, answer);
    this.chatSessions.set(sessionId, answered);
    if (this.activeChatSessionId === sessionId) {
      this.chatState = answered;
    }
    this.updateChatPanel();
    try {
      await backend.opencodeReplyForm(sessionId, formId, answer);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const failed = chatFormFailed(
        this.chatSessions.get(sessionId) ?? answered,
        formId,
        message,
      );
      this.chatSessions.set(sessionId, failed);
      if (this.activeChatSessionId === sessionId) {
        this.chatState = failed;
      }
      this.updateChatPanel();
    }
  }

  private async changeChatAgent(agent: string | null): Promise<void> {
    const sessionId = this.activeChatSessionId;
    if (!sessionId) return;
    const target = agent || "build";
    try {
      await backend.opencodeSwitchAgent(sessionId, target);
      const state = this.chatSessions.get(sessionId);
      if (!state) return;
      const next = { ...state, agent: target };
      this.chatSessions.set(sessionId, next);
      if (this.activeChatSessionId === sessionId) {
        this.chatState = next;
      }
      this.updateChatPanel();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.chatState = chatSendFailed(this.chatState, message);
      this.chatSessions.set(sessionId, this.chatState);
      this.updateChatPanel();
    }
  }

  private async changeChatModel(
    providerId: string,
    modelId: string,
    variant?: string,
  ): Promise<void> {
    const sessionId = this.activeChatSessionId;
    if (!sessionId) return;
    try {
      await backend.opencodeSwitchModel(
        sessionId,
        providerId,
        modelId,
        variant,
      );
      const state = this.chatSessions.get(sessionId);
      if (!state) return;
      const next = {
        ...state,
        model: `${providerId}/${modelId}${variant ? `#${variant}` : ""}`,
      };
      this.chatSessions.set(sessionId, next);
      if (this.activeChatSessionId === sessionId) {
        this.chatState = next;
      }
      const key = `${providerId}/${modelId}`;
      const recentModels = [
        key,
        ...this.settings.recentModels.filter((recent) => recent !== key),
      ].slice(0, 6);
      if (
        recentModels.length !== this.settings.recentModels.length ||
        recentModels.some(
          (recent, index) => recent !== this.settings.recentModels[index],
        )
      ) {
        try {
          this.settings = await backend.saveSettings({
            ...this.settings,
            recentModels,
          });
        } catch (err) {
          console.error("Could not save the recent models", err);
        }
      }
      this.updateChatPanel();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.chatState = chatSendFailed(this.chatState, message);
      this.chatSessions.set(sessionId, this.chatState);
      this.updateChatPanel();
    }
  }

  private async openChatToolFile(
    rawPath: string,
    showDiff: boolean,
  ): Promise<void> {
    if (!this.folder) return;
    const path = projectRelativePath(this.folder.rootPath, rawPath);
    if (!path) {
      this.statusNotice = t(
        this.settings.language,
        "chatFileOutsideProject",
      );
      this.render();
      return;
    }
    if (showDiff) {
      await this.openChangeDiff(path);
    } else {
      await this.openFileFromTree(path, true);
    }
  }

  private handleOpenCodeEvent(event: OpenCodeEvent): void {
    const data = event.data ?? {};
    const sessionID =
      typeof data.sessionID === "string" ? data.sessionID : null;
    const targetId = sessionID ?? this.activeChatSessionId;
    if (!targetId || !this.chatSessions.has(targetId)) return;
    const previous = this.chatSessions.get(targetId)!;
    const next = applyOpenCodeEvent(previous, event);
    this.chatSessions.set(targetId, next);
    if (targetId === this.activeChatSessionId) {
      this.chatState = next;
    }
    this.updateChatPanel();
  }

  private async sendChatMessage(rawText: string): Promise<void> {
    const sessionId = this.chatState.sessionId;
    if (
      !sessionId ||
      this.chatState.status !== "ready" ||
      this.chatState.streaming
    ) {
      return;
    }
    const text = rawText.trim();
    if (!text) return;

    this.chatState = appendUserMessage(this.chatState, text);
    this.chatSessions.set(sessionId, this.chatState);
    this.chatPanel?.clearDraft();
    this.updateChatPanel();
    try {
      const command = parseSlashCommand(text);
      const kitCommand = command
        ? this.kitCatalog.commands.find((candidate) =>
            matchesKitCommand(candidate, command.name, this.settings.language),
          )
        : undefined;
      if (command && kitCommand) {
        await backend.opencodeRunCommand(
          sessionId,
          kitCommand.id,
          command.args,
        );
      } else {
        await backend.opencodeSend(sessionId, text);
      }
    } catch (err) {
      this.chatState = chatSendFailed(
        this.chatState,
        err instanceof Error ? err.message : String(err),
      );
      this.chatSessions.set(sessionId, this.chatState);
      this.updateChatPanel();
    }
  }

  private async stopChatGeneration(): Promise<void> {
    const sessionId = this.chatState.sessionId;
    if (!sessionId) return;
    this.chatState = { ...this.chatState, streaming: false };
    this.chatSessions.set(sessionId, this.chatState);
    this.updateChatPanel();
    try {
      await backend.opencodeAbort(sessionId);
    } catch (err) {
      this.chatState = chatSendFailed(
        this.chatState,
        err instanceof Error ? err.message : String(err),
      );
      this.chatSessions.set(sessionId, this.chatState);
      this.updateChatPanel();
    }
  }

  private async retryChat(): Promise<void> {
    if (this.chatState.status === "error" || this.chatState.status === "idle") {
      await this.startChatSession(true);
      return;
    }
    this.chatState = clearChatError(this.chatState);
    if (this.activeChatSessionId) {
      this.chatSessions.set(this.activeChatSessionId, this.chatState);
    }
    this.updateChatPanel();
    this.chatPanel?.focus();
  }

  private toggleChatPanel(): void {
    this.chatVisible = !this.chatVisible;
    if (!this.chatVisible) {
      this.editorVisible = true;
    }
    this.render();
    this.persistWorkspaceState();
  }

  private toggleEditorPanel(): void {
    this.editorVisible = !this.editorVisible;
    if (!this.editorVisible) {
      this.chatVisible = true;
    }
    this.render();
    this.persistWorkspaceState();
  }

  private toggleTerminalView(): void {
    if (!this.chatVisible) {
      this.sessionView = "terminal";
      this.chatVisible = true;
    } else {
      this.sessionView = toggleSessionView(this.sessionView);
    }
    this.render();
    if (this.sessionView === "terminal") {
      this.terminalPanel?.focus();
    }
  }

  private ensureTerminalPanel(lang: AppSettings["language"]): TerminalPanel {
    const options = {
      language: lang,
      projectName: this.folder?.name ?? "",
      rootPath: this.folder?.rootPath ?? "",
      command: this.settings.terminalCommand,
      fontSize: this.settings.fontSize,
      onCommandChange: (command: string) =>
        void this.updateSettings({ terminalCommand: command }),
    };
    if (!this.terminalPanel) {
      this.terminalPanel = new TerminalPanel(options);
    } else {
      this.terminalPanel.update(options);
    }
    return this.terminalPanel;
  }

  private stopTerminalSession(): void {
    this.terminalPanel?.dispose();
    this.terminalPanel = null;
    this.sessionView = "chat";
    if (isTauriEnvironment()) {
      void backend.ptyStop().catch((error) => {
        console.error("Could not stop the terminal", error);
      });
    }
  }

  private openUntitledFile(defaultDir = ""): void {
    if (!this.folder) return;
    this.untitledSequence += 1;
    const path = `untitled://${this.untitledSequence}.md`;
    const name = t(this.settings.language, "untitledFileName", {
      count: String(this.untitledSequence),
    });
    this.tabState = openUntitledInTabs(this.tabState, {
      path,
      name,
      defaultDir,
    });
    this.statusNotice = "";
    this.render();
    requestAnimationFrame(() => this.editor?.focus());
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
    if (isUntitledTab(active)) {
      return this.saveUntitledTab(active);
    }
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

  private async saveUntitledTab(tab: OpenTab): Promise<boolean> {
    if (!this.folder) return false;
    try {
      const directory = tab.defaultDir
        ? `${this.folder.rootPath}/${tab.defaultDir}`
        : this.folder.rootPath;
      const defaultName = t(
        this.settings.language,
        "untitledDefaultFileName",
      );
      const selected = await backend.pickSaveFileDialog(
        `${directory}/${defaultName}`,
      );
      if (!selected) return false;

      const targetPath = ensureMarkdownExtension(selected);
      const relativePath = relativePathWithinRoot(
        this.folder.rootPath,
        targetPath,
      );
      if (!relativePath) {
        this.statusNotice = t(this.settings.language, "saveOutsideProject");
        this.render();
        return false;
      }

      await backend.writeTextFile(
        this.folder.rootPath,
        relativePath,
        tab.content,
      );
      this.editor?.renameDocumentState(tab.path, relativePath);
      const name = relativePath.split("/").pop() || relativePath;
      this.tabState = markUntitledTabSaved(
        this.tabState,
        tab.path,
        relativePath,
        name,
      );
      this.statusNotice = t(this.settings.language, "saved");
      await this.refreshTree();
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
    mode: "new-folder" | "rename",
    basePath = "",
  ): void {
    let initialValue = "";
    if (mode === "rename") {
      initialValue = basePath;
    } else if (basePath) {
      initialValue = `${basePath}/`;
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
      this.modal = { ...currentModal, error: t(this.settings.language, "entryNameInvalid") };
      this.render();
      return;
    }

    try {
      if (currentModal.mode === "new-folder") {
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

  private providerDisplayName(providerId: string): string {
    if (providerId === "opencode-go") return "OpenCode Go";
    if (providerId === "opencode") return "OpenCode";
    if (providerId === "openai") return "OpenAI";
    return providerId
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  private openManageModels(fromSettings = false): void {
    this.modal = { kind: "manage-models", search: "", fromSettings };
    this.render();
  }

  private async setModelVisibility(
    keys: string[],
    visible: boolean,
  ): Promise<void> {
    const hidden = new Set(this.settings.hiddenModels);
    for (const key of keys) {
      if (visible) hidden.delete(key);
      else hidden.add(key);
    }
    await this.updateSettings({ hiddenModels: [...hidden] });
    const search =
      this.modal.kind === "manage-models" ? this.modal.search : "";
    window.setTimeout(() => {
      const input = this.rootEl.querySelector<HTMLInputElement>(
        ".manage-models-search",
      );
      if (input) {
        input.value = search;
        input.focus();
      }
    }, 0);
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

  private currentMenuState(): MenuUiState {
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
    if (!active || (!isMarkdownPath(active.path) && !isFountainPath(active.path))) {
      return;
    }
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
    if (!active || !this.folder || isUntitledTab(active)) return;

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
      console.error("Could not load the saved version", err);
      this.tabState = setTabViewMode(this.tabState, tab.path, "edit");
      this.render();
    } finally {
      this.diffLoadingPath = null;
    }
  }

  private requestDiscard(): void {
    const active = this.getActiveTab();
    if (!active || !this.folder || isUntitledTab(active)) return;
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

  private async refreshKitCatalog(): Promise<void> {
    if (!this.folder) {
      this.kitCatalog = { agents: [], commands: GENERAL_COMMANDS, skills: [] };
      return;
    }
    try {
      this.kitCatalog = mergeGeneralCommands(
        await backend.discoverKit(this.folder.rootPath),
      );
    } catch (err) {
      console.error("Could not discover the project kit", err);
      this.kitCatalog = { agents: [], commands: GENERAL_COMMANDS, skills: [] };
    }
  }

  private async handleFsChange(event: FsChangeEvent): Promise<void> {
    if (!this.folder || event.paths.length === 0) return;
    const root = this.folder.rootPath;
    const affected = this.tabState.tabs.filter(
      (tab) => !tab.untitled && isTabAffected(tab.path, event.paths),
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
      console.error("Could not update the file tree", err);
    }

    if (
      event.paths.some(
        (path) => path.startsWith(".opencode/") || path.startsWith(".bradbit/"),
      )
    ) {
      await this.refreshKitCatalog();
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
        this.openSettingsModal();
        break;
      case "file.openFolder":
        await this.handleOpenFolderDialog();
        break;
      case "file.closeFolder":
        this.closeFolder();
        break;
      case "file.openRecent":
        if (command.path) {
          await this.openFolderByPath(command.path);
        }
        break;
      case "file.newFile":
        this.openUntitledFile();
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
        this.ensureEditMode();
        this.editor?.openFindPanel();
        break;
      case "edit.findReplace":
        this.ensureEditMode();
        this.editor?.openReplacePanel();
        break;
      case "edit.findInProject":
        this.openGlobalSearch();
        break;
      case "view.toggleSidebar":
        this.toggleSidebar();
        break;
      case "view.toggleTerminal":
        this.toggleTerminalView();
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
        this.openUntitledFile();
      } else if (letter === "w" && this.tabState.activeTabPath) {
        e.preventDefault();
        this.requestCloseTab(this.tabState.activeTabPath);
      } else if (letter === ",") {
        e.preventDefault();
        this.openSettingsModal();
      } else if (letter === "f" && e.shiftKey) {
        e.preventDefault();
        this.openGlobalSearch();
      } else if (letter === "f" && this.getActiveTab()) {
        e.preventDefault();
        this.ensureEditMode();
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
    shell.appendChild(this.renderTopbar(lang));

    if (!this.folder) {
      shell.appendChild(this.renderWelcomeScreen(lang));
    } else {
      const body = document.createElement("div");
      body.className = "workspace-body";

      const layout = computeWorkspaceLayout({
        chatVisible: this.chatVisible,
        editorVisible: this.editorVisible,
        sessionWidth: this.sessionWidth,
      });
      this.chatVisible = layout.chatVisible;

      if (layout.chatVisible) {
        body.appendChild(this.renderSessionColumn(lang, layout));
        if (layout.showSessionResizer) {
          body.appendChild(this.renderSessionResizer());
        }
      }

      if (layout.editorVisible) {
        const workspace = document.createElement("div");
        workspace.className = "workspace-panel";
        if (this.sidebarVisible) {
          workspace.appendChild(this.renderSidebar(lang));
          workspace.appendChild(this.renderSidebarResizer());
        }
        workspace.appendChild(this.renderEditorColumn(lang, activeTab));
        body.appendChild(workspace);
      }
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
        dot.replaceChildren();
        if (active.externalChange) {
          dot.appendChild(createIcon("triangle-alert", 12));
        } else {
          dot.textContent =
            active.untitled || isTabDirty(active) ? "•" : "";
        }
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

  private ensureAppMenu(): AppMenu {
    if (!this.appMenu) {
      this.appMenu = new AppMenu({
        onCommand: (command) => void this.executeMenuCommand(command),
      });
    }
    this.appMenu.update(this.currentMenuState());
    return this.appMenu;
  }

  private renderTopbar(lang: AppSettings["language"]): HTMLElement {
    const bar = document.createElement("header");
    bar.className = "topbar";

    const left = document.createElement("div");
    left.className = "topbar-left";

    if (this.folder) {
      const badge = document.createElement("span");
      badge.className = "project-badge";
      badge.append(
        createIcon("folder", 14),
        document.createTextNode(this.folder.name),
      );
      const kitTotal =
        this.kitCatalog.agents.length +
        this.kitCatalog.commands.length +
        this.kitCatalog.skills.length;
      badge.title =
        kitTotal > 0
          ? `${this.folder.rootPath}\n${t(lang, "kitSummary", {
              agents: String(this.kitCatalog.agents.length),
              commands: String(this.kitCatalog.commands.length),
              skills: String(this.kitCatalog.skills.length),
            })}`
          : this.folder.rootPath;
      left.appendChild(badge);

      const chatBtn = createIconButton({
        icon: "message-square",
        label: t(lang, "chatToggleChat"),
        testId: "toggle-chat-btn",
        active: this.chatVisible,
        onClick: () => this.toggleChatPanel(),
      });
      left.appendChild(chatBtn);

      const editorBtn = createIconButton({
        icon: "panel-right",
        label: t(lang, "chatToggleEditor"),
        testId: "toggle-editor-btn",
        active: this.editorVisible,
        onClick: () => this.toggleEditorPanel(),
      });
      left.appendChild(editorBtn);
    } else {
      const brand = document.createElement("span");
      brand.className = "project-badge";
      brand.append(
        createIcon("pen-line", 14),
        document.createTextNode(t(lang, "appName")),
      );
      left.appendChild(brand);
    }

    const right = document.createElement("div");
    right.className = "topbar-right";
    right.appendChild(this.ensureAppMenu().element);

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

    actions.append(openBtn);
    if (isTauriEnvironment()) {
      const newProjectBtn = document.createElement("button");
      newProjectBtn.className = "toolbar-btn";
      newProjectBtn.dataset.testid = "welcome-new-project-btn";
      newProjectBtn.textContent = t(lang, "newProjectButton");
      newProjectBtn.onclick = () => void this.openNewProjectModal();
      actions.appendChild(newProjectBtn);
    }

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

        const removeBtn = createIconButton({
          icon: "x",
          label: t(lang, "removeRecent"),
          className: "tree-mini-btn",
          onClick: async (e) => {
            e.stopPropagation();
            this.recents = await backend.removeRecentProject(item.path);
            this.render();
          },
        });

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

    const header = document.createElement("div");
    header.className = "sidebar-header";
    const title = document.createElement("span");
    title.className = "sidebar-title";
    const activeSection =
      SIDEBAR_SECTIONS.find((section) => section.id === this.sidebarTab) ??
      SIDEBAR_SECTIONS[0];
    title.textContent = t(lang, activeSection.titleKey);

    const actions = document.createElement("div");
    actions.className = "sidebar-actions";

    if (this.sidebarTab === "files") {
      const newFileBtn = createIconButton({
        icon: "file-plus",
        label: t(lang, "newFile"),
        title: `${t(lang, "newFile")} (⌘N)`,
        testId: "sidebar-new-file-btn",
        className: "tree-mini-btn",
        onClick: () => this.openUntitledFile(),
      });

      const newFolderBtn = createIconButton({
        icon: "folder-plus",
        label: t(lang, "newFolder"),
        testId: "sidebar-new-folder-btn",
        className: "tree-mini-btn",
        onClick: () => this.openEntryModal("new-folder"),
      });

      actions.append(newFileBtn, newFolderBtn);
    }

    header.append(title, actions);
    aside.append(header);

    if (this.sidebarTab === "files") {
      aside.appendChild(this.renderTreeSearch(lang));
      const treeBody = document.createElement("div");
      treeBody.className = "tree-body";
      treeBody.appendChild(this.renderFileTree(lang));
      aside.appendChild(treeBody);
    } else if (this.sidebarTab === "outline") {
      aside.appendChild(this.renderOutline(lang));
    } else {
      aside.appendChild(this.renderVersions(lang));
    }
    return aside;
  }

  private renderSidebarSwitcher(lang: AppSettings["language"]): HTMLElement {
    const switcher = document.createElement("div");
    switcher.className = "sidebar-switcher";
    switcher.setAttribute("role", "group");
    switcher.setAttribute("aria-label", t(lang, "sidebarSections"));

    for (const section of SIDEBAR_SECTIONS) {
      const label = t(lang, section.labelKey);
      const active = this.sidebarVisible && this.sidebarTab === section.id;
      const button = createIconButton({
        icon: section.icon,
        label,
        className: "sidebar-switch",
        testId: `sidebar-tab-${section.id}`,
        active,
        onClick: () => {
          const changed = this.sidebarTab !== section.id;
          if (!changed && this.sidebarVisible) return;
          this.sidebarVisible = true;
          this.sidebarTab = section.id;
          this.render();
          if (changed && section.id === "versions") {
            void this.refreshGitPanelData();
          }
        },
      });
      button.dataset.sidebarTab = section.id;
      switcher.appendChild(button);
    }
    return switcher;
  }

  private renderTreeSearch(lang: AppSettings["language"]): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "tree-search";
    const icon = document.createElement("span");
    icon.className = "tree-search-icon";
    icon.appendChild(createIcon("search", 14));

    const input = document.createElement("input");
    input.type = "text";
    input.className = "tree-search-input";
    input.dataset.testid = "tree-search";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("autocorrect", "off");
    input.setAttribute("autocapitalize", "off");
    input.placeholder = t(lang, "treeSearchPlaceholder");
    input.setAttribute("aria-label", t(lang, "treeSearchPlaceholder"));
    input.value = this.fileFilter;
    input.oninput = () => {
      this.fileFilter = input.value;
      this.refreshTreeResults(lang);
    };
    input.onkeydown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      this.fileFilter = "";
      input.value = "";
      this.refreshTreeResults(lang);
      input.focus();
    };

    const clear = createIconButton({
      icon: "x",
      label: t(lang, "clearSearch"),
      className: "tree-search-clear",
      testId: "tree-search-clear",
      plain: true,
      onClick: () => {
        this.fileFilter = "";
        input.value = "";
        this.refreshTreeResults(lang);
        input.focus();
      },
    });
    clear.hidden = this.fileFilter.length === 0;

    wrap.append(icon, input, clear);
    return wrap;
  }

  private refreshTreeResults(lang: AppSettings["language"]): void {
    const treeBody = this.rootEl.querySelector(".tree-body");
    if (treeBody) {
      treeBody.replaceChildren(this.renderFileTree(lang));
    }
    const clear = this.rootEl.querySelector<HTMLButtonElement>(
      ".tree-search-clear",
    );
    if (clear) clear.hidden = this.fileFilter.length === 0;
  }

  private renderFileTree(lang: AppSettings["language"]): HTMLElement {
    const treeContainer = document.createElement("div");
    treeContainer.className = "tree-container";
    const visibleTree = filterTreeNodes(
      this.folder?.tree ?? [],
      this.settings.showConfigFiles,
    );
    const filteredTree = filterTreeByQuery(visibleTree, this.fileFilter);
    const gitBadges = buildGitBadgeMap(this.gitStatus?.entries ?? []);

    if (this.fileFilter.trim() && filteredTree.length === 0) {
      const empty = document.createElement("div");
      empty.className = "tree-empty";
      empty.textContent = t(lang, "treeSearchEmpty");
      treeContainer.appendChild(empty);
      return treeContainer;
    }

    const renderNodes = (nodes: FileTreeNode[], depth: number) => {
      for (const node of nodes) {
        const row = document.createElement("div");
        row.className = "tree-row";
        if (node.isDir) row.classList.add("tree-row-dir");
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
        icon.className = "tree-icon";
        const isCollapsed = this.fileFilter.trim()
          ? false
          : this.collapsedDirs.has(node.path);
        if (node.isDir) {
          icon.appendChild(
            createIcon(isCollapsed ? "folder" : "folder-open", 15),
          );
        } else if (node.name.endsWith(".fountain")) {
          icon.appendChild(createIcon("clapperboard", 15));
        } else if (node.name.endsWith(".md") || node.name.endsWith(".mdx")) {
          icon.appendChild(createIcon("file-text", 15));
        } else {
          icon.appendChild(createIcon("file", 15));
        }

        const nameSpan = document.createElement("span");
        nameSpan.className = "tree-row-name";
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
          const addInDirBtn = createIconButton({
            icon: "plus",
            label: t(lang, "newFile"),
            className: "tree-mini-btn",
            onClick: (e) => {
              e.stopPropagation();
              this.openUntitledFile(node.path);
            },
          });
          rowActions.appendChild(addInDirBtn);
        }

        const renameBtn = createIconButton({
          icon: "pencil",
          label: t(lang, "rename"),
          className: "tree-mini-btn",
          onClick: (e) => {
            e.stopPropagation();
            this.openEntryModal("rename", node.path);
          },
        });

        const deleteBtn = createIconButton({
          icon: "trash",
          label: t(lang, "delete"),
          className: "tree-mini-btn",
          onClick: (e) => {
            e.stopPropagation();
            this.modal = { kind: "confirm-delete", targetPath: node.path };
            this.render();
          },
        });

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

    renderNodes(filteredTree, 0);
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
    if (item.kind === "scene") {
      icon.appendChild(createIcon("clapperboard", 13));
    } else if (item.kind === "section") {
      icon.appendChild(createIcon("hash", 13));
    }
    if (icon.childElementCount > 0) {
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
    const found = this.foundGitHubRemote();
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
        githubTokenPresent: this.githubTokenPresent,
        githubAccount: this.githubAccount,
        hasRemote: this.gitRemotes.length > 0,
        githubRemote: found?.remote ?? null,
        githubRepo: found?.ref ?? null,
        githubBusy: this.githubBusy,
        githubError: this.githubError,
        githubPullRequests: this.githubPullRequests,
        githubPrLoading: this.githubPrLoading,
        currentBranch: this.gitStatus?.branch ?? null,
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
          this.openSettingsModal();
        },
        onConnectGitHub: () => this.openSettingsModal(),
        onPublishGitHub: () => this.openPublishModal(),
        onPushGitHub: () => void this.pushToGitHub(),
        onPullGitHub: () => void this.pullFromGitHub(),
        onCreatePullRequest: () => void this.openPullRequestModal(),
        onRefreshPullRequests: () => {
          void this.refreshGitHubPullRequests().then(() => this.render());
        },
        onOpenGitHubUrl: (url) => this.openGitHubUrl(url),
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
      const sidebar = this.rootEl.querySelector(
        ".sidebar",
      ) as HTMLElement | null;
      const startX = e.clientX;
      const startWidth = sidebar?.getBoundingClientRect().width ?? this.sidebarWidth;
      const onMove = (moveEvent: MouseEvent) => {
        const nextWidth = widthFromPointerDrag(
          startWidth,
          startX,
          moveEvent.clientX,
          180,
          480,
        );
        this.sidebarWidth = nextWidth;
        if (sidebar) {
          sidebar.style.width = `${nextWidth}px`;
        }
      };
      const onUp = () => {
        resizer.classList.remove("dragging");
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        this.persistWorkspaceState();
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    };
    return resizer;
  }

  private renderSessionResizer(): HTMLElement {
    const resizer = document.createElement("div");
    resizer.className = "session-resizer";
    resizer.onmousedown = (e) => {
      e.preventDefault();
      resizer.classList.add("dragging");
      const column = this.rootEl.querySelector(
        ".session-column",
      ) as HTMLElement | null;
      const startX = e.clientX;
      const startWidth = column?.getBoundingClientRect().width ?? this.sessionWidth;
      const onMove = (moveEvent: MouseEvent) => {
        const nextWidth = widthFromPointerDrag(
          startWidth,
          startX,
          moveEvent.clientX,
          320,
          640,
        );
        this.sessionWidth = nextWidth;
        if (column) {
          column.style.width = `${nextWidth}px`;
        }
      };
      const onUp = () => {
        resizer.classList.remove("dragging");
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        this.persistWorkspaceState();
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    };
    return resizer;
  }

  private renderSessionColumn(
    lang: AppSettings["language"],
    layout: WorkspaceLayout,
  ): HTMLElement {
    const column = document.createElement("section");
    column.className = "session-column";
    column.classList.toggle("full", layout.sessionFull);
    column.style.width = layout.sessionWidth;
    if (this.sessionView === "terminal" && this.folder) {
      const terminal = this.ensureTerminalPanel(lang);
      column.appendChild(terminal.element);
      terminal.focus();
      return column;
    }
    const panel = this.ensureChatPanel();
    panel.update(this.chatState, {
      language: lang,
      projectName: this.folder?.name ?? "",
    });
    column.appendChild(panel.element);
    return column;
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
        title.title = tab.untitled ? tab.name : tab.path;

        const gitBadge = gitBadges.get(tab.path);
        let badgeEl: HTMLSpanElement | null = null;
        if (gitBadge) {
          badgeEl = document.createElement("span");
          badgeEl.className = `tab-git-badge git-badge-${badgeClass(gitBadge)}`;
          badgeEl.textContent = gitBadge;
        }

        const dirtyDot = document.createElement("span");
        dirtyDot.className = "tab-dirty-dot";
        if (tab.externalChange) {
          dirtyDot.appendChild(createIcon("triangle-alert", 12));
        } else {
          dirtyDot.textContent =
            tab.untitled || isTabDirty(tab) ? "•" : "";
        }
        dirtyDot.classList.toggle("external", Boolean(tab.externalChange));
        dirtyDot.title = tab.externalChange
          ? t(lang, "externalChangeBadge")
          : "";

        const closeBtn = createIconButton({
          icon: "x",
          label: t(lang, "close"),
          className: "tab-close-btn",
          onClick: (e) => {
            e.stopPropagation();
            this.requestCloseTab(tab.path);
          },
        });

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
        !isUntitledTab(activeTab) &&
        this.gitStatus?.isRepository &&
        (gitEntry || tabDirty || activeTab.viewMode === "diff"),
    );
    const canDiscard = Boolean(
      activeTab && !isUntitledTab(activeTab) && (gitEntry || tabDirty),
    );

    if (activeTab) {
      col.appendChild(
        createDocumentHeader({
          tab: activeTab,
          language: lang,
          onTogglePreview: () => this.togglePreview(),
          onCopy: () => this.copyActiveDocument(),
          onSendSelection: () => this.sendSelectionToChat(),
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

    if (
      activeTab &&
      isFountainPath(activeTab.path) &&
      activeTab.viewMode === "preview"
    ) {
      surface.appendChild(renderFountainPreview(activeTab.content));
    } else if (activeTab && isMarkdownPath(activeTab.path) && activeTab.viewMode === "preview") {
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

  private sendSelectionToChat(): void {
    const active = this.getActiveTab();
    if (!active) return;
    const selection = this.editor?.getSelection() ?? "";
    if (!selection.trim()) {
      this.statusNotice = t(this.settings.language, "chatSelectionEmpty");
      this.render();
      return;
    }
    if (!this.chatVisible) {
      this.chatVisible = true;
      this.render();
    }
    const quoted = selection
      .trim()
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
    const contextLabel = active.untitled ? active.name : active.path;
    this.ensureChatPanel().appendDraft(
      `Contexto de \`${contextLabel}\`:\n${quoted}`,
    );
    this.persistWorkspaceState();
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
        console.error("Could not open the link", err);
        this.showStatusNotice(t(this.settings.language, "linkOpenError"));
      });
      return;
    }

    const resolved = resolveProjectLink(activeTab.path, href);
    if (resolved) {
      void this.openFileFromTree(resolved, true);
    }
  }

  private renderStatusbarDivider(): HTMLElement {
    const divider = document.createElement("span");
    divider.className = "statusbar-divider";
    divider.setAttribute("aria-hidden", "true");
    return divider;
  }

  private renderStatusbar(lang: AppSettings["language"], activeTab: OpenTab | null): HTMLElement {
    const bar = document.createElement("footer");
    bar.className = "statusbar";

    const left = document.createElement("div");
    left.className = "statusbar-left";

    if (this.folder) {
      const sidebarToggle = createIconButton({
        icon: "panel-left",
        label: t(lang, "toggleSidebar"),
        title: `${t(lang, "toggleSidebar")} (⌘⇧E)`,
        testId: "statusbar-toggle-sidebar",
        active: this.sidebarVisible,
        onClick: () => this.toggleSidebar(),
      });
      left.appendChild(sidebarToggle);
      left.appendChild(this.renderStatusbarDivider());

      const sections = this.renderSidebarSwitcher(lang);
      sections.classList.add("statusbar-sections");
      left.appendChild(sections);
      left.appendChild(this.renderStatusbarDivider());

      const terminalToggle = createIconButton({
        icon: "terminal",
        label: t(lang, "chatToggleTerminal"),
        testId: "toggle-terminal-btn",
        active: this.sessionView === "terminal",
        onClick: () => this.toggleTerminalView(),
      });
      left.appendChild(terminalToggle);

      if (this.gitStatus?.isRepository) {
        left.appendChild(this.renderStatusbarDivider());
        const branchSpan = document.createElement("span");
        branchSpan.className = "git-branch";
        const ahead = this.gitStatus.ahead > 0 ? ` ↑${this.gitStatus.ahead}` : "";
        const behind = this.gitStatus.behind > 0 ? ` ↓${this.gitStatus.behind}` : "";
        branchSpan.append(
          createIcon("git-branch", 12),
          document.createTextNode(
            `${this.gitStatus.branch ?? t(lang, "gitNoBranch")}${ahead}${behind}`,
          ),
        );
        left.appendChild(branchSpan);
      }
    }

    if (activeTab) {
      const pathSpan = document.createElement("span");
      pathSpan.textContent = activeTab.untitled
        ? t(lang, "untitledFileHint")
        : activeTab.path;
      left.appendChild(pathSpan);

      const dirtySpan = document.createElement("span");
      const dirty = activeTab.untitled || isTabDirty(activeTab);
      dirtySpan.className = `status-pill ${dirty ? "dirty" : "saved"}`;
      dirtySpan.append(
        createIcon(dirty ? "circle" : "check", 11),
        document.createTextNode(dirty ? ` ${t(lang, "unsaved")}` : ` ${t(lang, "saved")}`),
      );
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

  private renderManageModels(
    lang: AppSettings["language"],
    dialog: HTMLElement,
  ): void {
    if (this.modal.kind !== "manage-models") return;
    dialog.classList.add("manage-models-dialog");
    const hidden = new Set(this.settings.hiddenModels);

    const title = document.createElement("h3");
    title.textContent = t(lang, "chatModelsTitle");
    const hint = document.createElement("p");
    hint.className = "settings-hint";
    hint.textContent = t(lang, "chatModelsHint");

    const searchWrap = document.createElement("div");
    searchWrap.className = "manage-models-search-wrap";
    const searchIcon = document.createElement("span");
    searchIcon.className = "manage-models-search-icon";
    searchIcon.appendChild(createIcon("search", 14));
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.className = "manage-models-search";
    searchInput.dataset.testid = "manage-models-search";
    searchInput.placeholder = t(lang, "chatModelsSearch");
    searchInput.value = this.modal.search;
    searchWrap.append(searchIcon, searchInput);

    const list = document.createElement("div");
    list.className = "manage-models-list";

    const applyFilter = () => {
      const query = searchInput.value.trim().toLowerCase();
      for (const group of dialog.querySelectorAll<HTMLElement>(
        ".manage-models-group",
      )) {
        let visibleRows = 0;
        for (const row of group.querySelectorAll<HTMLElement>(
          ".manage-models-row",
        )) {
          const matches =
            !query || (row.dataset.search ?? "").includes(query);
          row.hidden = !matches;
          if (matches) visibleRows += 1;
        }
        group.hidden = visibleRows === 0;
      }
    };
    searchInput.oninput = () => {
      if (this.modal.kind === "manage-models") {
        this.modal = { ...this.modal, search: searchInput.value };
      }
      applyFilter();
    };

    if (this.chatModels.length === 0) {
      const empty = document.createElement("div");
      empty.className = "manage-models-empty";
      empty.textContent = t(lang, "chatModelsEmpty");
      list.appendChild(empty);
    } else {
      const byProvider = new Map<string, OpenCodeModel[]>();
      for (const model of this.chatModels) {
        const models = byProvider.get(model.providerId) ?? [];
        models.push(model);
        byProvider.set(model.providerId, models);
      }
      const active = this.activeChatSessionId
        ? this.chatSessions.get(this.activeChatSessionId)
        : undefined;
      const currentProvider = active?.model?.split("/")[0] ?? "opencode-go";
      const providers = [...byProvider.keys()].sort((a, b) => {
        if (a === currentProvider) return -1;
        if (b === currentProvider) return 1;
        if (a === "opencode-go") return -1;
        if (b === "opencode-go") return 1;
        return a.localeCompare(b);
      });
      for (const provider of providers) {
        const models = byProvider.get(provider)!;
        const group = document.createElement("div");
        group.className = "manage-models-group";
        const providerRow = document.createElement("div");
        providerRow.className = "manage-models-provider";
        const providerName = document.createElement("span");
        providerName.textContent = this.providerDisplayName(provider);
        const providerToggle = document.createElement("input");
        providerToggle.type = "checkbox";
        providerToggle.className = "manage-models-toggle";
        const keys = models.map((model) => `${provider}/${model.id}`);
        const hiddenCount = keys.filter((key) => hidden.has(key)).length;
        providerToggle.checked = hiddenCount < keys.length;
        providerToggle.indeterminate =
          hiddenCount > 0 && hiddenCount < keys.length;
        providerToggle.onchange = () =>
          void this.setModelVisibility(keys, providerToggle.checked);
        providerRow.append(providerName, providerToggle);
        group.appendChild(providerRow);

        for (const model of models) {
          const key = `${provider}/${model.id}`;
          const row = document.createElement("div");
          row.className = "manage-models-row";
          row.dataset.search = `${model.name} ${provider} ${model.id}`.toLowerCase();
          const name = document.createElement("span");
          name.className = "manage-models-name";
          name.textContent = model.name;
          const label = document.createElement("label");
          label.className = "manage-models-switch";
          const toggle = document.createElement("input");
          toggle.type = "checkbox";
          toggle.checked = !hidden.has(key);
          toggle.dataset.testid = `manage-model-${provider}-${model.id}`;
          toggle.onchange = () =>
            void this.setModelVisibility([key], toggle.checked);
          const track = document.createElement("span");
          track.className = "manage-models-track";
          label.append(toggle, track);
          row.append(name, label);
          group.appendChild(row);
        }
        list.appendChild(group);
      }
    }

    const footer = document.createElement("div");
    footer.className = "modal-footer";
    const closeBtn = document.createElement("button");
    closeBtn.className = "toolbar-btn primary";
    closeBtn.textContent = t(lang, "close");
    closeBtn.onclick = () => {
      this.modal =
        this.modal.kind === "manage-models" && this.modal.fromSettings
          ? { kind: "settings" }
          : { kind: "none" };
      this.render();
    };
    footer.appendChild(closeBtn);

    dialog.append(title, hint, searchWrap, list, footer);
    applyFilter();
    window.setTimeout(() => searchInput.focus(), 10);
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
      dialog.classList.add("settings-dialog");
      const panel = new SettingsPanel({
        language: lang,
        settings: this.settings,
        github: {
          account: this.githubAccount,
          tokenPresent: this.githubTokenPresent,
          busy: this.githubAccountBusy,
          error: this.githubAccountError,
          tokenDraft: this.githubTokenDraft,
        },
        byok: {
          providers: this.byokStatus,
          keyDrafts: this.byokKeyDrafts,
          busyId: this.byokBusyId,
          error: this.byokError,
        },
        initialCategory: this.settingsCategory,
        initialQuery: this.settingsQuery,
        modalError: this.modal.error,
        onCategoryChange: (category) => {
          this.settingsCategory = category;
        },
        onQueryChange: (query) => {
          this.settingsQuery = query;
        },
        onUpdateSettings: (patch) => void this.updateSettings(patch),
        onSaveGitAuthor: (name, email) => void this.saveGitAuthor(name, email),
        onGithubTokenDraft: (value) => {
          this.githubTokenDraft = value;
        },
        onConnectGithub: () => void this.connectGitHub(),
        onDisconnectGithub: () => void this.disconnectGitHub(),
        onOpenGithubTokenPage: () => this.openGitHubTokenPage(),
        onManageModels: () => this.openManageModels(true),
        onByokAdd: (draft) => void this.addByokProvider(draft),
        onByokRemove: (providerId) => void this.removeByokProvider(providerId),
        onByokKeyDraft: (providerId, value) => {
          this.byokKeyDrafts[providerId] = value;
        },
        onByokConnect: (providerId) => void this.saveByokKey(providerId),
        onByokDisconnect: (providerId) => void this.disconnectByok(providerId),
        onClose: () => this.closeModal(),
      });
      dialog.appendChild(panel.element);
    } else if (this.modal.kind === "manage-models") {
      this.renderManageModels(lang, dialog);
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
        modalState.mode === "new-folder"
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
        if (saved && this.tabState.activeTabPath) {
          this.performCloseTab(this.tabState.activeTabPath);
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
    } else if (this.modal.kind === "github-publish") {
      const modalState = this.modal;
      const h3 = document.createElement("h3");
      h3.textContent = t(lang, "githubPublishTitle");
      const p = document.createElement("p");
      p.textContent = t(lang, "githubPublishHint");

      const nameLabel = document.createElement("label");
      nameLabel.className = "form-label";
      nameLabel.textContent = t(lang, "githubRepoName");
      const nameInput = document.createElement("input");
      nameInput.className = "text-input";
      nameInput.dataset.testid = "github-repo-name";
      nameInput.value = modalState.name;
      nameInput.placeholder = t(lang, "githubRepoNamePlaceholder");
      nameInput.oninput = () => {
        if (this.modal.kind === "github-publish") {
          this.modal.name = nameInput.value;
        }
      };

      const descriptionLabel = document.createElement("label");
      descriptionLabel.className = "form-label";
      descriptionLabel.textContent = t(lang, "githubRepoDescription");
      const descriptionInput = document.createElement("textarea");
      descriptionInput.className = "text-input";
      descriptionInput.dataset.testid = "github-repo-description";
      descriptionInput.rows = 3;
      descriptionInput.value = modalState.description;
      descriptionInput.placeholder = t(lang, "githubRepoDescriptionPlaceholder");
      descriptionInput.oninput = () => {
        if (this.modal.kind === "github-publish") {
          this.modal.description = descriptionInput.value;
        }
      };

      const privateRow = document.createElement("div");
      privateRow.className = "form-row-inline";
      const privateLabel = document.createElement("label");
      privateLabel.className = "form-label";
      privateLabel.textContent = t(lang, "githubRepoPrivate");
      const privateCheck = document.createElement("input");
      privateCheck.type = "checkbox";
      privateCheck.dataset.testid = "github-repo-private";
      privateCheck.checked = modalState.isPrivate;
      privateCheck.onchange = () => {
        if (this.modal.kind === "github-publish") {
          this.modal.isPrivate = privateCheck.checked;
        }
      };
      privateRow.append(privateLabel, privateCheck);

      dialog.append(
        h3,
        p,
        nameLabel,
        nameInput,
        descriptionLabel,
        descriptionInput,
        privateRow,
      );
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

      const publishBtn = document.createElement("button");
      publishBtn.className = "toolbar-btn primary";
      publishBtn.dataset.testid = "github-publish-submit";
      publishBtn.disabled = Boolean(modalState.submitting);
      publishBtn.textContent = modalState.submitting
        ? t(lang, "githubPublishing")
        : t(lang, "githubPublishAction");
      publishBtn.onclick = () => void this.submitGitHubPublish();

      footer.append(cancelBtn, publishBtn);
      dialog.appendChild(footer);
      setTimeout(() => nameInput.focus(), 10);
    } else if (this.modal.kind === "github-pr") {
      const modalState = this.modal;
      const h3 = document.createElement("h3");
      h3.textContent = t(lang, "githubPrTitle");
      const p = document.createElement("p");
      p.textContent = t(lang, "githubPrHint");

      const titleLabel = document.createElement("label");
      titleLabel.className = "form-label";
      titleLabel.textContent = t(lang, "githubPrTitleLabel");
      const titleInput = document.createElement("input");
      titleInput.className = "text-input";
      titleInput.dataset.testid = "github-pr-title";
      titleInput.value = modalState.title;
      titleInput.placeholder = t(lang, "githubPrTitlePlaceholder");
      titleInput.oninput = () => {
        if (this.modal.kind === "github-pr") {
          this.modal.title = titleInput.value;
        }
      };

      const bodyLabel = document.createElement("label");
      bodyLabel.className = "form-label";
      bodyLabel.textContent = t(lang, "githubPrBodyLabel");
      const bodyInput = document.createElement("textarea");
      bodyInput.className = "text-input";
      bodyInput.dataset.testid = "github-pr-body";
      bodyInput.rows = 4;
      bodyInput.value = modalState.body;
      bodyInput.placeholder = t(lang, "githubPrBodyPlaceholder");
      bodyInput.oninput = () => {
        if (this.modal.kind === "github-pr") {
          this.modal.body = bodyInput.value;
        }
      };

      const baseRow = document.createElement("div");
      baseRow.className = "form-row";
      const baseLabel = document.createElement("label");
      baseLabel.className = "form-label";
      baseLabel.textContent = t(lang, "githubPrBaseLabel");
      const baseSelect = document.createElement("select");
      baseSelect.className = "select-input";
      baseSelect.dataset.testid = "github-pr-base";
      const options = modalState.branches.includes(modalState.base)
        ? modalState.branches
        : [modalState.base, ...modalState.branches];
      for (const branch of options) {
        const option = document.createElement("option");
        option.value = branch;
        option.textContent = branch;
        baseSelect.appendChild(option);
      }
      baseSelect.value = modalState.base;
      baseSelect.onchange = () => {
        if (this.modal.kind === "github-pr") {
          this.modal.base = baseSelect.value;
        }
      };
      baseRow.append(baseLabel, baseSelect);

      const headRow = document.createElement("div");
      headRow.className = "form-row";
      const headLabel = document.createElement("label");
      headLabel.className = "form-label";
      headLabel.textContent = t(lang, "githubPrHeadLabel");
      const headValue = document.createElement("div");
      headValue.className = "modal-hint";
      headValue.textContent = modalState.head;
      headRow.append(headLabel, headValue);

      dialog.append(h3, p, titleLabel, titleInput, bodyLabel, bodyInput, baseRow, headRow);
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
      createBtn.dataset.testid = "github-pr-submit";
      createBtn.disabled = Boolean(modalState.submitting);
      createBtn.textContent = modalState.submitting
        ? t(lang, "githubPrCreating")
        : t(lang, "githubPrCreate");
      createBtn.onclick = () => void this.submitPullRequest();

      footer.append(cancelBtn, createBtn);
      dialog.appendChild(footer);
      setTimeout(() => titleInput.focus(), 10);
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
