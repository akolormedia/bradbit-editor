import { OpenTab } from "../types";
import { TabListState } from "./state";

export interface ReconcileResult {
  state: TabListState;
  closed: string[];
  reloaded: string[];
  conflicts: string[];
  deletedConflicts: string[];
}

export function isTabAffected(tabPath: string, changedPaths: string[]): boolean {
  return changedPaths.some((changed) => {
    const normalized = changed.replace(/\/+$/, "");
    return (
      normalized.length > 0 &&
      (tabPath === normalized || tabPath.startsWith(`${normalized}/`))
    );
  });
}

/**
 * Reconciles open tabs after external file-system changes. Clean tabs reload
 * silently; dirty tabs keep the author's unsaved text and are marked as
 * conflicting so the UI can warn instead of overwriting their work.
 */
export function reconcileTabsWithDisk(
  state: TabListState,
  changedPaths: string[],
  diskContents: Map<string, string | null>,
): ReconcileResult {
  const closed: string[] = [];
  const reloaded: string[] = [];
  const conflicts: string[] = [];
  const deletedConflicts: string[] = [];
  const tabs: OpenTab[] = [];

  for (const tab of state.tabs) {
    if (!isTabAffected(tab.path, changedPaths)) {
      tabs.push(tab);
      continue;
    }
    if (!diskContents.has(tab.path)) {
      tabs.push(tab);
      continue;
    }

    const disk = diskContents.get(tab.path);
    const dirty = tab.content !== tab.savedContent;

    if (disk === null || disk === undefined) {
      if (dirty) {
        tabs.push({ ...tab, externalChange: true });
        deletedConflicts.push(tab.path);
      } else {
        closed.push(tab.path);
      }
      continue;
    }

    if (disk === tab.content) {
      tabs.push({ ...tab, externalChange: false });
      continue;
    }

    if (dirty) {
      tabs.push({ ...tab, externalChange: true });
      conflicts.push(tab.path);
    } else {
      tabs.push({
        ...tab,
        content: disk,
        savedContent: disk,
        externalChange: false,
      });
      reloaded.push(tab.path);
    }
  }

  let activeTabPath = state.activeTabPath;
  if (activeTabPath && !tabs.some((tab) => tab.path === activeTabPath)) {
    const originalIndex = state.tabs.findIndex((tab) => tab.path === activeTabPath);
    activeTabPath =
      tabs.length === 0
        ? null
        : tabs[Math.min(Math.max(originalIndex, 0), tabs.length - 1)].path;
  }

  return {
    state: { tabs, activeTabPath },
    closed,
    reloaded,
    conflicts,
    deletedConflicts,
  };
}
