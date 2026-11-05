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
