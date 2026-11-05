import { describe, expect, it } from "vitest";
import { OpenTab } from "../types";
import { isTabAffected, reconcileTabsWithDisk } from "./reconcile";
import { TabListState } from "./state";

function tab(path: string, content: string, savedContent = content): OpenTab {
  return {
    path,
    name: path.split("/").pop() ?? path,
    content,
    savedContent,
    preview: false,
    cursorLine: 1,
    cursorCol: 1,
    viewMode: "edit",
    externalChange: false,
  };
}

describe("external file reconciliation (T-1.4.1)", () => {
  it("detects tabs affected by a file or a parent directory", () => {
    expect(isTabAffected("biblia/premisa.md", ["biblia/premisa.md"])).toBe(true);
    expect(isTabAffected("biblia/premisa.md", ["biblia"])).toBe(true);
    expect(isTabAffected("biblia/premisa.md", ["guion/acto.fountain"])).toBe(false);
  });

  it("reloads clean tabs whose file changed on disk", () => {
    const state: TabListState = {
      tabs: [tab("biblia/premisa.md", "# Vieja")],
      activeTabPath: "biblia/premisa.md",
    };
    const result = reconcileTabsWithDisk(
      state,
      ["biblia/premisa.md"],
      new Map([["biblia/premisa.md", "# Nueva"]]),
    );
    expect(result.reloaded).toEqual(["biblia/premisa.md"]);
    expect(result.state.tabs[0].content).toBe("# Nueva");
    expect(result.state.tabs[0].savedContent).toBe("# Nueva");
  });

  it("keeps unsaved edits and marks a conflict when the file changed", () => {
    const state: TabListState = {
      tabs: [tab("biblia/premisa.md", "# Borrador", "# Guardada")],
      activeTabPath: "biblia/premisa.md",
    };
    const result = reconcileTabsWithDisk(
      state,
      ["biblia/premisa.md"],
      new Map([["biblia/premisa.md", "# Externa"]]),
    );
    expect(result.conflicts).toEqual(["biblia/premisa.md"]);
    expect(result.state.tabs[0].content).toBe("# Borrador");
    expect(result.state.tabs[0].externalChange).toBe(true);
  });

  it("closes a clean tab deleted on disk and activates a neighbor", () => {
    const state: TabListState = {
      tabs: [tab("a.md", "A"), tab("b.md", "B"), tab("c.md", "C")],
      activeTabPath: "b.md",
    };
    const result = reconcileTabsWithDisk(
      state,
      ["b.md"],
      new Map([["b.md", null]]),
    );
    expect(result.closed).toEqual(["b.md"]);
    expect(result.state.tabs.map((item) => item.path)).toEqual(["a.md", "c.md"]);
    expect(result.state.activeTabPath).toBe("c.md");
  });

  it("keeps a dirty tab deleted on disk so the author can save it", () => {
    const state: TabListState = {
      tabs: [tab("notas/idea.md", "Borrador", "Versión guardada")],
      activeTabPath: "notas/idea.md",
    };
    const result = reconcileTabsWithDisk(
      state,
      ["notas/idea.md"],
      new Map([["notas/idea.md", null]]),
    );
    expect(result.deletedConflicts).toEqual(["notas/idea.md"]);
    expect(result.state.tabs).toHaveLength(1);
    expect(result.state.tabs[0].externalChange).toBe(true);
    expect(result.state.tabs[0].content).toBe("Borrador");
  });

  it("leaves unrelated tabs untouched", () => {
    const state: TabListState = {
      tabs: [tab("biblia/premisa.md", "# Premisa")],
      activeTabPath: "biblia/premisa.md",
    };
    const result = reconcileTabsWithDisk(
      state,
      ["guion/acto.fountain"],
      new Map([["guion/acto.fountain", "INT. X"]]),
    );
    expect(result.state.tabs[0]).toEqual(state.tabs[0]);
  });
});
