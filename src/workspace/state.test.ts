import { describe, expect, it } from "vitest";
import {
  buildMenuUiState,
  closeTabInState,
  countWordsAndChars,
  DEFAULT_SETTINGS,
  filterTreeNodes,
  isTabDirty,
  markTabSaved,
  openFileInTabs,
  renamePathInTabs,
  TabListState,
  updateTabContent,
} from "./state";
import { FileTreeNode } from "../types";

describe("workspace tab state (Story 1.1)", () => {
  it("opens single-click files as preview and replaces clean preview tab on next single-click", () => {
    let state: TabListState = { tabs: [], activeTabPath: null };

    state = openFileInTabs(
      state,
      { path: "biblia/premisa.md", name: "premisa.md", content: "# Premisa" },
      false,
    );
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].preview).toBe(true);
    expect(state.activeTabPath).toBe("biblia/premisa.md");

    state = openFileInTabs(
      state,
      { path: "biblia/cronologia.md", name: "cronologia.md", content: "# Cronología" },
      false,
    );
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].path).toBe("biblia/cronologia.md");
    expect(state.tabs[0].preview).toBe(true);
  });

  it("pins a preview tab on double-click or first edit, and marks it dirty until saved", () => {
    let state: TabListState = { tabs: [], activeTabPath: null };
    state = openFileInTabs(
      state,
      { path: "guion/acto-1.fountain", name: "acto-1.fountain", content: "INT. CASA - DÍA" },
      false,
    );
    expect(state.tabs[0].preview).toBe(true);
    expect(isTabDirty(state.tabs[0])).toBe(false);

    // Editing pins the preview tab and marks it dirty
    state = updateTabContent(state, "guion/acto-1.fountain", "INT. CASA - NOCHE");
    expect(state.tabs[0].preview).toBe(false);
    expect(isTabDirty(state.tabs[0])).toBe(true);

    // Another single click no longer replaces the pinned dirty tab
    state = openFileInTabs(
      state,
      { path: "biblia/premisa.md", name: "premisa.md", content: "# Premisa" },
      false,
    );
    expect(state.tabs).toHaveLength(2);

    // Saving clears dirty state
    state = markTabSaved(state, "guion/acto-1.fountain");
    expect(isTabDirty(state.tabs[0])).toBe(false);
  });

  it("activates adjacent tab when closing active tab and updates paths on rename", () => {
    let state: TabListState = { tabs: [], activeTabPath: null };
    state = openFileInTabs(state, { path: "a.md", name: "a.md", content: "A" }, true);
    state = openFileInTabs(state, { path: "b.md", name: "b.md", content: "B" }, true);
    state = openFileInTabs(state, { path: "c.md", name: "c.md", content: "C" }, true);

    expect(state.activeTabPath).toBe("c.md");
    state = closeTabInState(state, "c.md");
    expect(state.activeTabPath).toBe("b.md");

    state = renamePathInTabs(state, "b.md", "notas/b-nuevo.md");
    expect(state.activeTabPath).toBe("notas/b-nuevo.md");
    expect(state.tabs[1].name).toBe("b-nuevo.md");
  });

  it("hides .git and .DS_Store always, and toggles .opencode / AGENTS.md visibility", () => {
    const sampleTree: FileTreeNode[] = [
      { name: ".git", path: ".git", isDir: true, isConfig: true, children: [] },
      { name: ".DS_Store", path: ".DS_Store", isDir: false, isConfig: true },
      { name: ".opencode", path: ".opencode", isDir: true, isConfig: true, children: [] },
      { name: "AGENTS.md", path: "AGENTS.md", isDir: false, isConfig: true },
      { name: "biblia", path: "biblia", isDir: true, isConfig: false, children: [] },
    ];

    const hiddenConfig = filterTreeNodes(sampleTree, false);
    expect(hiddenConfig.map((n) => n.name)).toEqual(["biblia"]);

    const visibleConfig = filterTreeNodes(sampleTree, true);
    expect(visibleConfig.map((n) => n.name)).toEqual([".opencode", "AGENTS.md", "biblia"]);
  });

  it("counts words and characters accurately with Unicode", () => {
    expect(countWordsAndChars("")).toEqual({ words: 0, chars: 0 });
    expect(countWordsAndChars("Hola mundo guión")).toEqual({ words: 3, chars: 16 });
  });

  it("builds native menu UI state from workspace and settings (T-1.1.1)", () => {
    const menuState = buildMenuUiState({
      settings: { ...DEFAULT_SETTINGS, language: "en", lineNumbers: true },
      hasFolder: true,
      hasActiveTab: false,
      sidebarVisible: false,
    });
    expect(menuState).toEqual({
      language: "en",
      hasFolder: true,
      hasActiveTab: false,
      sidebarVisible: false,
      wordWrap: true,
      lineNumbers: true,
    });
  });
});
