import { describe, expect, it } from "vitest";
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
      isMarkdown: false,
      isFountain: false,
      previewMode: false,
      sidebarVisible: false,
    });
    expect(menuState).toEqual({
      language: "en",
      hasFolder: true,
      hasActiveTab: false,
      isMarkdown: false,
      isFountain: false,
      previewMode: false,
      sidebarVisible: false,
      wordWrap: true,
      lineNumbers: true,
    });
  });

  it("toggles preview mode per Markdown tab and ignores non-Markdown files (T-1.2.1)", () => {
    let state: TabListState = { tabs: [], activeTabPath: null };
    state = openFileInTabs(
      state,
      { path: "biblia/premisa.md", name: "premisa.md", content: "# Premisa" },
      true,
    );
    state = openFileInTabs(
      state,
      { path: "guion/acto-1.fountain", name: "acto-1.fountain", content: "INT. CASA" },
      true,
    );

    expect(state.tabs[0].viewMode).toBe("edit");
    state = toggleTabViewMode(state, "biblia/premisa.md");
    expect(state.tabs[0].viewMode).toBe("preview");
    expect(state.tabs[1].viewMode).toBe("edit");

    // Non-Markdown tabs never switch to preview.
    state = toggleTabViewMode(state, "guion/acto-1.fountain");
    expect(state.tabs[1].viewMode).toBe("edit");

    // Each tab remembers its own view mode.
    state = { ...state, activeTabPath: "guion/acto-1.fountain" };
    state = { ...state, activeTabPath: "biblia/premisa.md" };
    expect(state.tabs[0].viewMode).toBe("preview");

    state = toggleTabViewMode(state, "biblia/premisa.md");
    expect(state.tabs[0].viewMode).toBe("edit");
  });

  it("detects Markdown and MDX paths case-insensitively (T-1.2.1)", () => {
    expect(isMarkdownPath("biblia/premisa.md")).toBe(true);
    expect(isMarkdownPath("notas/ideas.MDX")).toBe(true);
    expect(isMarkdownPath("guion/acto.fountain")).toBe(false);
    expect(isMarkdownPath("README.txt")).toBe(false);
  });

  it("detects Fountain paths case-insensitively (T-1.2.3)", () => {
    expect(isFountainPath("guion/acto-1.fountain")).toBe(true);
    expect(isFountainPath("guion/acto-1.FOUNTAIN")).toBe(true);
    expect(isFountainPath("guion/acto-1.spmd")).toBe(true);
    expect(isFountainPath("biblia/premisa.md")).toBe(false);
  });

  it("sets per-tab diff/edit view modes (T-1.4.3)", () => {
    let state: TabListState = { tabs: [], activeTabPath: null };
    state = openFileInTabs(
      state,
      { path: "biblia/premisa.md", name: "premisa.md", content: "# Premisa" },
      true,
    );
    state = setTabViewMode(state, "biblia/premisa.md", "diff");
    expect(state.tabs[0].viewMode).toBe("diff");
    state = setTabViewMode(state, "biblia/premisa.md", "edit");
    expect(state.tabs[0].viewMode).toBe("edit");
  });

  it("resolves relative preview links against the document folder (T-1.2.1)", () => {
    expect(resolveProjectLink("biblia/personajes/ana.md", "../premisa.md")).toBe(
      "biblia/premisa.md",
    );
    expect(resolveProjectLink("notas/ideas.md", "guion/acto-1.fountain")).toBe(
      "notas/guion/acto-1.fountain",
    );
    expect(resolveProjectLink("README.md", "biblia/premisa.md#intro")).toBe(
      "biblia/premisa.md",
    );
    expect(resolveProjectLink("README.md", "https://example.com")).toBeNull();
    expect(resolveProjectLink("README.md", "#seccion")).toBeNull();
    expect(resolveProjectLink("README.md", "/etc/passwd")).toBeNull();
    expect(resolveProjectLink("README.md", "../../fuera.md")).toBeNull();
  });
});
