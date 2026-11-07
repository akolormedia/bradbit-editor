import { OpenTab } from "../types";
import { TabListState } from "./state";

export interface UntitledFileInput {
  path: string;
  name: string;
  defaultDir?: string;
}

/** Adds a new, unsaved document as a pinned tab and activates it. */
export function openUntitledInTabs(
  state: TabListState,
  file: UntitledFileInput,
): TabListState {
  const tab: OpenTab = {
    path: file.path,
    name: file.name,
    content: "",
    savedContent: "",
    preview: false,
    cursorLine: 1,
    cursorCol: 1,
    viewMode: "edit",
    externalChange: false,
    untitled: true,
    defaultDir: file.defaultDir,
  };
  return {
    tabs: [...state.tabs, tab],
    activeTabPath: tab.path,
  };
}

export function isUntitledTab(tab: OpenTab | null | undefined): boolean {
  return Boolean(tab?.untitled);
}

/** Gives an untitled tab its real project path after the Save dialog. */
export function markUntitledTabSaved(
  state: TabListState,
  oldPath: string,
  newPath: string,
  newName: string,
): TabListState {
  const tabs = state.tabs.map((tab) =>
    tab.path === oldPath
      ? {
          ...tab,
          path: newPath,
          name: newName,
          savedContent: tab.content,
          preview: false,
          externalChange: false,
          untitled: false,
          defaultDir: undefined,
        }
      : tab,
  );
  return {
    tabs,
    activeTabPath:
      state.activeTabPath === oldPath ? newPath : state.activeTabPath,
  };
}

/**
 * Returns the project-relative path for a Save dialog selection, or null when
 * the selection is outside the project root.
 */
export function relativePathWithinRoot(
  rootPath: string,
  targetPath: string,
): string | null {
  const root =
    rootPath.replace(/\\/g, "/").replace(/\/+$/, "") || "/";
  const target = targetPath.replace(/\\/g, "/");
  const prefix = root === "/" ? "/" : `${root}/`;
  if (!target.startsWith(prefix) || target === root) return null;
  const relative = target.slice(prefix.length);
  if (!relative) return null;
  const segments = relative.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    return null;
  }
  return relative;
}

/** Adds the default Markdown extension when the Save dialog path has none. */
export function ensureMarkdownExtension(path: string): string {
  const base = path.split("/").pop() ?? "";
  if (!base || /\.[^./]+$/.test(base)) return path;
  return `${path}.md`;
}
