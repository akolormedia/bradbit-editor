export type Language = "es" | "en";
export type ThemeMode = "dark" | "light" | "system";

export interface AppSettings {
  language: Language;
  theme: ThemeMode;
  fontSize: number;
  wordWrap: boolean;
  lineNumbers: boolean;
  showConfigFiles: boolean;
}

export interface FileTreeNode {
  name: string;
  /** Project-relative path using forward slashes */
  path: string;
  isDir: boolean;
  isConfig: boolean;
  children?: FileTreeNode[];
}

export interface OpenedFolder {
  rootPath: string;
  name: string;
  tree: FileTreeNode[];
}

export interface RecentProject {
  path: string;
  name: string;
  lastOpened: string;
}

export type TabViewMode = "edit" | "preview";

export interface OpenTab {
  path: string;
  name: string;
  content: string;
  savedContent: string;
  preview: boolean;
  cursorLine: number;
  cursorCol: number;
  viewMode: TabViewMode;
  /** Set when the file changed on disk while this tab had unsaved edits. */
  externalChange?: boolean;
}

export interface MenuUiState {
  language: Language;
  hasFolder: boolean;
  hasActiveTab: boolean;
  isMarkdown: boolean;
  isFountain: boolean;
  previewMode: boolean;
  sidebarVisible: boolean;
  wordWrap: boolean;
  lineNumbers: boolean;
}

export interface MenuCommand {
  id: string;
  path?: string;
}

export interface SearchMatch {
  path: string;
  line: number;
  column: number;
  snippet: string;
}

export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  source: "bundled" | "blank" | "user" | string;
  path?: string;
}

export interface CreatedProject {
  path: string;
  name: string;
  gitInitialized: boolean;
}

export interface FsChangeEvent {
  paths: string[];
}

export interface GitStatusEntry {
  path: string;
  index: string;
  worktree: string;
}

export interface GitStatus {
  isRepository: boolean;
  branch: string | null;
  ahead: number;
  behind: number;
  entries: GitStatusEntry[];
}
