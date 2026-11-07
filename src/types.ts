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
  hiddenModels: string[];
  recentModels: string[];
  terminalCommand: string;
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
  /** True for a new, unsaved document that only gets a real path on save. */
  untitled?: boolean;
  /** Relative directory suggested by the Save dialog for an untitled tab. */
  defaultDir?: string;
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

export interface KitAgent {
  id: string;
  name: string;
  description: string;
  path: string;
}

export interface KitCommand {
  id: string;
  name: string;
  description: string;
  agent: string | null;
  path: string;
}

export interface KitSkill {
  id: string;
  name: string;
  description: string;
  path: string;
}

export interface KitCatalog {
  agents: KitAgent[];
  commands: KitCommand[];
  skills: KitSkill[];
}

export interface OpenCodeSession {
  id: string;
  title: string;
  updated?: number | null;
  directory?: string | null;
  agent?: string | null;
  model?: string | null;
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
  agent?: string | null;
}

export interface PtyStartResult {
  id: string;
  command: string;
}

export interface PtyStatus {
  running: boolean;
  id: string | null;
  root: string | null;
  command: string | null;
}

export interface PtyOutputEvent {
  id: string;
  data: string;
}

export interface PtyExitEvent {
  id: string;
  code: number | null;
}

export interface OpenCodeModel {
  id: string;
  name: string;
  providerId: string;
  variants: string[];
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

export interface OpenCodeFormOption {
  value: string;
  label: string;
  description?: string;
}

export interface OpenCodeFormField {
  key: string;
  type: "string" | "number" | "integer" | "boolean" | "multiselect" | "external";
  title?: string;
  description?: string;
  required?: boolean;
  hidden?: boolean;
  options?: OpenCodeFormOption[];
  custom?: boolean;
  placeholder?: string;
  default?: unknown;
}

export interface OpenCodeForm {
  id: string;
  sessionId: string;
  title: string;
  kind: string;
  toolId: string | null;
  messageId: string | null;
  fields: OpenCodeFormField[];
  status: "pending" | "answered" | "cancelled";
  answer?: Record<string, unknown> | null;
  message?: string | null;
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
