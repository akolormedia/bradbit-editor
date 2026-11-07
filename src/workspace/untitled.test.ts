import { describe, expect, it } from "vitest";
import {
  ensureMarkdownExtension,
  markUntitledTabSaved,
  openUntitledInTabs,
  relativePathWithinRoot,
} from "./untitled";

describe("untitled tabs (T-2.4.6)", () => {
  it("opens a pinned untitled tab with an empty document and suggested folder", () => {
    const state = openUntitledInTabs(
      { tabs: [], activeTabPath: null },
      {
        path: "untitled://1.md",
        name: "Sin título 1",
        defaultDir: "guion",
      },
    );
    expect(state.activeTabPath).toBe("untitled://1.md");
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]).toMatchObject({
      path: "untitled://1.md",
      name: "Sin título 1",
      content: "",
      savedContent: "",
      preview: false,
      untitled: true,
      defaultDir: "guion",
    });
  });

  it("renames the tab and clears the untitled state when saved", () => {
    const opened = openUntitledInTabs(
      { tabs: [], activeTabPath: null },
      { path: "untitled://1.md", name: "Sin título 1" },
    );
    const state = markUntitledTabSaved(
      opened,
      "untitled://1.md",
      "notas/idea.md",
      "idea.md",
    );
    expect(state.activeTabPath).toBe("notas/idea.md");
    expect(state.tabs[0]).toMatchObject({
      path: "notas/idea.md",
      name: "idea.md",
      untitled: false,
      savedContent: "",
    });
    expect(state.tabs[0].defaultDir).toBeUndefined();
  });

  it("accepts only paths inside the project root", () => {
    expect(relativePathWithinRoot("/proyecto", "/proyecto/notas.md")).toBe(
      "notas.md",
    );
    expect(
      relativePathWithinRoot("/proyecto", "/proyecto/guion/escena.md"),
    ).toBe("guion/escena.md");
    expect(relativePathWithinRoot("/proyecto", "/proyecto-otro/notas.md")).toBeNull();
    expect(relativePathWithinRoot("/proyecto", "/proyecto")).toBeNull();
    expect(
      relativePathWithinRoot("/proyecto", "/proyecto/../fuera.md"),
    ).toBeNull();
    expect(relativePathWithinRoot("/", "/notas.md")).toBe("notas.md");
  });

  it("keeps existing extensions and adds Markdown by default", () => {
    expect(ensureMarkdownExtension("/proyecto/nuevo")).toBe(
      "/proyecto/nuevo.md",
    );
    expect(ensureMarkdownExtension("/proyecto/nuevo.md")).toBe(
      "/proyecto/nuevo.md",
    );
    expect(ensureMarkdownExtension("/proyecto/guion.fountain")).toBe(
      "/proyecto/guion.fountain",
    );
  });
});
