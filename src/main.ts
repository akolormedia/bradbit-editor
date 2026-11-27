import { backend, isTauriEnvironment } from "./backend";
import { BradbitCodeMirror } from "./editor/codemirror";
import { SearchBar, SearchBarQuery } from "./editor/searchBar";
import {
  buildSearchAiModelOptions,
  configuredSearchAiTarget,
  parseSearchAiModel,
  searchAiErrorKind,
  supportsSearchAi,
} from "./settings/searchAi";
import { BradbitDiffView, DiffViewMode } from "./editor/diff";
import { renderMarkdownPreview } from "./editor/preview";
import { renderFountainPreview } from "./editor/fountainPreview";
import { t, TranslationKey } from "./i18n";
import {
  AppSettings,
  ByokProviderKind,
  ByokProviderStatus,
  ByokTestResult,
  FileTreeNode,
  FolderPdfError,
  FsChangeEvent,
  GitBranch,
  GitCommit,
  GitCommitFile,
  GitBlameLine,
  GitFileChange,
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
  WelcomeProjectRequest,
  WelcomeTemplate,
} from "./types";
import { copyTextToClipboard } from "./workspace/clipboard";
import { createDocumentHeader } from "./workspace/documentHeader";
import { badgeClass, buildGitBadgeMap } from "./git/status";
import {
  gitignorePattern,
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
import {
  createVersionSidebar,
  VersionSidebarView,
} from "./workspace/versionSidebar";
import {
  createVersionChangesView,
  VersionDiffState,
} from "./workspace/versionChangesView";
import {
  isEntryStaged,
  VersionFilter,
} from "./workspace/versionChanges";
import { versionTerm } from "./workspace/versionTerms";
import {
  isProjectSearchPath,
  openProjectSearchInTabs,
  PROJECT_SEARCH_PATH,
  projectSearchSummary,
  replaceSearchInText,
  replaceSearchInTextAtLine,
} from "./workspace/projectSearch";
import { ProjectSearchView } from "./workspace/projectSearchView";
import { ChatPanel, ChatScrollState } from "./session/chatPanel";
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
import {
  toolFileActivity,
  ToolFileActivity,
} from "./session/toolFiles";
import { matchesKitCommand } from "./kit/localize";
import { configFilesVisible, effectiveGitAuthor } from "./settings/developer";
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
import {
  ConnectModelDraft,
  ConnectModelPanel,
} from "./settings/connectModel";
import { AppMenu } from "./ui/appMenu";
import { openContextMenu, type ContextMenuItem } from "./ui/contextMenu";
import { convertDocxToMarkdown, type DocxImportWarning } from "./import/docx";
import { folderPdfErrorCopy } from "./export/folderPdfError";
import { createIcon } from "./ui/icons";
import {
  filterChatModelsByKeys,
  parseChatModelSelection,
} from "./session/chatModels";
import { filterWelcomeProjects } from "./welcome/welcomeProjects";
import {
  welcomeTemplateLabel,
  welcomeTemplateSourceLabel,
} from "./welcome/templates";
import {
  validateWelcomeDraft,
  WelcomeDraft,
  welcomeDraftFromRequest,
  welcomeDraftPreview,
} from "./welcome/projectDraft";
import { renderWelcomeProjectForm } from "./welcome/projectDraftForm";
import {
  buildProjectHandoff,
  ProjectHandoff,
} from "./welcome/handoff";
import { createIconButton } from "./ui/iconButton";
import { createFountainToolbar } from "./editor/fountainToolbar";
import {
  matchesAnyGlob,
  matchesAnySource,
  parseContributionManifest,
  symbolSourcesForLanguage,
  SymbolSourceContribution,
} from "./contributions/manifest";
import {
  loadSymbolIndex,
  symbolNames,
  SymbolIndex,
} from "./symbols";
import { FountainSymbols } from "./editor/fountainSymbols";
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
  | {
      kind: "connect-model";
      initialKind?: ByokProviderKind;
      fromSettings?: boolean;
    }
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
  | {
      kind: "import-docx";
      status: "loading" | "ready" | "error";
      sourceName: string;
      markdown?: string;
      warnings?: DocxImportWarning[];
      images?: number;
      tables?: number;
      headings?: number;
      words?: number;
      previewMode?: "rendered" | "source";
      error?: string;
    }
  | {
      kind: "import-fdx";
      status: "loading" | "ready" | "error";
      sourceName: string;
      fountain?: string;
      previewMode?: "rendered" | "source";
      error?: string;
    }
  | { kind: "folder-pdf-error"; error: FolderPdfError }
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
  | { kind: "confirm-unsaved"; tabPath: string; tabName: string }
  | { kind: "confirm-project-replace"; replacement: string };

/** Shortcuts owned by the native menu when running inside Tauri. */
const NATIVE_MENU_KEYS = new Set(["b", "i", "s", "o", "n", "w", ",", "f"]);

function isNativeMenuShortcut(key: string, _shift: boolean, alt: boolean): boolean {
  if (key === "e") return true;
  if (key === "p") return true;
  if (key === "g" && alt) return true;
  return NATIVE_MENU_KEYS.has(key);
}

function isFolderPdfError(value: unknown): value is FolderPdfError {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as {
    code?: unknown;
    message?: unknown;
    markdown?: unknown;
    fountain?: unknown;
  };
  return (
    typeof candidate.code === "string" &&
    typeof candidate.message === "string" &&
    typeof candidate.markdown === "number" &&
    typeof candidate.fountain === "number" &&
    ["empty", "mixed", "invalidPath", "io"].includes(candidate.code)
  );
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
  private importDocxRequest = 0;
  private importFdxRequest = 0;
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
  private versionView: VersionSidebarView = "changes";
  private versionFilter: VersionFilter = "all";
  private versionSelectedPath: string | null = null;
  private versionStats: Record<string, GitFileChange> = {};
  private versionDiffs: Record<string, VersionDiffState | undefined> = {};
  private versionExpanded = new Set<string>();
  private versionOpen = false;
  private versionGeneratingMessage = false;
  private gitBusy = false;
  private gitHistoryLoading = false;
  private gitPanelError = "";
  private gitRemotes: GitRemote[] = [];
  private inlineDiffOriginals = new Map<string, string | null>();
  private inlineDiffLoading = new Set<string>();
  private gitHeadId: string | null = null;
  private inlineBlameEnabled = false;
  private diffAgainstDefaultBranch = false;
  private blameByPath = new Map<string, GitBlameLine[]>();
  private blameLoading = new Set<string>();
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
  private liveToolFile: { toolId: string; path: string } | null = null;
  private welcomeChatState: ChatState = { ...initialChatState };
  private welcomeChatPanel: ChatPanel | null = null;
  private welcomeSessionId: string | null = null;
  private welcomeWorkspacePath: string | null = null;
  private welcomeDestination = "";
  private welcomeTemplates: WelcomeTemplate[] = [];
  private welcomeModels: OpenCodeModel[] = [];
  private welcomeUnlisten: (() => void) | null = null;
  private welcomeGeneration = 0;
  private welcomeStatusEl: HTMLElement | null = null;
  private welcomeStatusTextEl: HTMLElement | null = null;
  private welcomeLocationEl: HTMLButtonElement | null = null;
  private welcomeLocationLabelEl: HTMLElement | null = null;
  private welcomeSwitcherOpen = false;
  private welcomeSwitcherQuery = "";
  private welcomeTemplateId = "";
  private welcomeTemplatePickerOpen = false;
  private welcomeTemplatePromptDismissed = false;
  private welcomeDestinationPicked = false;
  private welcomeDestinationQuestion = false;
  private welcomeDestinationAnswered = false;
  private welcomeRequest: WelcomeProjectRequest | null = null;
  private welcomeRequestSignature = "";
  private welcomeDraft: WelcomeDraft | null = null;
  private welcomeProjectOpen = false;
  private pendingProjectHandoff: ProjectHandoff | null = null;
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
    inlineBlame: false,
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
  private diffViewMode: DiffViewMode = "split";
  private diffData: { path: string; original: string; isNew: boolean } | null = null;
  private diffLoadingPath: string | null = null;
  private editor: BradbitCodeMirror | null = null;
  private symbolSources: SymbolSourceContribution[] = [];
  private symbolIndex: SymbolIndex = new Map();
  private primaryPaths: string[] = [];
  private treeScrollTop = 0;
  private openingSurface: "chat" | "editor" | null = null;
  private layoutAnimating = false;
  private bufferSearchOpen = false;
  private bufferSearchBar: SearchBar | null = null;
  private bufferSearchPath: string | null = null;
  private bufferSearchPending = false;
  private projectSearchBar: SearchBar | null = null;
  private projectSearchView: ProjectSearchView | null = null;
  private projectSearchQuery: SearchBarQuery = {
    search: "",
    caseSensitive: false,
    wholeWord: false,
    regexp: false,
  };
  private projectSearchResults: SearchMatch[] = [];
  private projectSearchLoading = false;
  private projectSearchError = "";
  private projectSearchGeneration = 0;
  private projectSearchTimer: number | null = null;

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
    this.stopWelcomeChat();
    void this.stopChatSession();
    this.stopTerminalSession();
    this.chatPanel = null;
    this.folder = null;
    this.symbolSources = [];
    this.symbolIndex = new Map();
    this.primaryPaths = [];
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
    this.resetVersionWorkspace();
    this.resetProjectSearch();
    this.inlineDiffOriginals.clear();
    this.inlineDiffLoading.clear();
    this.gitHeadId = null;
    this.inlineBlameEnabled = false;
    this.blameByPath.clear();
    this.blameLoading.clear();
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
      const opened = await backend.openFolder(path, configFilesVisible(this.settings));
      this.stopWelcomeChat();
      await this.stopChatSession();
      this.stopTerminalSession();
      this.chatPanel = null;
      this.folder = opened;
      this.symbolSources = [];
      this.symbolIndex = new Map();
      this.primaryPaths = [];
      this.kitCatalog = { agents: [], commands: GENERAL_COMMANDS, skills: [] };
      try {
        this.workspaceState = await backend.loadWorkspaceState(opened.rootPath);
        this.applyWorkspaceLayout(this.workspaceState.layout);
        this.inlineBlameEnabled = this.workspaceState.inlineBlame;
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
          inlineBlame: false,
        };
        this.applyWorkspaceLayout(this.workspaceState.layout);
        this.inlineBlameEnabled = false;
      }
      this.tabState = { tabs: [], activeTabPath: null };
      this.resetVersionWorkspace();
      this.untitledSequence = 0;
      this.collapsedDirs.clear();
      this.fileFilter = "";
      this.treeScrollTop = 0;
      this.gitHistory = [];
      this.gitBranches = [];
      this.gitCommitMessage = "";
      this.gitExpandedCommitId = null;
      this.gitCommitFiles = {};
      this.gitPanelError = "";
      this.gitRemotes = [];
      this.inlineDiffOriginals.clear();
      this.inlineDiffLoading.clear();
      this.gitHeadId = null;
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
      await this.refreshProjectContributions();
      await this.refreshGitStatus();
      await this.refreshGitMeta();
      this.render();
      void this.startChatSession();
    } catch (err) {
      this.statusNotice = err instanceof Error ? err.message : String(err);
      this.render();
    }
  }

  private resetVersionWorkspace(): void {
    this.versionView = "changes";
    this.versionFilter = "all";
    this.versionSelectedPath = null;
    this.versionStats = {};
    this.versionDiffs = {};
    this.versionExpanded.clear();
    this.versionOpen = false;
    this.versionGeneratingMessage = false;
  }

  private async refreshTree(): Promise<void> {
    if (!this.folder) return;
    const tree = await backend.listDirectoryTree(
      this.folder.rootPath,
      configFilesVisible(this.settings),
    );
    this.folder = {
      ...this.folder,
      tree,
    };
    await this.refreshGitStatus();
  }

  private async refreshProjectContributions(): Promise<void> {
    this.symbolSources = [];
    this.symbolIndex = new Map();
    this.primaryPaths = [];
    if (!this.folder || !isTauriEnvironment()) return;
    const root = this.folder.rootPath;
    try {
      const raw = await backend.readTextFile(root, "bradbit-kit.json");
      const manifest = parseContributionManifest(raw);
      this.symbolSources = symbolSourcesForLanguage(manifest, "fountain");
      this.primaryPaths = manifest?.contributes?.primaryPaths ?? [];
    } catch {
      this.symbolSources = [];
      this.primaryPaths = [];
    }
    if (this.folder?.rootPath !== root) return;
    await this.refreshProjectSymbols();
  }

  private async refreshProjectSymbols(): Promise<void> {
    if (!this.folder || !isTauriEnvironment() || this.symbolSources.length === 0) {
      this.symbolIndex = new Map();
      return;
    }
    const root = this.folder.rootPath;
    const index = await loadSymbolIndex(
      this.folder.tree,
      this.symbolSources,
      (path) => backend.readTextFile(root, path),
    );
    if (this.folder?.rootPath !== root) return;
    this.symbolIndex = index;
  }

  private getFountainSymbols(): FountainSymbols {
    return {
      characters: symbolNames(this.symbolIndex, "character"),
      locations: symbolNames(this.symbolIndex, "location"),
    };
  }

  private async refreshGitStatus(): Promise<void> {
    if (!this.folder || !isTauriEnvironment()) {
      this.gitStatus = null;
      this.gitHeadId = null;
      this.inlineDiffOriginals.clear();
      this.inlineDiffLoading.clear();
      this.editor?.clearGitOriginals();
      return;
    }
    try {
      const status = await backend.gitStatus(this.folder.rootPath);
      this.gitStatus = status;
      this.syncInlineDiffCache(status);
    } catch (err) {
      console.error("Could not read the Git status", err);
      this.gitStatus = null;
      this.gitHeadId = null;
      this.inlineDiffOriginals.clear();
      this.inlineDiffLoading.clear();
      this.editor?.clearGitOriginals();
    }
  }

  /**
   * Keeps cached HEAD blobs in sync with the repository: a changed HEAD
   * invalidates every baseline, and files that are no longer modified stop
   * showing inline change markers.
   */
  private syncInlineDiffCache(status: GitStatus): void {
    const headChanged =
      this.gitHeadId !== null && status.head !== this.gitHeadId;
    this.gitHeadId = status.head;
    if (!status.isRepository) {
      this.inlineDiffOriginals.clear();
      this.inlineDiffLoading.clear();
      this.editor?.clearGitOriginals();
      return;
    }

    const changed = new Set(status.entries.map((entry) => entry.path));
    if (headChanged) {
      this.inlineDiffOriginals.clear();
      this.inlineDiffLoading.clear();
      this.blameByPath.clear();
      this.editor?.clearGitOriginals();
    } else {
      for (const [path, original] of [...this.inlineDiffOriginals]) {
        // A committed baseline stays useful for clean tracked files: the
        // writer may edit without saving and still deserves live markers.
        if (changed.has(path) || original !== null) continue;
        this.inlineDiffOriginals.delete(path);
        this.editor?.setGitOriginal(path, undefined);
      }
    }
  }

  private defaultBranchName(): string | null {
    const names = this.gitBranches.map((branch) => branch.name);
    return (
      ["main", "master"].find((name) => names.includes(name)) ??
      this.gitStatus?.branch ??
      names[0] ??
      null
    );
  }

  private async loadBaseline(
    root: string,
    path: string,
  ): Promise<string | null> {
    if (this.diffAgainstDefaultBranch) {
      const branch = this.defaultBranchName();
      if (branch) return backend.gitBranchFile(root, branch, path);
    }
    return backend.gitHeadFile(root, path);
  }

  private toggleDiffAgainstDefaultBranch(): void {
    this.diffAgainstDefaultBranch = !this.diffAgainstDefaultBranch;
    this.inlineDiffOriginals.clear();
    this.editor?.clearGitOriginals();
    this.diffData = null;
    this.destroyDiffView();
    this.render();
  }

  private syncInlineDiff(tab: OpenTab | null): void {
    if (!this.editor) return;
    if (
      !tab ||
      !this.folder ||
      tab.untitled ||
      !this.gitStatus?.isRepository
    ) {
      if (tab) this.editor.setGitOriginal(tab.path, undefined);
      return;
    }

    if (this.inlineDiffOriginals.has(tab.path)) {
      this.editor.setGitOriginal(
        tab.path,
        this.inlineDiffOriginals.get(tab.path) ?? null,
      );
      return;
    }
    if (this.inlineDiffLoading.has(tab.path)) return;

    const root = this.folder.rootPath;
    this.inlineDiffLoading.add(tab.path);
    void this.loadBaseline(root, tab.path)
      .then((original) => {
        if (this.folder?.rootPath !== root) return;
        const trackedChange = this.gitStatus?.entries.some(
          (entry) => entry.path === tab.path,
        );
        if (
          original === null &&
          !trackedChange &&
          !this.diffAgainstDefaultBranch
        ) {
          // Ignored or untracked-without-status files have no baseline.
          this.inlineDiffOriginals.delete(tab.path);
          this.editor?.setGitOriginal(tab.path, undefined);
          return;
        }
        this.inlineDiffOriginals.set(tab.path, original);
        if (this.getActiveTab()?.path === tab.path) {
          this.editor?.setGitOriginal(tab.path, original);
        }
      })
      .catch((err) => {
        console.error("Could not load the committed version", err);
      })
      .finally(() => {
        this.inlineDiffLoading.delete(tab.path);
      });
  }

  private syncInlineBlame(tab: OpenTab | null): void {
    if (!this.editor) return;
    this.editor.setInlineBlameEnabled(this.inlineBlameEnabled);
    if (
      !this.inlineBlameEnabled ||
      !tab ||
      !this.folder ||
      tab.untitled ||
      !this.gitStatus?.isRepository ||
      isTabDirty(tab)
    ) {
      this.editor.setInlineBlame([]);
      return;
    }
    if (this.blameByPath.has(tab.path)) {
      this.editor.setInlineBlame(this.blameByPath.get(tab.path) ?? []);
      return;
    }
    if (this.blameLoading.has(tab.path)) return;

    const root = this.folder.rootPath;
    this.blameLoading.add(tab.path);
    void backend
      .gitBlameFile(root, tab.path)
      .then((lines) => {
        if (this.folder?.rootPath !== root) return;
        this.blameByPath.set(tab.path, lines);
        if (
          this.getActiveTab()?.path === tab.path &&
          this.inlineBlameEnabled &&
          !isTabDirty(this.getActiveTab()!)
        ) {
          this.editor?.setInlineBlame(lines);
        }
      })
      .catch((err) => {
        console.error("Could not load Git blame", err);
      })
      .finally(() => {
        this.blameLoading.delete(tab.path);
      });
  }

  private toggleInlineBlame(): void {
    this.inlineBlameEnabled = !this.inlineBlameEnabled;
    this.persistWorkspaceState();
    this.syncInlineBlame(this.getActiveTab());
    this.render();
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
    await this.refreshVersionStats();
    await this.ensureGitHubAccount();
    await this.refreshGitHubPullRequests();
    this.render();
  }

  private async refreshVersionStats(): Promise<void> {
    if (!this.folder || !this.gitStatus?.isRepository) {
      this.versionStats = {};
      return;
    }
    try {
      const stats = await backend.gitDiffStats(this.folder.rootPath, "all");
      this.versionStats = Object.fromEntries(
        stats.map((stat) => [stat.path, stat]),
      );
    } catch (err) {
      console.error("Could not read the Git change stats", err);
    }
  }

  private versionScrollPositions(): { sidebar: number; list: number } {
    return {
      sidebar:
        this.rootEl.querySelector<HTMLElement>(".version-sidebar-body")
          ?.scrollTop ?? 0,
      list:
        this.rootEl.querySelector<HTMLElement>(".version-file-list")
          ?.scrollTop ?? 0,
    };
  }

  private restoreVersionScroll(position: { sidebar: number; list: number }): void {
    const sidebar = this.rootEl.querySelector<HTMLElement>(".version-sidebar-body");
    if (sidebar) sidebar.scrollTop = position.sidebar;
    const list = this.rootEl.querySelector<HTMLElement>(".version-file-list");
    if (list) list.scrollTop = position.list;
  }

  private renderVersionPreservingScroll(): void {
    const position = this.versionScrollPositions();
    this.render();
    this.restoreVersionScroll(position);
  }

  private scrollVersionCardIntoView(path: string): void {
    const list = this.rootEl.querySelector<HTMLElement>(".version-file-list");
    const card = [...this.rootEl.querySelectorAll<HTMLElement>(".version-file-card")].find(
      (element) => element.dataset.versionFile === path,
    );
    if (!list || !card) return;
    const listRect = list.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    if (cardRect.top < listRect.top) {
      list.scrollTop -= listRect.top - cardRect.top;
    } else if (cardRect.bottom > listRect.bottom) {
      list.scrollTop += cardRect.bottom - listRect.bottom;
    }
  }

  private async loadVersionDiff(path: string, render = true): Promise<void> {
    if (!this.folder) return;
    const root = this.folder.rootPath;
    const current = this.versionDiffs[path];
    if (current && current.status !== "error") return;

    this.versionDiffs = {
      ...this.versionDiffs,
      [path]: { status: "loading" },
    };
    if (this.versionOpen && render) this.renderVersionPreservingScroll();

    try {
      const patch = await backend.gitDiffFile(root, path);
      if (!this.folder || this.folder.rootPath !== root) return;
      this.versionDiffs = {
        ...this.versionDiffs,
        [path]: { status: "ready", patch },
      };
    } catch (err) {
      if (!this.folder || this.folder.rootPath !== root) return;
      this.versionDiffs = {
        ...this.versionDiffs,
        [path]: {
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
    if (this.versionOpen && render) this.renderVersionPreservingScroll();
  }

  private openVersionChanges(path?: string): void {
    this.versionOpen = true;
    this.editorVisible = true;
    this.versionView = "changes";
    this.sidebarVisible = true;
    this.sidebarTab = "versions";
    const entries = this.gitStatus?.entries ?? [];
    const selection =
      path ??
      (this.versionSelectedPath &&
      entries.some((entry) => entry.path === this.versionSelectedPath)
        ? this.versionSelectedPath
        : entries[0]?.path);
    if (selection) {
      this.versionSelectedPath = selection;
      this.versionExpanded.clear();
      this.versionExpanded.add(selection);
    }
    this.renderVersionPreservingScroll();
    if (selection) {
      void this.loadVersionDiff(selection);
      this.scrollVersionCardIntoView(selection);
    }
    void this.refreshVersionStats().then(() => {
      if (this.versionOpen) this.renderVersionPreservingScroll();
    });
  }

  private closeVersionChanges(): void {
    if (!this.versionOpen) return;
    this.versionOpen = false;
    this.render();
  }

  private selectVersionChange(path: string): void {
    this.versionOpen = true;
    this.editorVisible = true;
    this.versionView = "changes";
    this.sidebarVisible = true;
    this.sidebarTab = "versions";
    this.versionSelectedPath = path;
    this.versionExpanded.clear();
    this.versionExpanded.add(path);
    this.renderVersionPreservingScroll();
    this.scrollVersionCardIntoView(path);
    void this.loadVersionDiff(path);
  }

  private toggleVersionChange(path: string): void {
    const expanded = this.versionExpanded.has(path);
    if (expanded) {
      this.versionExpanded.delete(path);
    } else {
      this.versionExpanded.clear();
      this.versionExpanded.add(path);
    }
    this.versionSelectedPath = path;
    this.versionOpen = true;
    this.editorVisible = true;
    this.renderVersionPreservingScroll();
    if (!expanded) {
      void this.loadVersionDiff(path);
      this.scrollVersionCardIntoView(path);
    }
  }

  private async toggleVersionStage(path: string): Promise<void> {
    const entry = this.gitStatus?.entries.find((item) => item.path === path);
    if (!entry) return;
    await this.stageVersionPaths([path], !isEntryStaged(entry));
  }

  private async stageVersionPaths(
    paths: string[],
    stage: boolean,
  ): Promise<void> {
    if (!this.folder || this.gitBusy || paths.length === 0) return;
    this.gitBusy = true;
    this.gitPanelError = "";
    try {
      this.gitStatus = stage
        ? await backend.gitStage(this.folder.rootPath, paths)
        : await backend.gitUnstage(this.folder.rootPath, paths);
      await this.refreshVersionStats();
    } catch (err) {
      this.gitPanelError = err instanceof Error ? err.message : String(err);
    } finally {
      this.gitBusy = false;
      this.renderVersionPreservingScroll();
    }
  }

  private async stageAllVersions(): Promise<void> {
    if (!this.folder || this.gitBusy) return;
    this.gitBusy = true;
    this.gitPanelError = "";
    try {
      this.gitStatus = await backend.gitStageAll(this.folder.rootPath);
      await this.refreshVersionStats();
    } catch (err) {
      this.gitPanelError = err instanceof Error ? err.message : String(err);
    } finally {
      this.gitBusy = false;
      this.renderVersionPreservingScroll();
    }
  }

  private async unstageAllVersions(): Promise<void> {
    if (!this.folder || this.gitBusy) return;
    this.gitBusy = true;
    this.gitPanelError = "";
    try {
      this.gitStatus = await backend.gitUnstageAll(this.folder.rootPath);
      await this.refreshVersionStats();
    } catch (err) {
      this.gitPanelError = err instanceof Error ? err.message : String(err);
    } finally {
      this.gitBusy = false;
      this.renderVersionPreservingScroll();
    }
  }

  private pickAiTarget(
    chatModel: string,
  ): { providerId: string; model: string } | { error: "key" | "model" } {
    let provider = this.byokStatus.find(
      (item) => item.hasKey && supportsSearchAi(item.kind),
    );
    if (!provider) return { error: "key" };

    const chat = parseSearchAiModel(chatModel);
    if (chat) {
      const match = this.byokStatus.find(
        (item) =>
          item.id === chat.providerId &&
          item.hasKey &&
          supportsSearchAi(item.kind),
      );
      if (match) provider = match;
    }
    const selectedModel =
      chat && provider.id === chat.providerId && !/\s/.test(chat.model)
        ? chat.model
        : "";
    const model =
      selectedModel ||
      provider.model ||
      this.chatModels.find((item) => item.providerId === provider.id)?.id ||
      "";
    if (!model) return { error: "model" };
    return { providerId: provider.id, model };
  }

  private defaultAiTarget():
    | { providerId: string; model: string }
    | { error: "key" | "model" } {
    return this.pickAiTarget(
      this.chatState.model ?? this.settings.recentModels[0] ?? "",
    );
  }

  private defaultSearchAiModelLabel(): string {
    const target = this.defaultAiTarget();
    if ("error" in target) return "";
    const provider = this.byokStatus.find(
      (item) => item.id === target.providerId,
    );
    const model = this.chatModels.find(
      (item) =>
        item.providerId === target.providerId && item.id === target.model,
    );
    return `${provider?.name ?? target.providerId} · ${
      model?.name ?? target.model
    }`;
  }

  private async resolveAiTarget(): Promise<
    { providerId: string; model: string } | { error: "key" | "model" }
  > {
    await this.refreshByokStatus();
    return this.defaultAiTarget();
  }

  private async resolveSearchAiTarget(): Promise<
    { providerId: string; model: string } | { error: "key" | "model" }
  > {
    await this.refreshByokStatus();
    return (
      configuredSearchAiTarget(
        this.settings.searchAiModel,
        this.byokStatus,
      ) ?? this.defaultAiTarget()
    );
  }

  private async generateVersionMessage(): Promise<void> {
    if (!this.folder || this.versionGeneratingMessage) return;
    const lang = this.settings.language;
    const target = await this.resolveAiTarget();
    if ("error" in target) {
      if (target.error === "key") {
        this.statusNotice = this.versionLabel("versionGenerateUnavailable");
        this.openSettingsModal();
      } else {
        this.gitPanelError = this.versionLabel("versionGenerateNoModel");
        this.renderVersionPreservingScroll();
      }
      return;
    }

    this.versionGeneratingMessage = true;
    this.gitPanelError = "";
    this.renderVersionPreservingScroll();
    try {
      const prompt = await this.versionNotesPrompt(lang);
      const message = await backend.byokComplete(
        target.providerId,
        prompt,
        target.model,
      );
      this.gitCommitMessage = message
        .trim()
        .replace(/^```[a-z]*\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();
    } catch (err) {
      this.gitPanelError = `${this.versionLabel("versionGenerateError")} ${
        err instanceof Error ? err.message : String(err)
      }`;
    } finally {
      this.versionGeneratingMessage = false;
      this.renderVersionPreservingScroll();
      this.focusVersionComposer();
    }
  }

  private async versionNotesPrompt(
    lang: AppSettings["language"],
  ): Promise<string> {
    if (!this.folder) return "";
    const root = this.folder.rootPath;
    const allEntries = this.gitStatus?.entries ?? [];
    const stagedEntries = allEntries.filter(isEntryStaged);
    const entries = stagedEntries.length > 0 ? stagedEntries : allEntries;
    const sections: string[] = [];
    for (const entry of entries.slice(0, 16)) {
      const stat = this.versionStats[entry.path];
      const counters = stat ? ` (+${stat.added} -${stat.removed})` : "";
      sections.push(`- ${entry.path}${counters}`);
      try {
        const patch = await backend.gitDiffFile(root, entry.path);
        if (patch.trim()) sections.push(patch.slice(0, 3000));
      } catch {
        // Binary or unreadable files only contribute their name and counters.
      }
      if (sections.join("\n").length > 12000) break;
    }
    const language = lang === "en" ? "English" : "Spanish";
    return [
      `Write a Git version message in ${language} for these changes.`,
      "Use a writer's voice, not developer jargon.",
      "Return only the message: a first line of at most 72 characters, then optionally a blank line and 2-3 short bullets with useful context.",
      "Do not include code fences, quotes, headings or explanations.",
      "",
      "Changes:",
      sections.join("\n").slice(0, 12000),
    ].join("\n");
  }

  private focusVersionComposer(): void {
    const input = this.rootEl.querySelector<HTMLTextAreaElement>(
      '[data-testid="version-message"]',
    );
    input?.focus({ preventScroll: true });
  }

  private versionLabel(
    key: TranslationKey,
    vars?: Record<string, string>,
  ): string {
    return versionTerm(
      this.settings.language,
      this.settings.gitDeveloperTerms && this.settings.showDeveloperOptions,
      key,
      vars,
    );
  }

  private primaryRemoteName(): string | null {
    return (
      this.foundGitHubRemote()?.remote.name ??
      this.gitRemotes[0]?.name ??
      null
    );
  }

  private showVersionFileMenu(path: string, event: MouseEvent): void {
    const lang = this.settings.language;
    const items: ContextMenuItem[] = [
      {
        id: "version-open-file",
        label: this.versionLabel("versionOpenFile"),
        icon: "file",
        action: () => {
          this.versionOpen = false;
          this.render();
          void this.openFileFromTree(path, true);
        },
      },
      { id: "version-open-separator", label: "", separator: true },
      {
        id: "version-discard-file",
        label: t(lang, "discardChangesTitle"),
        icon: "rotate-ccw",
        danger: true,
        action: () => this.requestDiscardPath(path),
      },
      {
        id: "version-ignore-file",
        label: t(lang, "ignoreFile"),
        icon: "slash",
        action: () => void this.ignoreVersionFile(path),
      },
      { id: "version-file-separator", label: "", separator: true },
      {
        id: "version-reveal-file",
        label: t(lang, "revealInFinder"),
        icon: "external-link",
        action: () => {
          if (!this.folder) return;
          void backend
            .revealInFinder(this.folder.rootPath, path)
            .catch((error) => {
              console.error("Could not reveal the file", error);
              this.showStatusNotice(t(lang, "revealError"));
            });
        },
      },
      {
        id: "version-copy-path",
        label: t(lang, "copyPath"),
        icon: "copy",
        action: () => {
          void copyTextToClipboard(path).then((copied) => {
            this.showStatusNotice(t(lang, copied ? "pathCopied" : "copyError"));
          });
        },
      },
    ];
    openContextMenu({
      x: event.clientX,
      y: event.clientY,
      items,
      label: path,
    });
  }

  private async ignoreVersionFile(path: string): Promise<void> {
    if (!this.folder) return;
    const root = this.folder.rootPath;
    const lang = this.settings.language;
    try {
      let content = "";
      try {
        content = await backend.readTextFile(root, ".gitignore");
      } catch {
        content = "";
      }
      const normalized = content.replace(/\r\n/g, "\n");
      const pattern = gitignorePattern(path);
      const lines = normalized.split("\n").map((line) => line.trim());
      if (lines.includes(pattern) || lines.includes(pattern.slice(1))) {
        this.statusNotice = t(lang, "fileAlreadyIgnored", { path });
      } else {
        const prefix =
          normalized.length > 0 && !normalized.endsWith("\n") ? "\n" : "";
        await backend.writeTextFile(
          root,
          ".gitignore",
          `${normalized}${prefix}${pattern}\n`,
        );
        this.statusNotice = t(lang, "fileIgnored", { path });
      }
      await this.refreshTree();
      await this.refreshGitStatus();
      await this.refreshVersionStats();
      const stillListed = this.gitStatus?.entries.some(
        (entry) => entry.path === path,
      );
      if (stillListed) {
        this.statusNotice = t(lang, "fileIgnoreTracked");
      } else {
        this.versionExpanded.delete(path);
        if (this.versionSelectedPath === path) {
          this.versionSelectedPath = null;
        }
      }
      this.render();
    } catch (err) {
      this.statusNotice = t(lang, "ignoreFileError");
      this.gitPanelError = err instanceof Error ? err.message : String(err);
      this.render();
    }
  }

  private showVersionBranchMenu(event: MouseEvent): void {
    const lang = this.settings.language;
    const remote = this.primaryRemoteName();
    const branch = this.gitStatus?.branch ?? null;
    const otherRemotes = this.gitRemotes
      .map((item) => item.name)
      .filter((name) => name !== remote);
    const items: ContextMenuItem[] = [
      {
        id: "version-fetch",
        label: this.versionLabel("versionFetch"),
        icon: "arrow-down",
        shortcut: "git fetch",
        disabled: !remote,
        action: () => void this.fetchVersionRemote(),
      },
      ...otherRemotes.map(
        (name): ContextMenuItem => ({
          id: `version-fetch-${name}`,
          label: `${this.versionLabel("versionFetchFrom")} ${name}`,
          icon: "arrow-down",
          action: () => void this.fetchVersionRemote(name),
        }),
      ),
      {
        id: "version-pull",
        label: this.versionLabel("versionPull"),
        icon: "arrow-down",
        shortcut: "git pull",
        disabled: !remote || !branch,
        action: () => void this.pullVersionRemote(),
      },
      { id: "version-sync-separator", label: "", separator: true },
      {
        id: "version-push",
        label: this.versionLabel("versionPush"),
        icon: "arrow-up",
        shortcut: "git push",
        disabled: !remote || !branch,
        action: () => void this.pushVersionRemote(),
      },
      ...otherRemotes.map(
        (name): ContextMenuItem => ({
          id: `version-push-${name}`,
          label: `${this.versionLabel("versionPushTo")} ${name}`,
          icon: "arrow-up",
          disabled: !branch,
          action: () => void this.pushVersionRemote(name),
        }),
      ),
      {
        id: "version-publish",
        label: this.versionLabel("versionPublish"),
        icon: "github",
        disabled: !this.githubTokenPresent,
        action: () => this.openPublishModal(),
      },
      {
        id: "version-pull-request",
        label: t(lang, "githubPrAction"),
        icon: "git-branch",
        disabled: !this.foundGitHubRemote(),
        action: () => this.openPullRequestModal(),
      },
      {
        id: "version-github-connect",
        label: t(lang, "githubConnectAction"),
        icon: "github",
        disabled: this.githubTokenPresent,
        action: () => this.openSettingsModal(),
      },
      { id: "version-refresh-separator", label: "", separator: true },
      {
        id: "version-refresh",
        label: this.versionLabel("versionRefresh"),
        icon: "refresh-cw",
        action: () => void this.refreshGitPanelData(),
      },
    ];
    openContextMenu({
      x: event.clientX,
      y: event.clientY,
      items,
      label: this.versionLabel("versionBranchMenu"),
    });
  }

  private async fetchVersionRemote(remoteName?: string): Promise<void> {
    if (!this.folder || this.gitBusy) return;
    const remote = remoteName ?? this.primaryRemoteName();
    if (!remote) {
      this.statusNotice = this.versionLabel("versionNoRemote");
      this.render();
      return;
    }
    this.gitBusy = true;
    this.gitPanelError = "";
    try {
      this.gitStatus = await backend.gitFetch(this.folder.rootPath, remote);
      await this.refreshGitMeta();
      await this.refreshVersionStats();
      this.statusNotice = this.versionLabel("versionFetchDone");
    } catch (err) {
      this.gitPanelError = err instanceof Error ? err.message : String(err);
    } finally {
      this.gitBusy = false;
      this.render();
    }
  }

  private async pullVersionRemote(): Promise<void> {
    if (!this.folder || this.gitBusy) return;
    const remote = this.primaryRemoteName();
    const branch = this.gitStatus?.branch;
    if (!remote || !branch) {
      this.statusNotice = this.versionLabel("versionNoRemote");
      this.render();
      return;
    }
    this.gitBusy = true;
    this.gitPanelError = "";
    try {
      this.gitStatus = await backend.gitPull(
        this.folder.rootPath,
        remote,
        branch,
      );
      this.versionDiffs = {};
      await this.refreshAfterGitOperation();
      await this.refreshVersionStats();
      this.statusNotice = this.versionLabel("versionPullDone");
    } catch (err) {
      this.gitPanelError = err instanceof Error ? err.message : String(err);
    } finally {
      this.gitBusy = false;
      this.render();
    }
  }

  private async pushVersionRemote(remoteName?: string): Promise<void> {
    if (!this.folder || this.gitBusy) return;
    const remote = remoteName ?? this.primaryRemoteName();
    const branch = this.gitStatus?.branch;
    if (!remote || !branch) {
      this.statusNotice = this.versionLabel("versionNoRemote");
      this.render();
      return;
    }
    this.gitBusy = true;
    this.gitPanelError = "";
    try {
      this.gitStatus = await backend.gitPush(
        this.folder.rootPath,
        remote,
        branch,
      );
      await this.refreshTree();
      await this.refreshGitMeta();
      this.statusNotice = this.versionLabel("versionPushDone");
    } catch (err) {
      this.gitPanelError = err instanceof Error ? err.message : String(err);
    } finally {
      this.gitBusy = false;
      this.render();
    }
  }

  private openVersionsPanel(): void {
    this.sidebarVisible = true;
    this.sidebarTab = "versions";
    if (this.gitStatus?.isRepository) {
      this.openVersionChanges();
    } else {
      this.render();
    }
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

  private async saveVersion(stageAll = false): Promise<void> {
    if (!this.folder || this.gitBusy) return;
    const { name, email } = effectiveGitAuthor(this.settings);
    const message = this.gitCommitMessage.trim();
    if (!message) {
      this.gitPanelError = this.versionLabel("versionMessageRequired");
      this.render();
      return;
    }

    this.gitBusy = true;
    this.gitPanelError = "";
    try {
      if (stageAll) {
        this.gitStatus = await backend.gitStageAll(this.folder.rootPath);
      }
      this.gitStatus = await backend.gitCommitStaged(
        this.folder.rootPath,
        message,
        name,
        email,
      );
      this.gitCommitMessage = "";
      this.gitExpandedCommitId = null;
      this.versionDiffs = {};
      this.versionExpanded.clear();
      this.versionSelectedPath = null;
      await this.refreshTree();
      await this.refreshGitMeta();
      await this.refreshVersionStats();
      this.statusNotice = this.versionLabel("versionsSaved");
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
      this.versionDiffs = {};
      await this.refreshVersionStats();
      if (this.versionOpen) void this.loadExpandedVersionDiffs();
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
    this.versionDiffs = {};
    await this.refreshTree();
    await this.refreshGitMeta();
    await this.refreshVersionStats();
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

  private openConnectModelWizard(
    initialKind?: ByokProviderKind,
    fromSettings = false,
  ): void {
    this.modal = { kind: "connect-model", initialKind, fromSettings };
    this.render();
  }

  private closeConnectModelWizard(fromSettings: boolean): void {
    this.modal = fromSettings ? { kind: "settings" } : { kind: "none" };
    this.render();
  }

  private async testByokConnection(
    draft: ConnectModelDraft,
  ): Promise<ByokTestResult> {
    return backend.byokTestConnection(
      {
        kind: draft.kind,
        baseUrl: draft.kind === "custom" ? draft.baseUrl.trim() : undefined,
        model: draft.kind === "custom" ? draft.model.trim() : undefined,
      },
      draft.key.trim(),
    );
  }

  private async saveConnectedModel(
    draft: ConnectModelDraft,
    fromSettings: boolean,
  ): Promise<void> {
    const provider = byokProviderFromDraft(draft);
    const existed = this.settings.byokProviders.some(
      (item) => item.id === provider.id,
    );
    try {
      await backend.byokSetKey(provider.id, draft.key.trim());
      await this.updateSettings({
        byokProviders: [
          ...this.settings.byokProviders.filter(
            (item) => item.id !== provider.id,
          ),
          provider,
        ],
      });
    } catch (error) {
      if (!existed) {
        await backend.byokDeleteKey(provider.id).catch(() => {});
      }
      throw error;
    }
    await this.refreshByokStatus();
    await this.restartChatForByok();
    this.statusNotice = t(this.settings.language, "connectModelSaved", {
      name: provider.name,
    });
    this.modal = fromSettings ? { kind: "settings" } : { kind: "none" };
    this.render();
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

  private welcomeSessionTabs(): SessionTabInfo[] {
    if (!this.welcomeSessionId) return [];
    return [
      {
        id: this.welcomeSessionId,
        title:
          this.welcomeChatState.title ||
          t(this.settings.language, "welcomeChatSessionTitle"),
        streaming: this.welcomeChatState.streaming,
        error: this.welcomeChatState.status === "error",
      },
    ];
  }

  private ensureWelcomeChatPanel(): ChatPanel {
    if (!this.welcomeChatPanel) {
      this.welcomeChatPanel = new ChatPanel({
        variant: "welcome",
        welcomeTemplateLabel: this.welcomeSelectedTemplateLabel(),
        onWelcomeTemplateClick: () => this.openWelcomeTemplatePicker(),
        language: this.settings.language,
        projectName: t(this.settings.language, "welcomeChatTitle"),
        projectRoot: this.welcomeWorkspacePath ?? "",
        sessions: this.welcomeSessionTabs(),
        activeSessionId: this.welcomeSessionId,
        canCreateSession: false,
        onSend: (text) => void this.sendWelcomeMessage(text),
        onStop: () => this.stopWelcomeGeneration(),
        onRetry: () => void this.retryWelcomeChat(),
        onOpenSettings: () => this.openSettingsAt("models"),
        onSelectSession: () => {},
        onCreateSession: () => {},
        onCloseSession: () => {},
        onRenameSession: () => {},
        onOpenToolFile: () => {},
        onPermissionReply: (requestId, decision) =>
          void this.replyWelcomePermission(requestId, decision),
        onFormReply: (formId, answer) =>
          void this.replyWelcomeForm(formId, answer),
        kit: { agents: [], commands: [], skills: [] },
        models: this.welcomeModels,
        projectFiles: [],
        hiddenModels: this.settings.hiddenModels,
        recentModels: this.settings.recentModels,
        onAgentChange: () => {},
        onModelChange: (providerId, modelId, variant) =>
          void this.changeWelcomeModel(providerId, modelId, variant),
        onManageModels: () => this.openManageModels(),
      });
    }
    this.updateWelcomeChatPanel();
    return this.welcomeChatPanel;
  }

  private updateWelcomeChatPanel(): void {
    this.welcomeChatPanel?.update(this.welcomeChatState, {
      welcomeTemplateLabel: this.welcomeSelectedTemplateLabel(),
      onWelcomeTemplateClick: () => this.openWelcomeTemplatePicker(),
      language: this.settings.language,
      projectName: t(this.settings.language, "welcomeChatTitle"),
      projectRoot: this.welcomeWorkspacePath ?? "",
      sessions: this.welcomeSessionTabs(),
      activeSessionId: this.welcomeSessionId,
      canCreateSession: false,
      kit: { agents: [], commands: [], skills: [] },
      models: this.welcomeModels,
      projectFiles: [],
      hiddenModels: this.settings.hiddenModels,
      recentModels: this.settings.recentModels,
    });
    this.welcomeChatPanel?.setWelcomePrompt(
      this.renderWelcomeTemplatePrompt(this.settings.language),
    );
    this.updateWelcomeChatStatus();
  }

  private async startWelcomeChat(): Promise<void> {
    if (this.folder || !isTauriEnvironment()) return;
    if (this.welcomeChatState.status !== "idle") return;
    const generation = ++this.welcomeGeneration;
    this.welcomeChatState = chatStarting(initialChatState);
    this.updateWelcomeChatPanel();
    try {
      const templates = await backend.listTemplates();
      if (generation !== this.welcomeGeneration || this.folder) return;
      this.welcomeTemplates = templates.map((template) => ({
        id: template.id,
        name: template.name,
        description: template.description,
        source: template.source,
      }));
      const workspace = await backend.welcomePrepareWorkspace(
        this.welcomeTemplates,
      );
      if (generation !== this.welcomeGeneration || this.folder) return;
      this.welcomeWorkspacePath = workspace.path;
      if (!this.welcomeDestination) {
        this.welcomeDestination = workspace.defaultDestination;
      }
      this.updateWelcomeLocation();

      await backend.opencodeStop();
      if (generation !== this.welcomeGeneration || this.folder) return;
      await backend.opencodeStart(workspace.path);
      if (generation !== this.welcomeGeneration || this.folder) return;
      try {
        await this.refreshByokStatus();
        this.welcomeModels = filterChatModelsByKeys(
          await backend.opencodeListModels(),
          this.byokStatus,
        );
      } catch (err) {
        console.error("Could not list OpenCode models", err);
        this.welcomeModels = [];
      }
      const session = await backend.opencodeCreateSession(
        t(this.settings.language, "welcomeChatSessionTitle"),
      );
      if (generation !== this.welcomeGeneration || this.folder) return;
      this.welcomeSessionId = session.id;
      const messages = await backend.opencodeSessionMessages(session.id);
      const permissions = await backend.opencodePendingPermissions(session.id);
      const forms = await backend.opencodePendingForms(session.id);
      if (generation !== this.welcomeGeneration || this.folder) return;
      this.welcomeChatState = formsLoaded(
        permissionsLoaded(chatFromHistory(session, messages), permissions),
        forms,
      );
      this.welcomeUnlisten?.();
      this.welcomeUnlisten = await backend.listenOpenCodeEvents((event) =>
        this.handleWelcomeOpenCodeEvent(event),
      );
      if (generation !== this.welcomeGeneration) return;
      this.updateWelcomeChatPanel();
    } catch (err) {
      if (generation !== this.welcomeGeneration) return;
      this.welcomeChatState = chatFailed(
        chatStarting(initialChatState),
        err instanceof Error ? err.message : String(err),
      );
      this.updateWelcomeChatPanel();
    }
  }

  private stopWelcomeChat(): void {
    this.welcomeGeneration += 1;
    this.welcomeUnlisten?.();
    this.welcomeUnlisten = null;
    const sessionId = this.welcomeSessionId;
    const streaming = this.welcomeChatState.streaming;
    this.welcomeSessionId = null;
    this.welcomeWorkspacePath = null;
    this.welcomeChatState = { ...initialChatState };
    this.welcomeChatPanel = null;
    this.welcomeModels = [];
    this.welcomeSwitcherOpen = false;
    this.welcomeSwitcherQuery = "";
    this.welcomeTemplateId = "";
    this.welcomeTemplatePickerOpen = false;
    this.welcomeTemplatePromptDismissed = false;
    this.welcomeDestinationPicked = false;
    this.welcomeDestinationQuestion = false;
    this.welcomeDestinationAnswered = false;
    this.welcomeRequest = null;
    this.welcomeRequestSignature = "";
    this.welcomeDraft = null;
    this.welcomeProjectOpen = false;
    if (streaming && sessionId) {
      void backend.opencodeAbort(sessionId).catch(() => {});
    }
  }

  private async retryWelcomeChat(): Promise<void> {
    this.stopWelcomeChat();
    this.render();
    await this.startWelcomeChat();
  }

  private async sendWelcomeMessage(rawText: string): Promise<void> {
    const sessionId = this.welcomeSessionId;
    if (
      !sessionId ||
      this.welcomeChatState.status !== "ready" ||
      this.welcomeChatState.streaming
    ) {
      return;
    }
    const text = rawText.trim();
    if (!text) return;
    this.welcomeChatState = appendUserMessage(this.welcomeChatState, text);
    this.welcomeChatPanel?.clearDraft();
    this.updateWelcomeChatPanel();
    const templateNote = this.welcomeTemplateId
      ? `[Plantilla: ${this.welcomeSelectedTemplateLabel()}]`
      : this.welcomeTemplatePromptDismissed
        ? `[Plantilla: ${t(this.settings.language, "welcomeTemplateDecide")}]`
        : "";
    const payload = templateNote ? `${text}\n\n${templateNote}` : text;
    try {
      await backend.opencodeSend(sessionId, payload);
    } catch (err) {
      this.welcomeChatState = chatSendFailed(
        this.welcomeChatState,
        err instanceof Error ? err.message : String(err),
      );
      this.updateWelcomeChatPanel();
    }
  }

  private stopWelcomeGeneration(): void {
    const sessionId = this.welcomeSessionId;
    if (!sessionId) return;
    this.welcomeChatState = { ...this.welcomeChatState, streaming: false };
    this.updateWelcomeChatPanel();
    void backend.opencodeAbort(sessionId).catch(() => {});
  }

  private handleWelcomeOpenCodeEvent(event: OpenCodeEvent): void {
    const wasStreaming = this.welcomeChatState.streaming;
    this.welcomeChatState = applyOpenCodeEvent(
      this.welcomeChatState,
      event,
      this.settings.language,
    );
    this.updateWelcomeChatPanel();
    if (wasStreaming && !this.welcomeChatState.streaming) {
      void this.loadWelcomeRequest();
    }
  }

  private async replyWelcomePermission(
    requestId: string,
    decision: "once" | "always" | "reject",
  ): Promise<void> {
    const sessionId = this.welcomeSessionId;
    if (!sessionId) return;
    this.welcomeChatState = chatPermissionReplied(
      this.welcomeChatState,
      requestId,
      decision,
    );
    this.updateWelcomeChatPanel();
    try {
      await backend.opencodeReplyPermission(sessionId, requestId, decision);
    } catch (err) {
      this.welcomeChatState = chatPermissionFailed(
        this.welcomeChatState,
        requestId,
        err instanceof Error ? err.message : String(err),
      );
      this.updateWelcomeChatPanel();
    }
  }

  private async replyWelcomeForm(
    formId: string,
    answer: Record<string, unknown>,
  ): Promise<void> {
    const sessionId = this.welcomeSessionId;
    if (!sessionId) return;
    this.welcomeChatState = chatFormAnswered(
      this.welcomeChatState,
      formId,
      answer,
    );
    this.updateWelcomeChatPanel();
    try {
      await backend.opencodeReplyForm(sessionId, formId, answer);
    } catch (err) {
      this.welcomeChatState = chatFormFailed(
        this.welcomeChatState,
        formId,
        err instanceof Error ? err.message : String(err),
      );
      this.updateWelcomeChatPanel();
    }
  }

  private async changeWelcomeModel(
    providerId: string,
    modelId: string,
    variant?: string,
  ): Promise<void> {
    const sessionId = this.welcomeSessionId;
    if (!sessionId) return;
    try {
      await backend.opencodeSwitchModel(
        sessionId,
        providerId,
        modelId,
        variant,
      );
      this.welcomeChatState = {
        ...this.welcomeChatState,
        model: `${providerId}/${modelId}${variant ? `#${variant}` : ""}`,
      };
      this.updateWelcomeChatPanel();
    } catch (err) {
      this.welcomeChatState = chatSendFailed(
        this.welcomeChatState,
        err instanceof Error ? err.message : String(err),
      );
      this.updateWelcomeChatPanel();
    }
  }

  private updateWelcomeChatStatus(): void {
    if (!this.welcomeStatusEl || !this.welcomeStatusTextEl) return;
    const state = this.welcomeChatState;
    const starting = state.status === "idle" || state.status === "starting";
    this.welcomeStatusEl.hidden = !starting;
    if (starting) {
      this.welcomeStatusTextEl.textContent = t(
        this.settings.language,
        "welcomeChatStatusStarting",
      );
    }
  }

  private updateWelcomeLocation(): void {
    if (!this.welcomeLocationLabelEl) return;
    this.welcomeLocationLabelEl.textContent =
      this.welcomeDestination ||
      t(this.settings.language, "welcomeChooseDestination");
    if (this.welcomeLocationEl) {
      this.welcomeLocationEl.title = t(
        this.settings.language,
        "welcomeProjectsTitle",
      );
    }
  }

  private toggleWelcomeSwitcher(): void {
    this.welcomeSwitcherOpen = !this.welcomeSwitcherOpen;
    this.welcomeSwitcherQuery = "";
    this.welcomeTemplatePickerOpen = false;
    this.render();
  }

  private closeWelcomeSwitcher(): void {
    if (!this.welcomeSwitcherOpen) return;
    this.welcomeSwitcherOpen = false;
    this.welcomeSwitcherQuery = "";
    this.render();
  }

  private async chooseWelcomeDestination(): Promise<void> {
    try {
      const picked = await backend.pickFolderDialog();
      if (!picked) return;
      this.welcomeDestination = picked;
      this.welcomeDestinationPicked = true;
      this.welcomeDestinationAnswered = false;
      this.welcomeDestinationQuestion = false;
      if (this.welcomeDraft) {
        this.welcomeDraft = { ...this.welcomeDraft, destination: picked };
      }
      this.welcomeSwitcherOpen = true;
      this.render();
    } catch (err) {
      this.showStatusNotice(err instanceof Error ? err.message : String(err));
    }
  }

  private async loadWelcomeRequest(attempt = 0): Promise<void> {
    if (this.folder || !this.welcomeWorkspacePath) return;
    try {
      const request = await backend.welcomeReadProjectRequest();
      if (this.folder || !this.welcomeWorkspacePath || !request) return;
      const signature = [
        request.name,
        request.templateId,
        request.brief,
      ].join("\u0000");
      if (signature === this.welcomeRequestSignature) return;
      this.welcomeRequestSignature = signature;
      this.welcomeRequest = request;
      if (!this.welcomeDraft || !this.welcomeProjectOpen) {
        const destination =
          this.welcomeDraft?.destination || this.welcomeDestination;
        const draft = welcomeDraftFromRequest(
          request,
          this.welcomeTemplates,
          destination,
          this.welcomeTemplateId,
        );
        this.welcomeDraft = this.welcomeDraft
          ? { ...draft, destination: this.welcomeDraft.destination }
          : draft;
        this.welcomeDestinationQuestion =
          this.welcomeDestinationPicked &&
          !this.welcomeDestinationAnswered &&
          Boolean(this.welcomeDraft.destination);
      }
      this.render();
    } catch (err) {
      console.error("Could not read the welcome project request", err);
      if (attempt < 3) {
        window.setTimeout(
          () => void this.loadWelcomeRequest(attempt + 1),
          250 * (attempt + 1),
        );
      }
    }
  }

  private openWelcomeProject(): void {
    if (!this.welcomeRequest || !this.welcomeDraft) return;
    this.welcomeSwitcherOpen = false;
    this.welcomeTemplatePickerOpen = false;
    this.welcomeProjectOpen = true;
    this.welcomeDraft = { ...this.welcomeDraft, error: "" };
    this.welcomeDestinationQuestion =
      this.welcomeDestinationPicked &&
      !this.welcomeDestinationAnswered &&
      Boolean(this.welcomeDraft.destination);
    this.render();
  }

  private closeWelcomeProject(): void {
    if (!this.welcomeProjectOpen) return;
    this.welcomeProjectOpen = false;
    if (this.welcomeDraft) {
      this.welcomeDraft = { ...this.welcomeDraft, error: "" };
    }
    this.render();
  }

  private updateWelcomeDraft(patch: Partial<WelcomeDraft>): void {
    if (!this.welcomeDraft) return;
    this.welcomeDraft = { ...this.welcomeDraft, ...patch };
  }

  private usePickedWelcomeDestination(): void {
    this.welcomeDestinationAnswered = true;
    this.welcomeDestinationQuestion = false;
    this.render();
  }

  private async chooseWelcomeProjectDestination(): Promise<void> {
    try {
      const picked = await backend.pickFolderDialog();
      if (!picked || !this.welcomeDraft) return;
      this.welcomeDestination = picked;
      this.welcomeDestinationPicked = true;
      this.welcomeDestinationAnswered = true;
      this.welcomeDestinationQuestion = false;
      this.welcomeDraft = { ...this.welcomeDraft, destination: picked };
      this.render();
    } catch (err) {
      this.showStatusNotice(err instanceof Error ? err.message : String(err));
    }
  }

  private welcomeDraftErrorKey(
    error: NonNullable<ReturnType<typeof validateWelcomeDraft>>,
  ): TranslationKey {
    return error === "brief"
      ? "welcomeProjectBriefEmpty"
      : this.projectErrorKey(error);
  }

  private async submitWelcomeProject(): Promise<void> {
    const draft = this.welcomeDraft;
    if (!draft || draft.submitting) return;
    const validation = validateWelcomeDraft(draft);
    if (validation) {
      this.welcomeDraft = {
        ...draft,
        error: t(this.settings.language, this.welcomeDraftErrorKey(validation)),
      };
      this.render();
      return;
    }

    this.welcomeDraft = { ...draft, submitting: true, error: "" };
    this.render();
    try {
      const created = await backend.createProjectFromTemplate(
        draft.templateId,
        draft.name.trim(),
        draft.destination.trim(),
      );
      const template = this.welcomeTemplates.find(
        (item) => item.id === draft.templateId,
      );
      this.pendingProjectHandoff = buildProjectHandoff({
        rootPath: created.path,
        name: draft.name,
        brief: draft.brief,
        templateName:
          draft.templateId === "blank"
            ? t(this.settings.language, "welcomeTemplateBlank")
            : template?.name ?? draft.templateId,
        model: this.welcomeChatState.model,
        language: this.settings.language,
      });
      if (this.welcomeDraft) {
        this.welcomeDraft = { ...this.welcomeDraft, submitting: false };
      }
      this.welcomeProjectOpen = false;
      await this.openFolderByPath(created.path);
      this.showStatusNotice(
        t(
          this.settings.language,
          created.gitInitialized ? "projectCreated" : "projectCreatedNoGit",
        ),
      );
    } catch (err) {
      if (this.welcomeDraft) {
        this.welcomeDraft = {
          ...this.welcomeDraft,
          submitting: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
      this.render();
    }
  }

  private welcomeProjectRows(): RecentProject[] {
    return filterWelcomeProjects(this.recents, this.welcomeSwitcherQuery);
  }

  private welcomeSelectedTemplateLabel(): string {
    return welcomeTemplateLabel(
      this.settings.language,
      this.welcomeTemplateId,
      this.welcomeTemplates,
    );
  }

  private openWelcomeTemplatePicker(): void {
    this.welcomeSwitcherOpen = false;
    this.welcomeTemplatePickerOpen = true;
    this.render();
  }

  private closeWelcomeTemplatePicker(): void {
    if (!this.welcomeTemplatePickerOpen) return;
    this.welcomeTemplatePickerOpen = false;
    this.render();
  }

  private chooseWelcomeTemplate(templateId: string): void {
    this.welcomeTemplateId = templateId;
    this.welcomeTemplatePromptDismissed = templateId === "";
    this.welcomeTemplatePickerOpen = false;
    this.render();
  }

  private renderWelcomeTemplatePrompt(
    lang: AppSettings["language"],
  ): HTMLElement | null {
    if (
      this.welcomeTemplateId ||
      this.welcomeTemplatePromptDismissed ||
      this.welcomeTemplates.length === 0
    ) {
      return null;
    }
    const prompt = document.createElement("div");
    prompt.className = "welcome-template-prompt";
    prompt.dataset.testid = "welcome-template-prompt";
    const icon = document.createElement("span");
    icon.className = "welcome-template-prompt-icon";
    icon.appendChild(createIcon("sparkles", 15));
    const copy = document.createElement("div");
    copy.className = "welcome-template-prompt-copy";
    const title = document.createElement("strong");
    title.textContent = t(lang, "welcomeTemplatePromptTitle");
    const hint = document.createElement("span");
    hint.textContent = t(lang, "welcomeTemplatePromptHint");
    copy.append(title, hint);
    const actions = document.createElement("div");
    actions.className = "welcome-template-prompt-actions";
    const seeAll = document.createElement("button");
    seeAll.type = "button";
    seeAll.className = "welcome-template-prompt-btn";
    seeAll.dataset.testid = "welcome-template-see-all";
    seeAll.textContent = t(lang, "welcomeTemplateSeeAll");
    seeAll.onclick = () => this.openWelcomeTemplatePicker();
    const blank = document.createElement("button");
    blank.type = "button";
    blank.className = "welcome-template-prompt-btn";
    blank.dataset.testid = "welcome-template-blank";
    blank.textContent = t(lang, "welcomeTemplateBlank");
    blank.onclick = () => this.chooseWelcomeTemplate("blank");
    const decide = document.createElement("button");
    decide.type = "button";
    decide.className = "welcome-template-prompt-link";
    decide.dataset.testid = "welcome-template-decide";
    decide.textContent = t(lang, "welcomeTemplateDecideAction");
    decide.onclick = () => {
      this.welcomeTemplatePromptDismissed = true;
      this.render();
    };
    actions.append(seeAll, blank, decide);
    prompt.append(icon, copy, actions);
    return prompt;
  }

  private renderWelcomeTemplatePicker(
    lang: AppSettings["language"],
  ): HTMLElement {
    const backdrop = document.createElement("div");
    backdrop.className = "welcome-switcher-backdrop";
    backdrop.dataset.testid = "welcome-template-backdrop";
    backdrop.onclick = () => this.closeWelcomeTemplatePicker();

    const panel = document.createElement("section");
    panel.className = "welcome-switcher welcome-template-picker";
    panel.dataset.testid = "welcome-template-picker";
    panel.onclick = (event) => event.stopPropagation();

    const header = document.createElement("div");
    header.className = "welcome-template-picker-header";
    const copy = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = t(lang, "welcomeTemplatePickerTitle");
    const hint = document.createElement("p");
    hint.textContent = t(lang, "welcomeTemplatePickerHint");
    copy.append(title, hint);
    const close = createIconButton({
      icon: "x",
      label: t(lang, "close"),
      className: "welcome-template-close",
      testId: "welcome-template-close",
      onClick: () => this.closeWelcomeTemplatePicker(),
    });
    header.append(copy, close);

    const list = document.createElement("div");
    list.className = "welcome-template-list";
    const addRow = (
      id: string,
      name: string,
      description: string,
      source: string | null,
    ) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "welcome-template-row";
      row.dataset.testid = "welcome-template-row";
      row.dataset.templateId = id;
      row.classList.toggle("selected", this.welcomeTemplateId === id);
      const text = document.createElement("span");
      text.className = "welcome-template-row-copy";
      const nameEl = document.createElement("strong");
      nameEl.textContent = name;
      const descriptionEl = document.createElement("span");
      descriptionEl.textContent = description;
      text.append(nameEl, descriptionEl);
      const meta = document.createElement("span");
      meta.className = "welcome-template-row-meta";
      if (source) {
        const badge = document.createElement("span");
        badge.className = "welcome-template-source";
        badge.textContent = welcomeTemplateSourceLabel(lang, source);
        meta.appendChild(badge);
      }
      if (this.welcomeTemplateId === id) {
        meta.appendChild(createIcon("check", 14));
      }
      row.append(text, meta);
      row.onclick = () => this.chooseWelcomeTemplate(id);
      list.appendChild(row);
    };

    addRow(
      "",
      t(lang, "welcomeTemplateDecide"),
      t(lang, "welcomeTemplateDecideHint"),
      null,
    );
    for (const template of this.welcomeTemplates) {
      addRow(
        template.id,
        template.name,
        template.description,
        template.source ?? (template.id === "blank" ? "blank" : "bundled"),
      );
    }

    panel.append(header, list);
    backdrop.appendChild(panel);
    return backdrop;
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
      filterTreeNodes(this.folder?.tree ?? [], configFilesVisible(this.settings)),
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
      inlineBlame: this.inlineBlameEnabled,
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
    if (
      this.pendingProjectHandoff &&
      this.pendingProjectHandoff.rootPath !== root
    ) {
      this.pendingProjectHandoff = null;
    }
    const hasPendingHandoff = Boolean(this.pendingProjectHandoff);
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
        await this.refreshByokStatus();
        this.chatModels = filterChatModelsByKeys(
          await backend.opencodeListModels(),
          this.byokStatus,
        );
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
      await this.applyPendingProjectHandoff();
      if (hasPendingHandoff) {
        try {
          await backend.welcomeCleanupWorkspace();
        } catch (err) {
          console.error("Could not clean the welcome workspace", err);
        }
      }
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

  private async applyPendingProjectHandoff(): Promise<void> {
    const handoff = this.pendingProjectHandoff;
    if (!handoff) return;
    if (!this.folder || this.folder.rootPath !== handoff.rootPath) {
      this.pendingProjectHandoff = null;
      return;
    }
    const sessionId = this.activeChatSessionId;
    if (!sessionId) return;
    this.pendingProjectHandoff = null;

    const updateState = (
      update: (state: ChatState) => ChatState,
    ): ChatState => {
      const current = this.chatSessions.get(sessionId) ?? this.chatState;
      const next = update(current);
      this.chatSessions.set(sessionId, next);
      if (this.activeChatSessionId === sessionId) {
        this.chatState = next;
      }
      return next;
    };

    const selection = parseChatModelSelection(handoff.model);
    if (selection) {
      try {
        await backend.opencodeSwitchModel(
          sessionId,
          selection.providerId,
          selection.modelId,
          selection.variant || undefined,
        );
        updateState((state) => ({ ...state, model: handoff.model }));
      } catch (err) {
        console.error("Could not keep the welcome model", err);
      }
    }

    if (handoff.sessionTitle) {
      try {
        await backend.opencodeRenameSession(sessionId, handoff.sessionTitle);
        updateState((state) => ({
          ...state,
          title: handoff.sessionTitle,
        }));
      } catch (err) {
        console.error("Could not rename the project session", err);
      }
    }

    const withMessage = updateState((state) =>
      appendUserMessage(state, handoff.message),
    );
    this.updateChatPanel();
    try {
      await backend.opencodeSend(sessionId, handoff.message);
    } catch (err) {
      const failed = chatSendFailed(
        withMessage,
        err instanceof Error ? err.message : String(err),
      );
      this.chatSessions.set(sessionId, failed);
      this.chatState = failed;
      this.updateChatPanel();
    }
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

  private async handleToolFileActivity(
    activity: ToolFileActivity,
  ): Promise<void> {
    if (!this.settings.followActiveFile) return;
    if (!this.folder || this.versionOpen) return;
    const root = this.folder.rootPath;
    if (activity.phase === "running") {
      const tab = this.tabState.tabs.find(
        (item) => item.path === activity.path,
      );
      if (tab && isTabDirty(tab)) {
        this.showStatusNotice(
          t(this.settings.language, "chatFileUnsaved", {
            path: activity.path,
          }),
        );
        return;
      }
      if (tab && this.tabState.activeTabPath === activity.path) {
        this.liveToolFile = { toolId: activity.toolId, path: activity.path };
        return;
      }
      this.liveToolFile = { toolId: activity.toolId, path: activity.path };
      let content = tab?.content ?? "";
      if (!tab) {
        try {
          content = await backend.readTextFile(root, activity.path);
        } catch {
          content = "";
        }
        if (!this.folder || this.folder.rootPath !== root) return;
      }
      this.tabState = openFileInTabs(
        this.tabState,
        {
          path: activity.path,
          name: this.fileName(activity.path),
          content,
        },
        true,
      );
      this.render();
      return;
    }

    if (this.liveToolFile?.toolId !== activity.toolId) return;
    this.liveToolFile = null;
    if (activity.phase === "completed") {
      await this.reloadToolFile(activity.path);
    }
  }

  private async reloadToolFile(path: string): Promise<void> {
    if (!this.folder) return;
    const root = this.folder.rootPath;
    const tab = this.tabState.tabs.find((item) => item.path === path);
    if (!tab || isTabDirty(tab)) return;
    try {
      const content = await backend.readTextFile(root, path);
      if (!this.folder || this.folder.rootPath !== root) return;
      const current = this.tabState.tabs.find((item) => item.path === path);
      if (!current || isTabDirty(current) || current.content === content) {
        return;
      }
      this.tabState = {
        ...this.tabState,
        tabs: this.tabState.tabs.map((item) =>
          item.path === path
            ? {
                ...item,
                content,
                savedContent: content,
                externalChange: false,
              }
            : item,
        ),
      };
      this.editor?.closeDocumentState(path);
      this.render();
    } catch (err) {
      console.error("Could not reload the file written by the agent", err);
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
      const rawTool = data.tool;
      const toolId =
        rawTool && typeof rawTool === "object" && !Array.isArray(rawTool)
          ? (rawTool as Record<string, unknown>).id
          : null;
      const toolPart =
        typeof toolId === "string"
          ? next.messages
              .flatMap((message) => message.parts)
              .find(
                (part) => part.type === "tool" && part.tool.id === toolId,
              )
          : null;
      if (toolPart?.type === "tool") {
        const activity = toolFileActivity(
          this.folder?.rootPath ?? null,
          event.type,
          { tool: toolPart.tool },
        );
        if (activity) {
          void this.handleToolFileActivity(activity);
        }
      }
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
    if (this.layoutAnimating) return;
    if (this.chatVisible) {
      this.layoutAnimating = true;
      this.animateSessionWidth(0, () => {
        this.layoutAnimating = false;
        this.chatVisible = false;
        this.editorVisible = true;
        this.render();
        this.persistWorkspaceState();
      });
      return;
    }
    this.layoutAnimating = true;
    this.chatVisible = true;
    this.editorVisible = true;
    this.openingSurface = "chat";
    this.render();
    this.persistWorkspaceState();
  }

  private toggleEditorPanel(): void {
    if (this.layoutAnimating) return;
    if (this.editorVisible) {
      this.layoutAnimating = true;
      const body = this.rootEl.querySelector<HTMLElement>(".workspace-body");
      const width = body?.clientWidth ?? this.sessionWidth;
      this.animateSessionWidth(width, () => {
        this.layoutAnimating = false;
        this.editorVisible = false;
        this.chatVisible = true;
        this.render();
        this.persistWorkspaceState();
      });
      return;
    }
    this.layoutAnimating = true;
    this.editorVisible = true;
    this.chatVisible = true;
    this.openingSurface = "editor";
    this.render();
    this.persistWorkspaceState();
  }

  private startOpeningAnimation(): void {
    if (!this.openingSurface) return;
    this.openingSurface = null;
    this.animateSessionWidth(this.sessionWidth, () => {
      this.layoutAnimating = false;
    });
  }

  private animateSessionWidth(target: number, onFinished: () => void): void {
    const column = this.rootEl.querySelector<HTMLElement>(".session-column");
    if (
      !column ||
      typeof column.animate !== "function" ||
      (typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    ) {
      if (column) {
        column.style.width = `${target}px`;
        column.style.minWidth = "";
        column.style.maxWidth = "";
        column.style.overflow = "";
      }
      onFinished();
      return;
    }
    const current = column.getBoundingClientRect().width;
    column.style.minWidth = "0";
    column.style.maxWidth = "none";
    column.style.overflow = "hidden";
    column.style.willChange = "width";
    const animation = column.animate(
      [{ width: `${current}px` }, { width: `${target}px` }],
      { duration: 260, easing: "ease-in-out", fill: "forwards" },
    );
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      column.style.width = `${target}px`;
      column.style.minWidth = "";
      column.style.maxWidth = "";
      column.style.overflow = "";
      column.style.willChange = "";
      onFinished();
    };
    animation.onfinish = finish;
    animation.oncancel = finish;
    window.setTimeout(finish, 340);
  }

  private toggleTerminalView(): void {
    if (!this.settings.showDeveloperOptions) return;
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
    const wasVersionOpen = this.versionOpen;
    this.versionOpen = false;
    try {
      const existing = this.tabState.tabs.find((t) => t.path === relPath);
      // Re-clicking the already active file should not rebuild the shell or
      // disturb the editor scroll/selection.
      if (
        existing &&
        !existing.preview &&
        this.tabState.activeTabPath === relPath
      ) {
        if (wasVersionOpen) this.render();
        return;
      }
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
    if (isProjectSearchPath(active.path)) return false;
    if (isUntitledTab(active)) {
      return this.saveUntitledTab(active);
    }
    try {
      await backend.writeTextFile(this.folder.rootPath, active.path, active.content);
      this.blameByPath.delete(active.path);
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
    if (isProjectSearchPath(path)) this.resetProjectSearch();
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
    const prevShowConfig = configFilesVisible(this.settings);
    const prevDeveloperOptions = this.settings.showDeveloperOptions;
    const prevProviders = JSON.stringify(this.settings.byokProviders);
    if (this.modal.kind === "settings" && this.modal.error) {
      this.modal = { kind: "settings" };
    }
    this.settings = await backend.saveSettings({
      ...this.settings,
      ...patch,
    });
    this.applyThemeAttribute();
    if (prevDeveloperOptions && !this.settings.showDeveloperOptions) {
      this.stopTerminalSession();
    }
    if (this.folder && prevShowConfig !== configFilesVisible(this.settings)) {
      await this.refreshTree();
    }
    this.editor?.applySettings(this.settings);
    this.render();
    if (
      !this.folder &&
      prevProviders !== JSON.stringify(this.settings.byokProviders) &&
      this.welcomeChatState.status === "error"
    ) {
      void this.retryWelcomeChat();
    }
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
    if (
      !active ||
      !this.folder ||
      isUntitledTab(active) ||
      isProjectSearchPath(active.path)
    ) {
      return;
    }

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

    const key = `${activeTab.path}\u0000${this.diffViewMode}\u0000${data.original}\u0000${activeTab.content}`;
    if (this.diffView && this.diffViewKey === key) return;

    this.destroyDiffView();
    this.diffView = new BradbitDiffView(this.diffHostEl);
    this.diffViewKey = key;
    this.diffView.open(
      data.original,
      activeTab.content,
      this.settings,
      this.diffViewMode,
    );
  }

  private async loadDiffData(tab: OpenTab): Promise<void> {
    if (!this.folder || this.diffLoadingPath === tab.path) return;
    this.diffLoadingPath = tab.path;
    try {
      const original = await this.loadBaseline(this.folder.rootPath, tab.path);
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
    if (
      !active ||
      !this.folder ||
      isUntitledTab(active) ||
      isProjectSearchPath(active.path)
    ) {
      return;
    }
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
      this.versionDiffs = {};
      await this.refreshVersionStats();
      if (this.versionOpen) void this.loadExpandedVersionDiffs();

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

  private ensureBufferSearchBar(): SearchBar {
    if (!this.bufferSearchBar) {
      this.bufferSearchBar = new SearchBar(this.settings.language, {
        onSearchChange: (query) => this.applyBufferSearch(query),
        onFindNext: () => {
          this.editor?.searchNext();
          this.updateBufferSearchInfo();
        },
        onFindPrevious: () => {
          this.editor?.searchPrevious();
          this.updateBufferSearchInfo();
        },
        onReplace: (replace) => {
          this.editor?.replaceSearch(replace);
          this.updateBufferSearchInfo();
        },
        onReplaceAll: (replace) => {
          this.editor?.replaceAllSearch(replace);
          this.updateBufferSearchInfo();
        },
        onClose: () => this.closeBufferSearch(),
        onGenerateRegex: (description) =>
          this.generateSearchRegex(description),
        onOpenSettings: () => this.openSettingsAt("models"),
      });
    }
    return this.bufferSearchBar;
  }

  private openBufferSearch(replace = false): void {
    if (!this.folder) return;
    if (isProjectSearchPath(this.getActiveTab()?.path)) {
      this.ensureProjectSearchBar().focus();
      return;
    }
    this.editorVisible = true;
    if (this.versionOpen) {
      this.versionOpen = false;
      this.render();
    }
    let active = this.getActiveTab();
    if (!active) {
      this.showStatusNotice(t(this.settings.language, "searchUnavailable"));
      return;
    }
    if (active.viewMode === "diff") this.toggleDiff();
    else if (active.viewMode === "preview") this.ensureEditMode();
    active = this.getActiveTab();
    if (!active || active.viewMode !== "edit") {
      this.showStatusNotice(t(this.settings.language, "searchUnavailable"));
      return;
    }
    if (!this.editor) this.render();

    const existing = this.bufferSearchBar;
    if (this.bufferSearchOpen && existing && this.bufferSearchPath === active.path) {
      if (!existing.element().isConnected) this.render();
      existing.setReplaceOpen(replace);
      window.setTimeout(
        () => (replace ? existing.focusReplace() : existing.focus()),
        0,
      );
      return;
    }

    const bar = this.ensureBufferSearchBar();
    this.bufferSearchOpen = true;
    this.bufferSearchPath = active.path;
    const selected = this.editor
      ?.getSelectedText()
      .split("\n")[0]
      .trim();
    if (selected) bar.setQuery(selected, undefined, false);
    this.render();
    this.applyBufferSearch(bar.getQuery());
    bar.setReplaceOpen(replace);
    window.setTimeout(() => (replace ? bar.focusReplace() : bar.focus()), 0);
  }

  private applyBufferSearch(query?: SearchBarQuery): void {
    const bar = this.bufferSearchBar;
    const editor = this.editor;
    if (!bar || !editor) return;
    const activeQuery = query ?? bar.getQuery();
    const valid = editor.setSearchQuery(activeQuery);
    bar.setError(
      activeQuery.search.length > 0 && !valid
        ? t(this.settings.language, "searchInvalidRegex")
        : "",
    );
    this.updateBufferSearchInfo();
  }

  private updateBufferSearchInfo(): void {
    const info = this.editor?.searchMatchInfo() ?? { current: 0, total: 0 };
    this.bufferSearchBar?.setMatchInfo(info.current, info.total);
  }

  private closeBufferSearch(render = true): void {
    if (!this.bufferSearchOpen) return;
    this.bufferSearchOpen = false;
    this.bufferSearchPath = null;
    this.bufferSearchPending = false;
    this.editor?.clearSearch();
    this.bufferSearchBar = null;
    if (render) {
      this.render();
      this.editor?.focusEditor();
    }
  }

  private async generateSearchRegex(description: string): Promise<string> {
    const lang = this.settings.language;
    const target = await this.resolveSearchAiTarget();
    if ("error" in target) {
      throw new Error(t(lang, "searchAiNoModel"));
    }
    const prompt = [
      "You convert a writer's search description into exactly one JavaScript regular expression.",
      "Return only the regex source: no surrounding slashes, no flags, no quotes, no code fences, no explanation and no extra lines.",
      "Do not add case-insensitive or whole-word syntax; the app has separate toggles for those.",
      "Escape literal regex metacharacters when the request is for plain text.",
      "Examples:",
      String.raw`- "correos" -> [A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}`,
      String.raw`- "teléfonos" -> \+?\d[\d\s().-]{6,}\d`,
      `Request: ${description}`,
    ].join("\n");
    try {
      const raw = await backend.byokComplete(
        target.providerId,
        prompt,
        target.model,
        this.settings.searchAiEffort,
      );
      if (!raw.trim()) throw new Error(t(lang, "searchAiEmptyAnswer"));
      return raw;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const kind = searchAiErrorKind(message);
      if (kind === "empty") {
        throw new Error(t(lang, "searchAiEmptyAnswer"));
      }
      if (kind === "truncated") {
        throw new Error(t(lang, "searchAiTruncated"));
      }
      throw new Error(`${t(lang, "searchAiError")} ${message}`);
    }
  }

  private ensureProjectSearchBar(): SearchBar {
    if (!this.projectSearchBar) {
      this.projectSearchBar = new SearchBar(
        this.settings.language,
        {
          onSearchChange: (query) => this.scheduleProjectSearch(query),
          onFindNext: () => this.navigateProjectSearch(1),
          onFindPrevious: () => this.navigateProjectSearch(-1),
          onReplace: (replacement) =>
            void this.replaceProjectSelection(replacement),
          onReplaceAll: (replacement) =>
            this.requestProjectReplaceAll(replacement),
          onClose: () => this.requestCloseTab(PROJECT_SEARCH_PATH),
          onGenerateRegex: (description) =>
            this.generateSearchRegex(description),
          onOpenSettings: () => this.openSettingsAt("models"),
        },
      );
    }
    return this.projectSearchBar;
  }

  private ensureProjectSearchView(): ProjectSearchView {
    if (!this.projectSearchView) {
      this.projectSearchView = new ProjectSearchView({
        language: this.settings.language,
        onOpenMatch: (match) => this.openSearchMatch(match),
      });
    }
    return this.projectSearchView;
  }

  private openProjectSearch(): void {
    if (!this.folder) return;
    this.modal = { kind: "none" };
    this.versionOpen = false;
    this.editorVisible = true;
    if (this.bufferSearchOpen) this.closeBufferSearch(false);
    this.tabState = openProjectSearchInTabs(
      this.tabState,
      this.settings.language,
    );
    this.render();
    const bar = this.ensureProjectSearchBar();
    window.setTimeout(() => bar.focus(), 0);
  }

  private scheduleProjectSearch(query: SearchBarQuery): void {
    this.projectSearchQuery = query;
    this.projectSearchGeneration += 1;
    if (this.projectSearchTimer !== null) {
      window.clearTimeout(this.projectSearchTimer);
      this.projectSearchTimer = null;
    }
    this.projectSearchBar?.setError("");
    const text = query.search.trim();
    if (text.length < 2) {
      this.projectSearchResults = [];
      this.projectSearchLoading = false;
      this.projectSearchError = "";
      this.syncProjectSearchView();
      return;
    }
    if (query.regexp) {
      try {
        new RegExp(query.search);
      } catch {
        const message = t(this.settings.language, "searchInvalidRegex");
        this.projectSearchResults = [];
        this.projectSearchLoading = false;
        this.projectSearchError = message;
        this.projectSearchBar?.setError(message);
        this.syncProjectSearchView();
        return;
      }
    }
    this.projectSearchResults = [];
    this.projectSearchLoading = true;
    this.projectSearchError = "";
    this.syncProjectSearchView();
    const generation = this.projectSearchGeneration;
    this.projectSearchTimer = window.setTimeout(() => {
      this.projectSearchTimer = null;
      void this.runProjectSearch(query, generation);
    }, 180);
  }

  private async runProjectSearch(
    query: SearchBarQuery,
    generation: number,
  ): Promise<void> {
    if (!this.folder) return;
    try {
      const matches = await backend.searchInFolder(
        this.folder.rootPath,
        query.search,
        1000,
        true,
        {
          caseSensitive: query.caseSensitive,
          wholeWord: query.wholeWord,
          regex: query.regexp,
        },
      );
      if (generation !== this.projectSearchGeneration) return;
      this.projectSearchResults = matches;
      this.projectSearchLoading = false;
      this.projectSearchError = "";
      this.syncProjectSearchView();
    } catch (error) {
      if (generation !== this.projectSearchGeneration) return;
      const message = error instanceof Error ? error.message : String(error);
      this.projectSearchResults = [];
      this.projectSearchLoading = false;
      this.projectSearchError = message;
      if (/invalid regular expression/i.test(message)) {
        this.projectSearchBar?.setError(
          t(this.settings.language, "searchInvalidRegex"),
        );
      }
      this.syncProjectSearchView();
    }
  }

  private syncProjectSearchView(): void {
    const view = this.projectSearchView;
    if (!view) return;
    view.update({
      language: this.settings.language,
      query: this.projectSearchQuery,
      results: this.projectSearchResults,
      loading: this.projectSearchLoading,
      error: this.projectSearchError,
    });
    const info = view.selectionInfo();
    this.projectSearchBar?.setMatchInfo(info.current, info.total);
    this.refreshProjectSearchStatusbar();
  }

  private refreshProjectSearchStatusbar(): void {
    const active = this.getActiveTab();
    if (!active || !isProjectSearchPath(active.path)) return;
    const statusBar = this.rootEl.querySelector(".statusbar");
    if (statusBar) {
      statusBar.replaceWith(
        this.renderStatusbar(this.settings.language, active),
      );
    }
  }

  private navigateProjectSearch(delta: number): void {
    const view = this.projectSearchView;
    if (!view) return;
    if (delta > 0) view.selectNext();
    else view.selectPrevious();
    const info = view.selectionInfo();
    this.projectSearchBar?.setMatchInfo(info.current, info.total);
  }

  private projectSearchPaths(): string[] {
    return [...new Set(this.projectSearchResults.map((match) => match.path))];
  }

  private hasDirtyProjectSearchTabs(paths: readonly string[]): boolean {
    return this.tabState.tabs.some(
      (tab) => paths.includes(tab.path) && isTabDirty(tab),
    );
  }

  private async reloadProjectSearchTabs(paths: readonly string[]): Promise<void> {
    if (!this.folder) return;
    const root = this.folder.rootPath;
    const changed = new Set(paths);
    for (const path of changed) {
      const tab = this.tabState.tabs.find((item) => item.path === path);
      if (!tab) continue;
      try {
        const content = await backend.readTextFile(root, path);
        this.tabState = updateTabContent(this.tabState, path, content);
        this.tabState = markTabSaved(this.tabState, path);
      } catch {
        // The search will surface a read error on the next pass.
      }
    }
    const active = this.getActiveTab();
    if (active && changed.has(active.path)) {
      const tab = this.tabState.tabs.find((item) => item.path === active.path);
      if (tab) {
        this.editor?.openDocument(active.path, tab.content, this.settings);
      }
    }
  }

  private async refreshAfterProjectReplace(paths: readonly string[]): Promise<void> {
    await this.reloadProjectSearchTabs(paths);
    await this.refreshTree();
    await this.refreshGitStatus();
    if (this.projectSearchQuery.search.trim().length >= 2) {
      this.projectSearchGeneration += 1;
      await this.runProjectSearch(
        this.projectSearchQuery,
        this.projectSearchGeneration,
      );
    }
    this.render();
  }

  private async replaceProjectSelection(replacement: string): Promise<void> {
    const match = this.projectSearchView?.selectedMatch();
    if (!match) {
      this.showStatusNotice(
        t(this.settings.language, "projectReplaceNoSelection"),
      );
      return;
    }
    if (!this.folder) return;
    if (this.hasDirtyProjectSearchTabs([match.path])) {
      this.showStatusNotice(
        t(this.settings.language, "projectReplaceDirty"),
      );
      return;
    }
    const lang = this.settings.language;
    const query = this.projectSearchQuery;
    try {
      const content = await backend.readTextFile(
        this.folder.rootPath,
        match.path,
      );
      const result = replaceSearchInTextAtLine(
        content,
        match.line,
        query,
        replacement,
      );
      if (result.replacements === 0) {
        this.showStatusNotice(
          t(lang, "projectReplaceNoChange", { path: match.path }),
        );
        return;
      }
      await backend.writeTextFile(
        this.folder.rootPath,
        match.path,
        result.content,
      );
      await this.refreshAfterProjectReplace([match.path]);
      this.statusNotice =
        result.replacements === 1
          ? t(lang, "projectReplaceSelectionDoneOne", { path: match.path })
          : t(lang, "projectReplaceSelectionDone", {
              count: String(result.replacements),
              path: match.path,
            });
      this.render();
    } catch (error) {
      this.showStatusNotice(
        t(lang, "projectReplaceFailed", {
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  private requestProjectReplaceAll(replacement: string): void {
    if (this.projectSearchResults.length === 0) {
      this.showStatusNotice(
        t(this.settings.language, "projectReplaceNoResults"),
      );
      return;
    }
    const paths = this.projectSearchPaths();
    if (this.hasDirtyProjectSearchTabs(paths)) {
      this.showStatusNotice(
        t(this.settings.language, "projectReplaceDirty"),
      );
      return;
    }
    this.modal = { kind: "confirm-project-replace", replacement };
    this.render();
  }

  private async performProjectReplaceAll(replacement: string): Promise<void> {
    if (!this.folder) return;
    const lang = this.settings.language;
    const query = this.projectSearchQuery;
    const paths = this.projectSearchPaths();
    let replacements = 0;
    let filesChanged = 0;
    let firstError = "";
    for (const path of paths) {
      try {
        const content = await backend.readTextFile(
          this.folder.rootPath,
          path,
        );
        const result = replaceSearchInText(content, query, replacement);
        if (result.replacements === 0) continue;
        await backend.writeTextFile(
          this.folder.rootPath,
          path,
          result.content,
        );
        replacements += result.replacements;
        filesChanged += 1;
      } catch (error) {
        if (!firstError) {
          firstError = error instanceof Error ? error.message : String(error);
        }
      }
    }
    await this.refreshAfterProjectReplace(paths);
    if (firstError) {
      this.statusNotice = t(lang, "projectReplaceFailed", {
        error: firstError,
      });
    } else if (replacements === 1 && filesChanged === 1) {
      this.statusNotice = t(lang, "projectReplaceDoneOneOne");
    } else if (replacements === 1) {
      this.statusNotice = t(lang, "projectReplaceDoneOne", {
        files: String(filesChanged),
      });
    } else if (filesChanged === 1) {
      this.statusNotice = t(lang, "projectReplaceDoneOneFile", {
        count: String(replacements),
      });
    } else {
      this.statusNotice = t(lang, "projectReplaceDone", {
        count: String(replacements),
        files: String(filesChanged),
      });
    }
    this.render();
  }

  private resetProjectSearch(): void {
    this.projectSearchGeneration += 1;
    if (this.projectSearchTimer !== null) {
      window.clearTimeout(this.projectSearchTimer);
      this.projectSearchTimer = null;
    }
    this.projectSearchBar = null;
    this.projectSearchView = null;
    this.projectSearchQuery = {
      search: "",
      caseSensitive: false,
      wholeWord: false,
      regexp: false,
    };
    this.projectSearchResults = [];
    this.projectSearchLoading = false;
    this.projectSearchError = "";
  }

  private closeModal(): void {
    this.importDocxRequest += 1;
    this.importFdxRequest += 1;
    this.modal = { kind: "none" };
    this.render();
  }

  private openQuickFile(path: string): void {
    this.modal = { kind: "none" };
    void this.openFileFromTree(path, true);
  }

  private openSearchMatch(match: SearchMatch): void {
    this.modal = { kind: "none" };
    void this.openFileAtLine(match.path, match.line, true);
  }

  private async openFileAtLine(
    path: string,
    line: number,
    withBufferSearch = false,
  ): Promise<void> {
    await this.openFileFromTree(path, true);
    this.tabState = setTabViewMode(this.tabState, path, "edit");
    this.render();
    this.editor?.gotoLine(line);
    if (withBufferSearch) {
      this.openBufferSearchWithQuery(this.projectSearchQuery);
    }
  }

  private openBufferSearchWithQuery(query: SearchBarQuery): void {
    this.openBufferSearch(false);
    const bar = this.bufferSearchBar;
    if (!bar) return;
    bar.setQuery(query.search, {
      caseSensitive: query.caseSensitive,
      wholeWord: query.wholeWord,
      regexp: query.regexp,
    });
    bar.focus();
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

    if (this.versionOpen && this.gitStatus?.isRepository) {
      this.versionDiffs = {};
      await this.refreshVersionStats();
      void this.loadExpandedVersionDiffs();
    }

    if (event.paths.includes("bradbit-kit.json")) {
      void this.refreshProjectContributions();
    } else if (
      event.paths.some((path) => matchesAnySource(path, this.symbolSources))
    ) {
      void this.refreshProjectSymbols();
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
    if (!active || isProjectSearchPath(active.path)) return false;
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

  private async exportActiveMarkdownDocx(): Promise<void> {
    const active = this.getActiveTab();
    if (
      !active ||
      !this.folder ||
      !isTauriEnvironment() ||
      !isMarkdownPath(active.path)
    ) {
      return;
    }

    const title = active.name.replace(/\.(md|mdx|markdown)$/i, "");
    const author = effectiveGitAuthor(this.settings).name || "Bradbit Writer";

    try {
      const output = await backend.exportMarkdownDocx(
        this.folder.rootPath,
        active.path,
        active.content,
        title,
        author,
      );
      this.showStatusNotice(
        `${t(this.settings.language, "docxExported")}: ${output}`,
      );
    } catch (err) {
      this.showStatusNotice(err instanceof Error ? err.message : String(err));
    }
  }

  private async exportActiveMarkdownEpub(): Promise<void> {
    const active = this.getActiveTab();
    if (
      !active ||
      !this.folder ||
      !isTauriEnvironment() ||
      !isMarkdownPath(active.path)
    ) {
      return;
    }

    const title = active.name.replace(/\.(md|mdx|markdown)$/i, "");
    const author = effectiveGitAuthor(this.settings).name || "Bradbit Writer";

    try {
      const output = await backend.exportMarkdownEpub(
        this.folder.rootPath,
        active.path,
        active.content,
        title,
        author,
        this.settings.language,
      );
      this.showStatusNotice(
        `${t(this.settings.language, "epubExported")}: ${output}`,
      );
    } catch (err) {
      this.showStatusNotice(err instanceof Error ? err.message : String(err));
    }
  }

  private async exportFolderPdf(node: FileTreeNode): Promise<void> {
    if (!this.folder || !isTauriEnvironment()) {
      return;
    }
    const lang = this.settings.language;
    const author = effectiveGitAuthor(this.settings).name || "Bradbit Writer";

    try {
      const result = await backend.exportFolderPdf(
        this.folder.rootPath,
        node.path,
        "",
        author,
      );
      if (result.outputs.length === 1) {
        this.showStatusNotice(
          `${t(lang, "pdfExported")}: ${result.outputs[0]}`,
        );
        return;
      }
      const first = result.outputs[0] ?? "";
      const separator = first.lastIndexOf("/");
      const folder = separator > 0 ? first.slice(0, separator) : first;
      this.showStatusNotice(
        t(lang, "folderPdfExported", {
          count: String(result.outputs.length),
          path: folder,
        }),
      );
    } catch (err) {
      if (isFolderPdfError(err)) {
        this.modal = { kind: "folder-pdf-error", error: err };
        this.render();
        return;
      }
      this.showStatusNotice(err instanceof Error ? err.message : String(err));
    }
  }

  private async importDocx(): Promise<void> {
    const lang = this.settings.language;
    if (!this.folder) {
      this.showStatusNotice(t(lang, "importDocxNoFolder"));
      return;
    }

    const source = await backend.pickDocxFileDialog();
    if (!source) return;

    const request = ++this.importDocxRequest;
    const sourceName = source.split(/[\\/]/).pop() ?? source;
    this.modal = { kind: "import-docx", status: "loading", sourceName };
    this.render();

    try {
      const encoded = await backend.readDocxFile(source);
      if (request !== this.importDocxRequest) return;

      const bytes = Uint8Array.from(atob(encoded), (char) =>
        char.charCodeAt(0),
      );
      const result = await convertDocxToMarkdown(bytes.buffer);
      if (request !== this.importDocxRequest) return;
      if (!result.markdown.trim()) {
        throw new Error(t(lang, "importDocxEmpty"));
      }

      this.modal = {
        kind: "import-docx",
        status: "ready",
        sourceName,
        previewMode: "rendered",
        ...result,
      };
      this.render();
    } catch (err) {
      if (request !== this.importDocxRequest) return;
      this.modal = {
        kind: "import-docx",
        status: "error",
        sourceName,
        error: err instanceof Error ? err.message : String(err),
      };
      this.render();
    }
  }

  private async submitDocxImport(): Promise<void> {
    if (
      this.modal.kind !== "import-docx" ||
      this.modal.status !== "ready" ||
      !this.folder
    ) {
      return;
    }

    const current = this.modal;
    const markdown = current.markdown ?? "";
    const existing = new Set(
      flattenFileTree(this.folder.tree).map((file) => file.path),
    );
    let relativePath = "manuscript/imported.md";
    let suffix = 2;
    while (existing.has(relativePath)) {
      relativePath = `manuscript/imported-${suffix}.md`;
      suffix += 1;
    }

    try {
      await backend.writeTextFile(
        this.folder.rootPath,
        relativePath,
        markdown,
      );
      this.importDocxRequest += 1;
      this.modal = { kind: "none" };
      await this.refreshTree();
      this.render();
      await this.openFileFromTree(relativePath, true);
      this.showStatusNotice(
        t(this.settings.language, "importDocxDone", {
          path: relativePath,
        }),
      );
    } catch (err) {
      this.modal = {
        ...current,
        error: err instanceof Error ? err.message : String(err),
      };
      this.render();
    }
  }

  private docxWarningText(
    lang: AppSettings["language"],
    warning: DocxImportWarning,
    modal: Extract<ModalState, { kind: "import-docx" }>,
  ): string {
    switch (warning) {
      case "images":
        return t(lang, "importDocxImages", {
          count: String(modal.images ?? 0),
        });
      case "tables":
        return t(lang, "importDocxTables", {
          count: String(modal.tables ?? 0),
        });
      case "styles":
        return t(lang, "importDocxStyles");
      case "comments":
        return t(lang, "importDocxComments");
      case "trackedChanges":
        return t(lang, "importDocxTracked");
    }
  }

  private async importFdx(): Promise<void> {
    const lang = this.settings.language;
    if (!this.folder) {
      this.showStatusNotice(t(lang, "importFdxNoFolder"));
      return;
    }

    const source = await backend.pickFdxFileDialog();
    if (!source) return;

    const request = ++this.importFdxRequest;
    const sourceName = source.split(/[\\/]/).pop() ?? source;
    this.modal = { kind: "import-fdx", status: "loading", sourceName };
    this.render();

    try {
      const fountain = await backend.convertFdxFile(source);
      if (request !== this.importFdxRequest) return;
      if (!fountain.trim()) {
        throw new Error(t(lang, "importFdxEmpty"));
      }
      this.modal = {
        kind: "import-fdx",
        status: "ready",
        sourceName,
        fountain,
        previewMode: "rendered",
      };
      this.render();
    } catch (err) {
      if (request !== this.importFdxRequest) return;
      this.modal = {
        kind: "import-fdx",
        status: "error",
        sourceName,
        error: err instanceof Error ? err.message : String(err),
      };
      this.render();
    }
  }

  private async submitFdxImport(): Promise<void> {
    if (
      this.modal.kind !== "import-fdx" ||
      this.modal.status !== "ready" ||
      !this.folder
    ) {
      return;
    }

    const current = this.modal;
    const fountain = current.fountain ?? "";
    const existing = new Set(
      flattenFileTree(this.folder.tree).map((file) => file.path),
    );
    let relativePath = "script/imported.fountain";
    let suffix = 2;
    while (existing.has(relativePath)) {
      relativePath = `script/imported-${suffix}.fountain`;
      suffix += 1;
    }

    try {
      await backend.writeTextFile(
        this.folder.rootPath,
        relativePath,
        fountain,
      );
      this.importFdxRequest += 1;
      this.modal = { kind: "none" };
      await this.refreshTree();
      this.render();
      await this.openFileFromTree(relativePath, true);
      this.showStatusNotice(
        t(this.settings.language, "importFdxDone", {
          path: relativePath,
        }),
      );
    } catch (err) {
      this.modal = {
        ...current,
        error: err instanceof Error ? err.message : String(err),
      };
      this.render();
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
      case "file.importDocx":
        await this.importDocx();
        break;
      case "file.importFdx":
        await this.importFdx();
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
      case "file.exportDocx":
        await this.exportActiveMarkdownDocx();
        break;
      case "file.exportEpub":
        await this.exportActiveMarkdownEpub();
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
        this.openBufferSearch(false);
        break;
      case "edit.findReplace":
        this.openBufferSearch(true);
        break;
      case "edit.findInProject":
        this.openProjectSearch();
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
      if (e.key === "Escape" && !e.defaultPrevented) {
        if (this.welcomeProjectOpen) {
          e.preventDefault();
          this.closeWelcomeProject();
          return;
        }
        if (this.welcomeTemplatePickerOpen) {
          e.preventDefault();
          this.closeWelcomeTemplatePicker();
          return;
        }
        if (this.welcomeSwitcherOpen) {
          e.preventDefault();
          this.closeWelcomeSwitcher();
          return;
        }
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
        this.openProjectSearch();
      } else if (letter === "f" && this.getActiveTab()) {
        e.preventDefault();
        this.openBufferSearch(false);
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
    if (
      this.bufferSearchOpen &&
      (this.versionOpen || !activeTab || activeTab.viewMode !== "edit")
    ) {
      this.bufferSearchOpen = false;
      this.bufferSearchBar = null;
      this.bufferSearchPath = null;
      this.bufferSearchPending = false;
      this.editor?.clearSearch();
    } else if (
      this.bufferSearchOpen &&
      activeTab &&
      activeTab.path !== this.bufferSearchPath
    ) {
      this.bufferSearchPath = activeTab.path;
      this.bufferSearchPending = true;
    }
    const versionScroll = this.versionOpen
      ? this.versionScrollPositions()
      : null;
    const focusedComposer =
      document.activeElement instanceof HTMLTextAreaElement &&
      document.activeElement.matches('[data-testid="version-message"]');
    const composerCursor = focusedComposer
      ? (document.activeElement as HTMLTextAreaElement).selectionStart
      : 0;

    // Preserve CodeMirror and diff hosts across renders so typing/focus never drops
    if (!this.cmHostEl) {
      this.cmHostEl = document.createElement("div");
      this.cmHostEl.className = "cm-host";
    }
    if (!this.diffHostEl) {
      this.diffHostEl = document.createElement("div");
      this.diffHostEl.className = "diff-host";
    }

    const previousTree = this.rootEl.querySelector<HTMLElement>(".tree-container");
    if (previousTree) this.treeScrollTop = previousTree.scrollTop;
    const chatScroll: ChatScrollState | null =
      this.chatPanel?.getScrollState() ?? null;

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
        chatVisible: this.chatVisible && !this.versionOpen,
        editorVisible: this.editorVisible,
        sessionWidth: this.sessionWidth,
      });
      if (!this.versionOpen) this.chatVisible = layout.chatVisible;

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
    this.startOpeningAnimation();

    if (chatScroll) this.chatPanel?.restoreScrollState(chatScroll);
    if (versionScroll) this.restoreVersionScroll(versionScroll);
    if (focusedComposer) {
      const input = this.rootEl.querySelector<HTMLTextAreaElement>(
        '[data-testid="version-message"]',
      );
      if (input) {
        input.focus({ preventScroll: true });
        input.setSelectionRange(composerCursor, composerCursor);
      }
    }

    const nextTree = this.rootEl.querySelector<HTMLElement>(".tree-container");
    if (nextTree) nextTree.scrollTop = this.treeScrollTop;

    // Sync CodeMirror instance if a tab is active
    if (
      this.folder &&
      activeTab &&
      this.cmHostEl &&
      !this.versionOpen &&
      !isProjectSearchPath(activeTab.path)
    ) {
      if (!this.editor) {
        this.editor = new BradbitCodeMirror(this.cmHostEl, this.settings, {
          onContentChange: (path, content) => {
            this.tabState = updateTabContent(this.tabState, path, content);
            this.updateLightweightChrome();
            this.refreshOutlineSoon();
            if (this.inlineBlameEnabled) this.editor?.setInlineBlame([]);
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
          computeDiffHunks: (original, current) =>
            backend.diffLineHunks(original, current),
          getFountainBibleSymbols: () => this.getFountainSymbols(),
        });
        this.editor.setInlineBlameEnabled(this.inlineBlameEnabled);
      }
      if (activeTab.viewMode !== "diff") {
        this.editor.openDocument(activeTab.path, activeTab.content, this.settings);
      }
      this.syncInlineDiff(activeTab);
      this.syncInlineBlame(activeTab);
      if (this.bufferSearchPending && this.bufferSearchBar) {
        this.bufferSearchPending = false;
        this.applyBufferSearch(this.bufferSearchBar.getQuery());
      }
    }

    if (!this.versionOpen) this.syncDiffView(activeTab);

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
    container.className = "welcome-screen welcome-home-screen";

    const inner = document.createElement("div");
    inner.className = "welcome-home-inner";

    const wordmark = document.createElement("h1");
    wordmark.className = "welcome-wordmark";
    wordmark.textContent = t(lang, "welcomeChatTitle");

    const chatShell = document.createElement("section");
    chatShell.className = "welcome-chat-shell";
    chatShell.dataset.testid = "welcome-chat-shell";

    this.welcomeStatusEl = document.createElement("div");
    this.welcomeStatusEl.className = "welcome-chat-status";
    this.welcomeStatusEl.dataset.testid = "welcome-chat-status";
    const spinner = document.createElement("span");
    spinner.className = "welcome-chat-spinner";
    spinner.appendChild(createIcon("refresh-cw", 13));
    this.welcomeStatusTextEl = document.createElement("span");
    this.welcomeStatusEl.append(spinner, this.welcomeStatusTextEl);
    this.welcomeStatusEl.hidden = true;

    const chatHost = document.createElement("div");
    chatHost.className = "welcome-chat-host";
    if (isTauriEnvironment()) {
      const panel = this.ensureWelcomeChatPanel();
      chatHost.appendChild(panel.element);
      panel.setWelcomePrompt(
        this.renderWelcomeTemplatePrompt(lang),
      );
    } else {
      const unavailable = document.createElement("p");
      unavailable.className = "welcome-chat-unavailable";
      unavailable.textContent = t(lang, "chatNoDesktop");
      chatHost.appendChild(unavailable);
    }
    chatShell.append(this.welcomeStatusEl, chatHost);

    const footer = document.createElement("div");
    footer.className = "welcome-home-footer";
    const location = document.createElement("button");
    location.type = "button";
    location.className = "welcome-location";
    location.dataset.testid = "welcome-location";
    location.onclick = () => this.toggleWelcomeSwitcher();
    const folderIcon = document.createElement("span");
    folderIcon.className = "welcome-location-icon";
    folderIcon.appendChild(createIcon("folder", 14));
    this.welcomeLocationLabelEl = document.createElement("span");
    this.welcomeLocationLabelEl.className = "welcome-location-label";
    const chevron = document.createElement("span");
    chevron.className = "welcome-location-chevron";
    chevron.appendChild(createIcon("chevron-down", 13));
    location.append(folderIcon, this.welcomeLocationLabelEl, chevron);
    this.welcomeLocationEl = location;
    footer.appendChild(location);

    inner.append(wordmark, chatShell);
    const requestCard = this.renderWelcomeRequestCard(lang);
    if (requestCard) {
      inner.appendChild(requestCard);
    }
    inner.appendChild(footer);
    container.appendChild(inner);

    if (this.welcomeProjectOpen) {
      container.appendChild(this.renderWelcomeProjectDialog(lang));
    } else if (this.welcomeSwitcherOpen) {
      container.appendChild(this.renderWelcomeSwitcher(lang));
    } else if (this.welcomeTemplatePickerOpen) {
      container.appendChild(this.renderWelcomeTemplatePicker(lang));
    }

    this.updateWelcomeChatStatus();
    this.updateWelcomeLocation();
    if (!this.folder && isTauriEnvironment()) {
      void this.startWelcomeChat();
    }
    return container;
  }

  private renderWelcomeRequestCard(
    lang: AppSettings["language"],
  ): HTMLElement | null {
    const draft = this.welcomeDraft;
    if (!draft) return null;
    const card = document.createElement("section");
    card.className = "welcome-brief-card";
    card.dataset.testid = "welcome-brief-card";
    const icon = document.createElement("span");
    icon.className = "welcome-brief-card-icon";
    icon.appendChild(createIcon("sparkles", 16));
    const copy = document.createElement("div");
    copy.className = "welcome-brief-card-copy";
    const title = document.createElement("strong");
    title.textContent = t(lang, "welcomeDraftReadyTitle", {
      name: draft.name,
    });
    const hint = document.createElement("span");
    hint.textContent = t(lang, "welcomeDraftReadyHint");
    const meta = document.createElement("span");
    meta.className = "welcome-brief-card-meta";
    const template = this.welcomeTemplates.find(
      (item) => item.id === draft.templateId,
    );
    meta.textContent = [template?.name, welcomeDraftPreview(draft)]
      .filter(Boolean)
      .join(" · ");
    copy.append(title, hint, meta);
    const action = document.createElement("button");
    action.type = "button";
    action.className = "toolbar-btn primary";
    action.dataset.testid = "welcome-brief-review";
    action.textContent = t(lang, "welcomeDraftReadyAction");
    action.onclick = () => this.openWelcomeProject();
    card.append(icon, copy, action);
    return card;
  }

  private renderWelcomeProjectDialog(
    lang: AppSettings["language"],
  ): HTMLElement {
    const backdrop = document.createElement("div");
    backdrop.className = "welcome-switcher-backdrop welcome-project-backdrop";
    backdrop.dataset.testid = "welcome-project-backdrop";
    backdrop.onclick = () => this.closeWelcomeProject();

    const panel = document.createElement("section");
    panel.className = "welcome-switcher welcome-project-dialog";
    panel.dataset.testid = "welcome-project-dialog";
    panel.onclick = (event) => event.stopPropagation();

    const draft = this.welcomeDraft;
    if (draft) {
      panel.appendChild(
        renderWelcomeProjectForm({
          language: lang,
          draft,
          templates: this.welcomeTemplates,
          destinationPickedBeforeChat: this.welcomeDestinationQuestion,
          onChange: (patch) => this.updateWelcomeDraft(patch),
          onChooseDestination: () =>
            void this.chooseWelcomeProjectDestination(),
          onUsePickedDestination: () => this.usePickedWelcomeDestination(),
          onCancel: () => this.closeWelcomeProject(),
          onCreate: () => void this.submitWelcomeProject(),
        }),
      );
    }
    backdrop.appendChild(panel);
    return backdrop;
  }

  private renderWelcomeSwitcher(lang: AppSettings["language"]): HTMLElement {
    const backdrop = document.createElement("div");
    backdrop.className = "welcome-switcher-backdrop";
    backdrop.dataset.testid = "welcome-switcher-backdrop";
    backdrop.onclick = () => this.closeWelcomeSwitcher();

    const panel = document.createElement("section");
    panel.className = "welcome-switcher";
    panel.dataset.testid = "welcome-switcher";
    panel.onclick = (event) => event.stopPropagation();

    const searchWrap = document.createElement("div");
    searchWrap.className = "welcome-switcher-search";
    const searchIcon = document.createElement("span");
    searchIcon.className = "welcome-switcher-search-icon";
    searchIcon.appendChild(createIcon("search", 14));
    const search = document.createElement("input");
    search.type = "text";
    search.className = "welcome-switcher-input";
    search.dataset.testid = "welcome-switcher-search";
    search.placeholder = t(lang, "welcomeProjectsSearch");
    search.spellcheck = false;
    search.value = this.welcomeSwitcherQuery;
    search.onkeydown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.closeWelcomeSwitcher();
      }
    };
    searchWrap.append(searchIcon, search);

    const destination = document.createElement("div");
    destination.className = "welcome-switcher-destination";
    const destinationInfo = document.createElement("div");
    destinationInfo.className = "welcome-switcher-destination-info";
    const destinationLabel = document.createElement("span");
    destinationLabel.className = "welcome-switcher-kicker";
    destinationLabel.textContent = t(lang, "welcomeProjectDestination");
    const destinationPath = document.createElement("span");
    destinationPath.className = "welcome-switcher-path";
    destinationPath.textContent =
      this.welcomeDestination || t(lang, "welcomeChooseDestination");
    destinationInfo.append(destinationLabel, destinationPath);
    const changeDestination = document.createElement("button");
    changeDestination.type = "button";
    changeDestination.className = "welcome-switcher-link";
    changeDestination.dataset.testid = "welcome-change-destination";
    changeDestination.textContent = t(lang, "welcomeChangeDestination");
    changeDestination.onclick = () => void this.chooseWelcomeDestination();
    destination.append(destinationInfo, changeDestination);

    const list = document.createElement("div");
    list.className = "welcome-switcher-list";

    const renderRows = () => {
      list.replaceChildren();
      const projects = this.welcomeProjectRows();
      if (projects.length === 0) {
        const empty = document.createElement("p");
        empty.className = "welcome-switcher-empty";
        empty.textContent =
          this.welcomeSwitcherQuery.trim().length > 0
            ? t(lang, "quickOpenEmpty")
            : t(lang, "welcomeProjectsEmpty");
        list.appendChild(empty);
        return;
      }
      for (const project of projects) {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "welcome-project-row";
        row.dataset.testid = "welcome-project-row";
        row.onclick = () => {
          this.welcomeSwitcherOpen = false;
          void this.openFolderByPath(project.path);
        };
        const initial = document.createElement("span");
        initial.className = "welcome-project-initial";
        initial.textContent = (project.name.charAt(0) || "?").toUpperCase();
        const info = document.createElement("span");
        info.className = "welcome-project-info";
        const name = document.createElement("span");
        name.className = "welcome-project-name";
        name.textContent = project.name;
        const path = document.createElement("span");
        path.className = "welcome-project-path";
        path.textContent = project.path;
        info.append(name, path);
        const remove = createIconButton({
          icon: "x",
          label: t(lang, "removeRecent"),
          className: "welcome-project-remove",
          testId: "welcome-project-remove",
          onClick: async (event) => {
            event.stopPropagation();
            this.recents = await backend.removeRecentProject(project.path);
            renderRows();
          },
        });
        row.append(initial, info, remove);
        list.appendChild(row);
      }
    };
    search.oninput = () => {
      this.welcomeSwitcherQuery = search.value;
      renderRows();
    };
    renderRows();

    const actions = document.createElement("div");
    actions.className = "welcome-switcher-actions";
    const add = document.createElement("button");
    add.type = "button";
    add.className = "welcome-switcher-action";
    add.dataset.testid = "welcome-add-project";
    add.appendChild(createIcon("folder-plus", 14));
    const addLabel = document.createElement("span");
    addLabel.textContent = t(lang, "welcomeAddProject");
    const shortcut = document.createElement("kbd");
    shortcut.textContent = "⌘O";
    add.append(addLabel, shortcut);
    add.onclick = () => {
      this.welcomeSwitcherOpen = false;
      void this.handleOpenFolderDialog();
    };
    const create = document.createElement("button");
    create.type = "button";
    create.className = "welcome-switcher-action";
    create.dataset.testid = "welcome-new-project";
    create.appendChild(createIcon("plus", 14));
    const createLabel = document.createElement("span");
    createLabel.textContent = t(lang, "welcomeNewProject");
    create.appendChild(createLabel);
    create.onclick = () => {
      this.welcomeSwitcherOpen = false;
      void this.openNewProjectModal();
    };
    actions.append(add, create);

    panel.append(searchWrap, destination, list, actions);
    backdrop.appendChild(panel);
    window.setTimeout(() => search.focus(), 10);
    return backdrop;
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
          if (!changed && this.sidebarVisible) {
            if (
              section.id === "versions" &&
              !this.versionOpen &&
              this.gitStatus?.isRepository
            ) {
              this.openVersionChanges();
            }
            return;
          }
          this.sidebarVisible = true;
          this.sidebarTab = section.id;
          if (section.id === "versions" && this.gitStatus?.isRepository) {
            this.openVersionChanges();
          } else {
            this.render();
          }
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
        if (matchesAnyGlob(node.path, this.primaryPaths)) {
          row.classList.add("tree-primary");
        }
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
        } else if (isMarkdownPath(node.name)) {
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
          row.classList.add(`tree-git-${badgeClass(badge)}`);
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

        row.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.showTreeContextMenu(event, node);
        });

        treeContainer.appendChild(row);

        if (node.isDir && node.children && !isCollapsed) {
          renderNodes(node.children, depth + 1);
        }
      }
    };

    renderNodes(filteredTree, 0);
    return treeContainer;
  }

  private showTreeContextMenu(event: MouseEvent, node: FileTreeNode): void {
    const lang = this.settings.language;
    const items: ContextMenuItem[] = [];
    const separator = (id: string): ContextMenuItem => ({
      id,
      label: "",
      separator: true,
    });

    if (!node.isDir) {
      items.push({
        id: "open",
        label: t(lang, "open"),
        icon: "file-text",
        action: () => void this.openFileFromTree(node.path, true),
      });
    } else {
      items.push(
        {
          id: "new-file",
          label: t(lang, "newFile"),
          icon: "file-plus",
          action: () => this.openUntitledFile(node.path),
        },
        {
          id: "new-folder",
          label: t(lang, "newFolder"),
          icon: "folder-plus",
          action: () => this.openEntryModal("new-folder", node.path),
        },
        {
          id: "export-folder-pdf",
          label: t(lang, "exportFolderPdf"),
          icon: "download",
          action: () => void this.exportFolderPdf(node),
        },
      );
    }

    items.push(
      separator("edit-separator"),
      {
        id: "rename",
        label: t(lang, "rename"),
        icon: "pencil",
        action: () => this.openEntryModal("rename", node.path),
      },
      {
        id: "delete",
        label: t(lang, "delete"),
        icon: "trash",
        danger: true,
        action: () => {
          this.modal = { kind: "confirm-delete", targetPath: node.path };
          this.render();
        },
      },
      separator("path-separator"),
      {
        id: "copy-path",
        label: t(lang, "copyPath"),
        icon: "copy",
        action: () => {
          void copyTextToClipboard(node.path).then((copied) => {
            this.showStatusNotice(
              t(lang, copied ? "pathCopied" : "copyError"),
            );
          });
        },
      },
      {
        id: "reveal",
        label: t(lang, "revealInFinder"),
        icon: "external-link",
        action: () => {
          if (!this.folder) return;
          void backend
            .revealInFinder(this.folder.rootPath, node.path)
            .catch((error) => {
              console.error("Could not reveal the file", error);
              this.showStatusNotice(t(lang, "revealError"));
            });
        },
      },
    );

    openContextMenu({
      x: event.clientX,
      y: event.clientY,
      items,
      label: node.name,
    });
  }

  private showTabContextMenu(event: MouseEvent, tab: OpenTab): void {
    const lang = this.settings.language;
    const items: ContextMenuItem[] = [
      {
        id: "close-tab",
        label: t(lang, "closeTab"),
        icon: "x",
        action: () => this.requestCloseTab(tab.path),
      },
      {
        id: "close-others",
        label: t(lang, "closeOtherTabs"),
        action: () => this.closeOtherTabs(tab.path),
      },
    ];

    if (!tab.untitled && !isProjectSearchPath(tab.path)) {
      items.push(
        { id: "tab-separator", label: "", separator: true },
        {
          id: "rename-tab",
          label: t(lang, "rename"),
          icon: "pencil",
          action: () => this.openEntryModal("rename", tab.path),
        },
      );
      if (this.gitStatus?.isRepository) {
        items.push({
          id: "inline-blame",
          label: t(
            lang,
            this.inlineBlameEnabled ? "inlineBlameOn" : "inlineBlameOff",
          ),
          icon: "message-square",
          action: () => this.toggleInlineBlame(),
        });
        if (this.defaultBranchName()) {
          items.push({
            id: "diff-default-branch",
            label: t(
              lang,
              this.diffAgainstDefaultBranch
                ? "diffDefaultBranchOn"
                : "diffDefaultBranchOff",
            ),
            icon: "git-branch",
            action: () => this.toggleDiffAgainstDefaultBranch(),
          });
        }
      }
      items.push(
        { id: "tab-separator-2", label: "", separator: true },
        {
          id: "copy-tab-path",
          label: t(lang, "copyPath"),
          icon: "copy",
          action: () => {
            void copyTextToClipboard(tab.path).then((copied) => {
              this.showStatusNotice(
                t(lang, copied ? "pathCopied" : "copyError"),
              );
            });
          },
        },
        {
          id: "reveal-tab",
          label: t(lang, "revealInFinder"),
          icon: "external-link",
          action: () => {
            if (!this.folder) return;
            void backend
              .revealInFinder(this.folder.rootPath, tab.path)
              .catch((error) => {
                console.error("Could not reveal the file", error);
                this.showStatusNotice(t(lang, "revealError"));
              });
          },
        },
      );
    }

    openContextMenu({
      x: event.clientX,
      y: event.clientY,
      items,
      label: tab.name,
    });
  }

  private closeOtherTabs(path: string): void {
    const lang = this.settings.language;
    const others = this.tabState.tabs.filter((tab) => tab.path !== path);
    if (others.some(isTabDirty)) {
      this.showStatusNotice(t(lang, "closeOtherTabsDirty"));
      return;
    }

    for (const tab of others) {
      this.editor?.closeDocumentState(tab.path);
      this.tabState = closeTabInState(this.tabState, tab.path);
    }
    this.tabState = { ...this.tabState, activeTabPath: path };
    this.render();
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
    if (item.kind === "scene" && item.number !== undefined) {
      const number = document.createElement("span");
      number.className = "outline-scene-number";
      number.textContent = `${item.number}-`;
      row.appendChild(number);
    } else {
      if (item.kind === "scene") {
        icon.appendChild(createIcon("clapperboard", 13));
      } else if (item.kind === "section") {
        icon.appendChild(createIcon("hash", 13));
      }
      if (icon.childElementCount > 0) {
        row.appendChild(icon);
      }
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
    const entries = this.gitStatus?.entries ?? [];
    return createVersionSidebar(
      {
        language: lang,
        developerTerms:
          this.settings.gitDeveloperTerms &&
          this.settings.showDeveloperOptions,
        view: this.versionView,
        filter: this.versionFilter,
        isRepository: Boolean(this.gitStatus?.isRepository),
        branch: this.gitStatus?.branch ?? null,
        ahead: this.gitStatus?.ahead ?? 0,
        behind: this.gitStatus?.behind ?? 0,
        entries,
        stats: this.versionStats,
        selectedPath: this.versionSelectedPath,
        history: this.gitHistory,
        branches: this.gitBranches,
        historyLoading: this.gitHistoryLoading,
        expandedCommitId: this.gitExpandedCommitId,
        commitFiles: this.gitCommitFiles,
        commitMessage: this.gitCommitMessage,
        authorReady: isValidGitAuthor(
          this.settings.gitAuthorName,
          this.settings.gitAuthorEmail,
        ),
        busy: this.gitBusy,
        error: this.gitPanelError || this.githubError,
        githubTokenPresent: this.githubTokenPresent,
        githubAccount: this.githubAccount,
        hasRemote: this.gitRemotes.length > 0,
        githubRepo: found ? `${found.ref.owner}/${found.ref.repo}` : null,
        githubPullRequests: this.githubPullRequests,
        githubPrLoading: this.githubPrLoading,
        generatingMessage: this.versionGeneratingMessage,
      },
      {
        onInit: () => void this.enableVersionHistory(),
        onViewChange: (view) => {
          this.versionView = view;
          this.render();
        },
        onFilterChange: (filter) => {
          this.versionFilter = filter;
          this.render();
        },
        onSelectChange: (path) => this.selectVersionChange(path),
        onFileContextMenu: (path, event) =>
          this.showVersionFileMenu(path, event),
        onOpenChanges: () =>
          this.openVersionChanges(
            this.versionSelectedPath ?? entries[0]?.path,
          ),
        onToggleStage: (path) => void this.toggleVersionStage(path),
        onStagePaths: (paths) => void this.stageVersionPaths(paths, true),
        onUnstagePaths: (paths) => void this.stageVersionPaths(paths, false),
        onStageAll: () => void this.stageAllVersions(),
        onUnstageAll: () => void this.unstageAllVersions(),
        onCommitMessageChange: (value) => {
          this.gitCommitMessage = value;
        },
        onSaveVersion: (stageAll) => void this.saveVersion(stageAll),
        onGenerateMessage: () => void this.generateVersionMessage(),
        onToggleCommit: (id) => void this.toggleCommit(id),
        onRestoreFile: (commitId, path) =>
          this.requestRestoreFromCommit(commitId, path),
        onCreateBranch: () => this.requestNewBranch(),
        onCheckoutBranch: (name) => void this.checkoutBranch(name),
        onOpenSettings: () => {
          this.openSettingsModal();
        },
        onBranchMenu: (event) => this.showVersionBranchMenu(event),
        onPush: () => void this.pushVersionRemote(),
        onPublish: () => this.openPublishModal(),
        onConnectGitHub: () => this.openSettingsModal(),
        onOpenGitHubUrl: (url) => this.openGitHubUrl(url),
        onRefreshPullRequests: () => {
          void this.refreshGitHubPullRequests().then(() => this.render());
        },
        onOpenPullRequest: (url) => this.openGitHubUrl(url),
      },
    );
  }

  private renderVersionChanges(lang: AppSettings["language"]): HTMLElement {
    const entries = this.gitStatus?.entries ?? [];
    return createVersionChangesView(
      {
        language: lang,
        developerTerms:
          this.settings.gitDeveloperTerms &&
          this.settings.showDeveloperOptions,
        entries,
        stats: this.versionStats,
        diffs: this.versionDiffs,
        expanded: this.versionExpanded,
        selectedPath: this.versionSelectedPath,
        busy: this.gitBusy,
      },
      {
        onToggleFile: (path) => this.toggleVersionChange(path),
        onSelectFile: (path) => this.selectVersionChange(path),
        onFileContextMenu: (path, event) =>
          this.showVersionFileMenu(path, event),
        onToggleStage: (path) => void this.toggleVersionStage(path),
        onStageSelected: () => {
          if (this.versionSelectedPath) {
            void this.stageVersionPaths([this.versionSelectedPath], true);
          }
        },
        onUnstageSelected: () => {
          if (this.versionSelectedPath) {
            void this.stageVersionPaths([this.versionSelectedPath], false);
          }
        },
        onStageAll: () => void this.stageAllVersions(),
        onDiscardFile: (path) => this.requestDiscardPath(path),
        onExpandAll: () => {
          for (const entry of entries) this.versionExpanded.add(entry.path);
          this.renderVersionPreservingScroll();
          void this.loadExpandedVersionDiffs();
        },
        onCollapseAll: () => {
          this.versionExpanded.clear();
          this.renderVersionPreservingScroll();
        },
        onFocusComposer: () => this.focusVersionComposer(),
      },
    );
  }

  private async loadExpandedVersionDiffs(): Promise<void> {
    const pending = [...this.versionExpanded].filter(
      (path) => !this.versionDiffs[path],
    );
    if (pending.length === 0) return;
    await Promise.all(
      pending.map((path) => this.loadVersionDiff(path, false)),
    );
    this.renderVersionPreservingScroll();
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
    if (this.openingSurface) {
      column.style.width = this.openingSurface === "chat" ? "0px" : "100%";
      column.style.minWidth = "0";
      column.style.maxWidth = "none";
      column.style.overflow = "hidden";
    }
    if (
      this.settings.showDeveloperOptions &&
      this.sessionView === "terminal" &&
      this.folder
    ) {
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

    if (this.tabState.tabs.length > 0 || this.versionOpen) {
      const tabsBar = document.createElement("div");
      tabsBar.className = "tabs-bar";
      const gitBadges = buildGitBadgeMap(this.gitStatus?.entries ?? []);

      if (this.versionOpen) {
        const versionTab = document.createElement("div");
        versionTab.className = "tab-item version-tab active";
        versionTab.setAttribute("role", "tab");
        versionTab.tabIndex = 0;
        versionTab.dataset.tabPath = "__version_changes__";
        const icon = document.createElement("span");
        icon.className = "tab-version-icon";
        icon.appendChild(createIcon("git-branch", 13));
        const title = document.createElement("span");
        title.className = "tab-title";
        title.textContent = this.versionLabel("versionChangesTitle");
        title.title = this.versionLabel("versionChangesTitle");
        const count = document.createElement("span");
        count.className = "tab-version-count";
        count.textContent = String(this.gitStatus?.entries.length ?? 0);
        const closeBtn = createIconButton({
          icon: "x",
          label: t(lang, "close"),
          className: "tab-close-btn",
          onClick: (event) => {
            event.stopPropagation();
            this.closeVersionChanges();
          },
        });
        versionTab.append(icon, title, count, closeBtn);
        versionTab.onclick = () =>
          this.openVersionChanges(this.versionSelectedPath ?? undefined);
        tabsBar.appendChild(versionTab);
      }

      for (const tab of this.tabState.tabs) {
        const tabEl = document.createElement("div");
        tabEl.className = "tab-item";
        tabEl.setAttribute("role", "tab");
        tabEl.tabIndex = 0;
        tabEl.dataset.tabPath = tab.path;
        if (!this.versionOpen && tab.path === this.tabState.activeTabPath) {
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
          this.versionOpen = false;
          this.tabState = { ...this.tabState, activeTabPath: tab.path };
          this.render();
        };

        tabEl.ondblclick = () => {
          this.versionOpen = false;
          this.tabState = openFileInTabs(this.tabState, tab, true);
          this.render();
        };

        tabEl.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.showTabContextMenu(event, tab);
        });

        tabEl.appendChild(title);
        if (badgeEl) {
          tabEl.appendChild(badgeEl);
        }
        tabEl.append(dirtyDot, closeBtn);
        tabsBar.appendChild(tabEl);
      }

      col.appendChild(tabsBar);
    }

    if (this.versionOpen) {
      const surface = document.createElement("div");
      surface.className = "version-changes-surface";
      surface.appendChild(this.renderVersionChanges(lang));
      col.appendChild(surface);
      return col;
    }

    if (activeTab && isProjectSearchPath(activeTab.path)) {
      const bar = this.ensureProjectSearchBar();
      const view = this.ensureProjectSearchView();
      this.syncProjectSearchView();
      col.appendChild(bar.element());
      const surface = document.createElement("div");
      surface.className = "editor-surface project-search-surface";
      surface.appendChild(view.element());
      col.appendChild(surface);
      return col;
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
          onFileMenu: (event) => this.showTabContextMenu(event, activeTab),
        }),
      );
    }

    if (this.bufferSearchOpen && this.bufferSearchBar) {
      col.appendChild(this.bufferSearchBar.element());
    }

    if (
      activeTab &&
      isFountainPath(activeTab.path) &&
      activeTab.viewMode === "edit"
    ) {
      col.appendChild(
        createFountainToolbar(lang, (command) => {
          this.editor?.runFountainCommand(command);
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
      const bannerLabel = document.createElement("span");
      bannerLabel.className = "diff-banner-label";
      if (!ready) {
        bannerLabel.textContent = t(lang, "diffLoading");
      } else if (this.diffData?.isNew) {
        bannerLabel.textContent = t(lang, "diffNewFile");
        banner.classList.add("new-file");
      } else {
        const branch = this.defaultBranchName();
        bannerLabel.textContent =
          this.diffAgainstDefaultBranch && branch
            ? t(lang, "diffWithBranch", { branch })
            : t(lang, "diffWithHead");
      }
      const bannerActions = document.createElement("div");
      bannerActions.className = "diff-banner-actions";
      const branch = this.defaultBranchName();
      if (branch) {
        const branchButton = createIconButton({
          icon: "git-branch",
          label: t(lang, "diffDefaultBranch", { branch }),
          title: t(lang, "diffDefaultBranch", { branch }),
          className: "diff-mode-btn",
          active: this.diffAgainstDefaultBranch,
          onClick: () => this.toggleDiffAgainstDefaultBranch(),
        });
        branchButton.dataset.action = "diff-default-branch";
        bannerActions.appendChild(branchButton);
      }
      const modeToggle = document.createElement("div");
      modeToggle.className = "diff-mode-toggle";
      for (const mode of ["split", "unified"] as const) {
        const modeButton = createIconButton({
          icon: mode === "split" ? "columns-2" : "rows-3",
          label: t(lang, mode === "split" ? "diffSplit" : "diffUnified"),
          title: t(lang, mode === "split" ? "diffSplit" : "diffUnified"),
          className: "diff-mode-btn",
          active: this.diffViewMode === mode,
          onClick: () => {
            if (this.diffViewMode === mode) return;
            this.diffViewMode = mode;
            this.render();
          },
        });
        modeButton.dataset.diffMode = mode;
        modeToggle.appendChild(modeButton);
      }
      bannerActions.appendChild(modeToggle);
      banner.append(bannerLabel, bannerActions);
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
    if (!active || isProjectSearchPath(active.path)) return;
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

      if (this.settings.showDeveloperOptions) {
        const terminalToggle = createIconButton({
          icon: "terminal",
          label: t(lang, "chatToggleTerminal"),
          testId: "toggle-terminal-btn",
          active: this.sessionView === "terminal",
          onClick: () => this.toggleTerminalView(),
        });
        left.appendChild(terminalToggle);
      }

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
      if (isProjectSearchPath(activeTab.path)) {
        const label = document.createElement("span");
        label.textContent = t(lang, "globalSearchTitle");
        left.appendChild(label);
      } else {
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
          document.createTextNode(
            dirty ? ` ${t(lang, "unsaved")}` : ` ${t(lang, "saved")}`,
          ),
        );
        left.appendChild(dirtySpan);
      }

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
      if (isProjectSearchPath(activeTab.path)) {
        if (this.projectSearchResults.length > 0) {
          const files = new Set(
            this.projectSearchResults.map((match) => match.path),
          ).size;
          const countSpan = document.createElement("span");
          countSpan.textContent = projectSearchSummary(
            lang,
            this.projectSearchResults.length,
            files,
          );
          right.appendChild(countSpan);
        }
      } else {
        const counts = countWordsAndChars(activeTab.content);
        const countSpan = document.createElement("span");
        countSpan.textContent = `${counts.words} ${t(lang, "words")} · ${counts.chars} ${t(lang, "chars")}`;

        const posSpan = document.createElement("span");
        posSpan.textContent = `${t(lang, "lineShort")} ${activeTab.cursorLine}, ${t(lang, "colShort")} ${activeTab.cursorCol}`;

        right.append(countSpan, posSpan);
      }
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

  private renderImportDocxModal(
    lang: AppSettings["language"],
    dialog: HTMLElement,
  ): void {
    if (this.modal.kind !== "import-docx") return;
    const state = this.modal;
    dialog.classList.add("import-docx-dialog");

    const header = document.createElement("div");
    header.className = "import-docx-header";
    const title = document.createElement("h3");
    title.textContent = t(lang, "importDocxTitle");
    header.appendChild(title);
    dialog.appendChild(header);

    if (state.status === "loading") {
      const loading = document.createElement("p");
      loading.className = "settings-hint";
      loading.textContent = t(lang, "importDocxLoading", {
        name: state.sourceName,
      });
      dialog.appendChild(loading);
    } else if (state.status === "error") {
      const error = document.createElement("div");
      error.className = "error-banner";
      error.textContent = state.error || t(lang, "importDocxError");
      dialog.append(error);
    } else {
      const source = document.createElement("p");
      source.className = "settings-hint";
      source.textContent = t(lang, "importDocxSource", {
        name: state.sourceName,
      });

      const summary = document.createElement("p");
      summary.className = "import-docx-summary";
      summary.textContent = t(lang, "importDocxSummary", {
        words: String(state.words ?? 0),
        headings: String(state.headings ?? 0),
      });

      const keep = document.createElement("p");
      keep.className = "import-docx-keep";
      keep.textContent = t(lang, "importDocxKeep");

      const warnings = document.createElement("ul");
      warnings.className = "import-docx-warnings";
      for (const warning of state.warnings ?? []) {
        const item = document.createElement("li");
        item.textContent = this.docxWarningText(lang, warning, state);
        warnings.appendChild(item);
      }

      const previewMode = state.previewMode ?? "rendered";
      const previewTabs = document.createElement("div");
      previewTabs.className = "import-docx-preview-tabs";
      previewTabs.setAttribute("role", "tablist");

      const renderedTab = document.createElement("button");
      renderedTab.type = "button";
      renderedTab.className = "import-docx-preview-tab";
      renderedTab.dataset.testid = "import-docx-preview-rendered";
      renderedTab.setAttribute("role", "tab");
      renderedTab.setAttribute(
        "aria-selected",
        String(previewMode === "rendered"),
      );
      renderedTab.classList.toggle("active", previewMode === "rendered");
      renderedTab.appendChild(createIcon("eye", 14));
      renderedTab.appendChild(
        document.createTextNode(t(lang, "importDocxPreview")),
      );
      renderedTab.onclick = () => {
        if (this.modal.kind !== "import-docx") return;
        this.modal = { ...this.modal, previewMode: "rendered" };
        this.render();
      };

      const sourceTab = document.createElement("button");
      sourceTab.type = "button";
      sourceTab.className = "import-docx-preview-tab";
      sourceTab.dataset.testid = "import-docx-preview-source";
      sourceTab.setAttribute("role", "tab");
      sourceTab.setAttribute(
        "aria-selected",
        String(previewMode === "source"),
      );
      sourceTab.classList.toggle("active", previewMode === "source");
      sourceTab.appendChild(createIcon("code", 14));
      sourceTab.appendChild(
        document.createTextNode(t(lang, "importDocxSourceView")),
      );
      sourceTab.onclick = () => {
        if (this.modal.kind !== "import-docx") return;
        this.modal = { ...this.modal, previewMode: "source" };
        this.render();
      };

      previewTabs.append(renderedTab, sourceTab);

      const previewPanel = document.createElement("div");
      previewPanel.className = "import-docx-preview-panel";
      previewPanel.setAttribute("role", "tabpanel");
      if (previewMode === "rendered") {
        previewPanel.classList.add("markdown-preview", "import-docx-rendered");
        const inner = document.createElement("div");
        inner.className = "markdown-preview-inner";
        inner.innerHTML = renderMarkdownPreview(state.markdown ?? "");
        previewPanel.appendChild(inner);
      } else {
        const sourceView = document.createElement("pre");
        sourceView.className = "import-docx-preview";
        sourceView.textContent = state.markdown ?? "";
        previewPanel.appendChild(sourceView);
      }

      const destination = document.createElement("p");
      destination.className = "settings-hint";
      destination.textContent = `${t(lang, "importDocxDestination", {
        path: "manuscript/imported.md",
      })} ${t(lang, "importDocxDestinationHint")}`;

      dialog.append(
        source,
        summary,
        keep,
        warnings,
        previewTabs,
        previewPanel,
        destination,
      );

      if (state.error) {
        const error = document.createElement("div");
        error.className = "error-banner";
        error.textContent = state.error;
        dialog.appendChild(error);
      }
    }

    const footer = document.createElement("div");
    footer.className = "modal-footer";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "toolbar-btn";
    cancel.textContent = t(lang, "cancel");
    cancel.onclick = () => this.closeModal();
    footer.appendChild(cancel);

    if (state.status === "ready") {
      const submit = document.createElement("button");
      submit.type = "button";
      submit.className = "toolbar-btn primary";
      submit.dataset.testid = "import-docx-submit";
      submit.textContent = t(lang, "importDocxImport");
      submit.onclick = () => void this.submitDocxImport();
      footer.appendChild(submit);
    }

    dialog.appendChild(footer);
  }

  private renderImportFdxModal(
    lang: AppSettings["language"],
    dialog: HTMLElement,
  ): void {
    if (this.modal.kind !== "import-fdx") return;
    const state = this.modal;
    dialog.classList.add("import-docx-dialog", "import-fdx-dialog");

    const header = document.createElement("div");
    header.className = "import-docx-header";
    const title = document.createElement("h3");
    title.textContent = t(lang, "importFdxTitle");
    header.appendChild(title);
    dialog.appendChild(header);

    if (state.status === "loading") {
      const loading = document.createElement("p");
      loading.className = "settings-hint";
      loading.textContent = t(lang, "importFdxLoading", {
        name: state.sourceName,
      });
      dialog.appendChild(loading);
    } else if (state.status === "error") {
      const error = document.createElement("div");
      error.className = "error-banner";
      error.textContent = state.error || t(lang, "importFdxError");
      dialog.appendChild(error);
    } else {
      const source = document.createElement("p");
      source.className = "settings-hint";
      source.textContent = t(lang, "importFdxSource", {
        name: state.sourceName,
      });

      const keep = document.createElement("p");
      keep.className = "import-docx-keep";
      keep.textContent = t(lang, "importFdxKeep");

      const lose = document.createElement("p");
      lose.className = "settings-hint";
      lose.textContent = t(lang, "importFdxLose");

      const previewMode = state.previewMode ?? "rendered";
      const previewTabs = document.createElement("div");
      previewTabs.className = "import-docx-preview-tabs";
      previewTabs.setAttribute("role", "tablist");

      const renderedTab = document.createElement("button");
      renderedTab.type = "button";
      renderedTab.className = "import-docx-preview-tab";
      renderedTab.dataset.testid = "import-fdx-preview-rendered";
      renderedTab.setAttribute("role", "tab");
      renderedTab.setAttribute(
        "aria-selected",
        String(previewMode === "rendered"),
      );
      renderedTab.classList.toggle("active", previewMode === "rendered");
      renderedTab.appendChild(createIcon("eye", 14));
      renderedTab.appendChild(
        document.createTextNode(t(lang, "importFdxPreview")),
      );
      renderedTab.onclick = () => {
        if (this.modal.kind !== "import-fdx") return;
        this.modal = { ...this.modal, previewMode: "rendered" };
        this.render();
      };

      const sourceTab = document.createElement("button");
      sourceTab.type = "button";
      sourceTab.className = "import-docx-preview-tab";
      sourceTab.dataset.testid = "import-fdx-preview-source";
      sourceTab.setAttribute("role", "tab");
      sourceTab.setAttribute(
        "aria-selected",
        String(previewMode === "source"),
      );
      sourceTab.classList.toggle("active", previewMode === "source");
      sourceTab.appendChild(createIcon("code", 14));
      sourceTab.appendChild(
        document.createTextNode(t(lang, "importFdxSourceView")),
      );
      sourceTab.onclick = () => {
        if (this.modal.kind !== "import-fdx") return;
        this.modal = { ...this.modal, previewMode: "source" };
        this.render();
      };

      previewTabs.append(renderedTab, sourceTab);

      const previewPanel = document.createElement("div");
      previewPanel.className = "import-docx-preview-panel";
      previewPanel.setAttribute("role", "tabpanel");
      if (previewMode === "rendered") {
        previewPanel.classList.add("import-fdx-rendered");
        previewPanel.appendChild(
          renderFountainPreview(state.fountain ?? ""),
        );
      } else {
        const sourceView = document.createElement("pre");
        sourceView.className = "import-docx-preview";
        sourceView.textContent = state.fountain ?? "";
        previewPanel.appendChild(sourceView);
      }

      const destination = document.createElement("p");
      destination.className = "settings-hint";
      destination.textContent = `${t(lang, "importFdxDestination", {
        path: "script/imported.fountain",
      })} ${t(lang, "importFdxDestinationHint")}`;

      dialog.append(source, keep, lose, previewTabs, previewPanel, destination);

      if (state.error) {
        const error = document.createElement("div");
        error.className = "error-banner";
        error.textContent = state.error;
        dialog.appendChild(error);
      }
    }

    const footer = document.createElement("div");
    footer.className = "modal-footer";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "toolbar-btn";
    cancel.textContent = t(lang, "cancel");
    cancel.onclick = () => this.closeModal();
    footer.appendChild(cancel);

    if (state.status === "ready") {
      const submit = document.createElement("button");
      submit.type = "button";
      submit.className = "toolbar-btn primary";
      submit.dataset.testid = "import-fdx-submit";
      submit.textContent = t(lang, "importFdxImport");
      submit.onclick = () => void this.submitFdxImport();
      footer.appendChild(submit);
    }

    dialog.appendChild(footer);
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
        searchAiModels: buildSearchAiModelOptions(
          this.byokStatus,
          this.chatModels,
          this.settings.recentModels,
        ),
        searchAiDefaultModel: this.defaultSearchAiModelLabel(),
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
        onOpenConnectWizard: () =>
          this.openConnectModelWizard(undefined, true),
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
    } else if (this.modal.kind === "connect-model") {
      const modalState = this.modal;
      const fromSettings = modalState.fromSettings ?? false;
      dialog.classList.add("connect-model-dialog");
      const title = document.createElement("h3");
      title.textContent = t(lang, "connectModelTitle");
      const panel = new ConnectModelPanel({
        language: lang,
        providers: this.settings.byokProviders,
        initialKind: modalState.initialKind,
        onClose: () => this.closeConnectModelWizard(fromSettings),
        onTest: (draft) => this.testByokConnection(draft),
        onSave: (draft) => this.saveConnectedModel(draft, fromSettings),
        onOpenKeyPage: (url) => {
          void backend.openExternalUrl(url).catch((err) => {
            this.byokError = err instanceof Error ? err.message : String(err);
          });
        },
      });
      const footer = document.createElement("div");
      footer.className = "modal-footer";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "toolbar-btn";
      cancel.textContent = t(lang, "cancel");
      cancel.onclick = () => this.closeConnectModelWizard(fromSettings);
      footer.appendChild(cancel);
      dialog.append(title, panel.element, footer);
    } else if (this.modal.kind === "manage-models") {
      this.renderManageModels(lang, dialog);
    } else if (this.modal.kind === "quick-open" || this.modal.kind === "global-search") {
      backdrop.classList.add("palette-backdrop");
      dialog.classList.add("search-palette-dialog");

      const files = this.folder
        ? flattenFileTree(filterTreeNodes(this.folder.tree, configFilesVisible(this.settings)))
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
                      configFilesVisible(this.settings),
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
    } else if (this.modal.kind === "import-docx") {
      this.renderImportDocxModal(lang, dialog);
    } else if (this.modal.kind === "import-fdx") {
      this.renderImportFdxModal(lang, dialog);
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
    } else if (this.modal.kind === "folder-pdf-error") {
      const copy = folderPdfErrorCopy(this.modal.error, lang);
      dialog.dataset.testid = "folder-pdf-error-dialog";
      const h3 = document.createElement("h3");
      h3.textContent = t(lang, "folderPdfErrorTitle");
      const message = document.createElement("p");
      message.className = "folder-pdf-error-message";
      message.textContent = copy.message;
      const hint = document.createElement("p");
      hint.className = "folder-pdf-error-hint";
      hint.textContent = copy.hint;
      dialog.append(h3, message, hint);

      if (copy.detail) {
        const detail = document.createElement("p");
        detail.className = "modal-hint";
        detail.textContent = copy.detail;
        dialog.appendChild(detail);
      }

      const footer = document.createElement("div");
      footer.className = "modal-footer";
      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "toolbar-btn primary";
      closeBtn.textContent = t(lang, "folderPdfErrorClose");
      closeBtn.onclick = () => {
        this.modal = { kind: "none" };
        this.render();
      };
      footer.appendChild(closeBtn);
      dialog.appendChild(footer);
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
    } else if (this.modal.kind === "confirm-project-replace") {
      const replacement = this.modal.replacement;
      const files = new Set(
        this.projectSearchResults.map((match) => match.path),
      ).size;
      const h3 = document.createElement("h3");
      h3.textContent = t(lang, "projectReplaceTitle");
      const p = document.createElement("p");
      p.textContent =
        files === 1
          ? t(lang, "projectReplacePromptOneFile", {
              query: this.projectSearchQuery.search,
              replacement,
            })
          : t(lang, "projectReplacePrompt", {
              query: this.projectSearchQuery.search,
              replacement,
              files: String(files),
            });
      const warning = document.createElement("p");
      warning.className = "modal-hint";
      warning.textContent = t(lang, "projectReplaceWarning");
      dialog.append(h3, p, warning);

      const footer = document.createElement("div");
      footer.className = "modal-footer";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "toolbar-btn";
      cancel.textContent = t(lang, "cancel");
      cancel.onclick = () => {
        this.modal = { kind: "none" };
        this.render();
      };
      const confirm = document.createElement("button");
      confirm.type = "button";
      confirm.className = "toolbar-btn danger";
      confirm.dataset.testid = "confirm-project-replace-btn";
      confirm.textContent = t(lang, "projectReplaceConfirm");
      confirm.onclick = () => {
        this.modal = { kind: "none" };
        this.render();
        void this.performProjectReplaceAll(replacement);
      };
      footer.append(cancel, confirm);
      dialog.appendChild(footer);
      setTimeout(() => cancel.focus(), 10);
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
