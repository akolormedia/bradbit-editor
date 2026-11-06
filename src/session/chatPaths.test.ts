import { describe, expect, it } from "vitest";
import { projectRelativePath } from "./chatPaths";

describe("chat file paths", () => {
  it("accepts project-relative paths and normalizes separators", () => {
    expect(projectRelativePath("/proyecto", "notas.md")).toBe("notas.md");
    expect(projectRelativePath("/proyecto", "./capitulos/uno.md")).toBe(
      "capitulos/uno.md",
    );
    expect(projectRelativePath("/proyecto", "capitulos\\uno.md")).toBe(
      "capitulos/uno.md",
    );
  });

  it("strips the project root from absolute paths", () => {
    expect(projectRelativePath("/proyecto", "/proyecto/notas.md")).toBe(
      "notas.md",
    );
    expect(projectRelativePath("/proyecto/", "/proyecto/capitulos/uno.md")).toBe(
      "capitulos/uno.md",
    );
  });

  it("rejects paths outside the project and parent traversal", () => {
    expect(projectRelativePath("/proyecto", "/otro/notas.md")).toBeNull();
    expect(projectRelativePath("/proyecto", "../notas.md")).toBeNull();
    expect(projectRelativePath("/proyecto", "capitulos/../../notas.md")).toBeNull();
    expect(projectRelativePath(null, "/proyecto/notas.md")).toBeNull();
    expect(projectRelativePath("/proyecto", "   ")).toBeNull();
  });
});
