import { AppSettings, FileTreeNode, MenuUiState, OpenTab } from "../types";

export const DEFAULT_SETTINGS: AppSettings = {
  language: "es",
  theme: "dark",
  fontSize: 15,
  wordWrap: true,
  lineNumbers: false,
  showConfigFiles: false,
  gitAuthorName: "",
  gitAuthorEmail: "",
};

const CONFIG_NAMES = new Set([
  ".opencode",
  ".bradbit",
  ".narra",
  ".gitignore",
  "AGENTS.md",
  "CLAUDE.md",
]);

const ALWAYS_HIDDEN = new Set([".git", ".DS_Store", "node_modules", "target"]);

export function isAlwaysHiddenEntry(name: string): boolean {
  return ALWAYS_HIDDEN.has(name);
}

export function isConfigEntry(name: string): boolean {
  return CONFIG_NAMES.has(name) || (name.startsWith(".") && !ALWAYS_HIDDEN.has(name));
}

export function filterTreeNodes(nodes: FileTreeNode[], showConfigFiles: boolean): FileTreeNode[] {
  const result: FileTreeNode[] = [];
  for (const node of nodes) {
    if (isAlwaysHiddenEntry(node.name)) {
      continue;
    }
    if (!showConfigFiles && (node.isConfig || isConfigEntry(node.name))) {
      continue;
    }
    if (node.isDir && node.children) {
      result.push({
        ...node,
        children: filterTreeNodes(node.children, showConfigFiles),
      });
    } else {
      result.push(node);
    }
  }
  return result;
}

export function isTabDirty(tab: OpenTab): boolean {
  return tab.content !== tab.savedContent;
}

export interface TabListState {
  tabs: OpenTab[];
  activeTabPath: string | null;
}

/**
 * Opens a file in the tab bar:
 * - If already open, activates it (and pins it if `pin` is true).
 * - If `pin` is false (single click) and there is an existing clean preview tab, replaces it.
 * - Otherwise appends a new tab.
 */
export function openFileInTabs(
  state: TabListState,
  file: { path: string; name: string; content: string },
  pin: boolean,
): TabListState {
  const existingIndex = state.tabs.findIndex((t) => t.path === file.path);
  if (existingIndex !== -1) {
    const updated = state.tabs.map((tab, idx) =>
      idx === existingIndex && pin ? { ...tab, preview: false } : tab,
    );
    return {
      tabs: updated,
      activeTabPath: file.path,
    };
  }

  const newTab: OpenTab = {
    path: file.path,
    name: file.name,
    content: file.content,
    savedContent: file.content,
    preview: !pin,
    cursorLine: 1,
    cursorCol: 1,
    viewMode: "edit",
    externalChange: false,
  };

  if (!pin) {
    const previewIdx = state.tabs.findIndex((t) => t.preview && !isTabDirty(t));
    if (previewIdx !== -1) {
      const nextTabs = [...state.tabs];
      nextTabs[previewIdx] = newTab;
      return {
        tabs: nextTabs,
        activeTabPath: newTab.path,
      };
    }
  }

  return {
    tabs: [...state.tabs, newTab],
    activeTabPath: newTab.path,
  };
}

/**
 * Updates the content of a tab and automatically pins it if it was a preview tab.
 */
export function updateTabContent(
  state: TabListState,
  path: string,
  newContent: string,
): TabListState {
  return {
    ...state,
    tabs: state.tabs.map((tab) => {
      if (tab.path !== path) return tab;
      const changed = newContent !== tab.content;
      return {
        ...tab,
        content: newContent,
        preview: changed ? false : tab.preview,
      };
    }),
  };
}

export function markTabSaved(state: TabListState, path: string): TabListState {
  return {
    ...state,
    tabs: state.tabs.map((tab) =>
      tab.path === path
        ? { ...tab, savedContent: tab.content, preview: false, externalChange: false }
        : tab,
    ),
  };
}

export function closeTabInState(state: TabListState, path: string): TabListState {
  const idx = state.tabs.findIndex((t) => t.path === path);
  if (idx === -1) return state;
  const nextTabs = state.tabs.filter((t) => t.path !== path);
  let nextActive = state.activeTabPath;
  if (state.activeTabPath === path) {
    if (nextTabs.length === 0) {
      nextActive = null;
    } else if (idx < nextTabs.length) {
      nextActive = nextTabs[idx].path;
    } else {
      nextActive = nextTabs[nextTabs.length - 1].path;
    }
  }
  return {
    tabs: nextTabs,
    activeTabPath: nextActive,
  };
}

export function renamePathInTabs(
  state: TabListState,
  oldPath: string,
  newPath: string,
): TabListState {
  const getBaseName = (p: string) => p.split("/").pop() || p;
  const matchesPath = (p: string) => p === oldPath || p.startsWith(`${oldPath}/`);
  const replacePrefix = (p: string) =>
    p === oldPath ? newPath : `${newPath}${p.slice(oldPath.length)}`;

  const nextTabs = state.tabs.map((tab) => {
    if (!matchesPath(tab.path)) return tab;
    const updatedPath = replacePrefix(tab.path);
    return {
      ...tab,
      path: updatedPath,
      name: getBaseName(updatedPath),
    };
  });

  const nextActive =
    state.activeTabPath && matchesPath(state.activeTabPath)
      ? replacePrefix(state.activeTabPath)
      : state.activeTabPath;

  return {
    tabs: nextTabs,
    activeTabPath: nextActive,
  };
}

export function countWordsAndChars(text: string): { words: number; chars: number } {
  const trimmed = text.trim();
  const words = trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
  return {
    words,
    chars: Array.from(text).length,
  };
}

export function isMarkdownPath(path: string): boolean {
  return /\.(md|mdx)$/i.test(path);
}

export function isFountainPath(path: string): boolean {
  return /\.(fountain|spmd)$/i.test(path);
}

export function toggleTabViewMode(state: TabListState, path: string): TabListState {
  return {
    ...state,
    tabs: state.tabs.map((tab) => {
      if (tab.path !== path || !isMarkdownPath(tab.path)) return tab;
      return {
        ...tab,
        viewMode: tab.viewMode === "preview" ? "edit" : "preview",
      };
    }),
  };
}

export function setTabViewMode(
  state: TabListState,
  path: string,
  viewMode: OpenTab["viewMode"],
): TabListState {
  return {
    ...state,
    tabs: state.tabs.map((tab) =>
      tab.path === path ? { ...tab, viewMode } : tab,
    ),
  };
}

/**
 * Resolves a relative link from a Markdown preview against the folder of the
 * document that contains it. Returns null for absolute URLs, anchors or paths
 * that escape the project root.
 */
export function resolveProjectLink(basePath: string, href: string): string | null {
  const clean = href.split("#")[0].split("?")[0].trim();
  if (!clean || clean.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(clean)) {
    return null;
  }

  const baseParts = basePath.split("/").slice(0, -1);
  const stack: string[] = [];
  for (const part of [...baseParts, ...clean.split("/")]) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (stack.length === 0) return null;
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  return stack.length > 0 ? stack.join("/") : null;
}

export function buildMenuUiState(params: {
  settings: AppSettings;
  hasFolder: boolean;
  hasActiveTab: boolean;
  isMarkdown: boolean;
  isFountain: boolean;
  previewMode: boolean;
  sidebarVisible: boolean;
}): MenuUiState {
  return {
    language: params.settings.language,
    hasFolder: params.hasFolder,
    hasActiveTab: params.hasActiveTab,
    isMarkdown: params.isMarkdown,
    isFountain: params.isFountain,
    previewMode: params.previewMode,
    sidebarVisible: params.sidebarVisible,
    wordWrap: params.settings.wordWrap,
    lineNumbers: params.settings.lineNumbers,
  };
}


