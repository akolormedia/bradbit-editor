export type Language = "es" | "en";
export type ThemeMode = "dark" | "light" | "system";

export interface AppSettings {
  language: Language;
  theme: ThemeMode;
  fontSize: number;
  wordWrap: boolean;
  lineNumbers: boolean;
  showConfigFiles: boolean;
  gitAuthorName: string;
  gitAuthorEmail: string;
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

export type TabViewMode = "edit" | "preview" | "diff";

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

export interface GitDiscardResult {
  deleted: boolean;
  status: GitStatus;
}

export interface GitCommit {
  id: string;
  author: string;
  email: string;
  date: string;
  subject: string;
}

export interface GitCommitFile {
  path: string;
  oldPath: string | null;
  status: string;
}

export interface GitBranch {
  name: string;
  id: string;
  current: boolean;
}

export interface GitRemote {
  name: string;
  url: string;
}

export interface GitHubUser {
  login: string;
}

export interface GitHubPermissions {
  admin: boolean;
  push: boolean;
  pull: boolean;
}

export interface GitHubRepository {
  fullName: string;
  name: string;
  defaultBranch: string;
  cloneUrl: string;
  htmlUrl: string;
  private: boolean;
  permissions: GitHubPermissions | null;
}

export interface GitHubBranch {
  name: string;
  sha: string;
  protected: boolean;
}

export interface GitHubPullRequest {
  number: number;
  state: "open" | "closed";
  merged: boolean;
  title: string;
  htmlUrl: string;
  headRef: string;
  baseRef: string;
}

export interface OpenCodeSession {
  id: string;
  title: string;
  updated?: number | null;
  directory?: string | null;
}

export interface OpenCodeTokens {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface OpenCodeToolCall {
  id: string;
  name: string;
  status: "streaming" | "running" | "completed" | "error";
  input: unknown;
  output: string;
  error: string;
  executed: boolean;
  files: string[];
}

export type OpenCodeMessagePart =
  | { type: "text"; text: string }
  | { type: "tool"; tool: OpenCodeToolCall };

export interface OpenCodeChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  parts: OpenCodeMessagePart[];
  tokens?: OpenCodeTokens | null;
  model?: string | null;
}

export interface OpenCodePermission {
  id: string;
  sessionId: string;
  action: string;
  resources: string[];
  save: string[];
  message: string;
  toolId: string | null;
  status: "pending" | "allowed" | "rejected";
}

export interface WorkspaceLayout {
  sessionWidth: number;
  chatVisible: boolean;
  editorVisible: boolean;
}

export interface ProjectWorkspaceState {
  openSessionIds: string[];
  activeSessionId: string | null;
  layout: WorkspaceLayout;
}

export interface OpenCodeStatus {
  binaryFound: boolean;
  running: boolean;
  sessionId: string | null;
  root: string | null;
}

export interface OpenCodeEvent {
  type: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}
