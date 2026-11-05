import { describe, expect, it } from "vitest";
import { FileTreeNode } from "../types";
import { filterQuickOpenFiles, flattenFileTree, QuickOpenFile } from "./quickOpen";

const tree: FileTreeNode[] = [
  {
    name: "biblia",
    path: "biblia",
    isDir: true,
    isConfig: false,
    children: [
      { name: "premisa.md", path: "biblia/premisa.md", isDir: false, isConfig: false },
      {
        name: "personajes",
        path: "biblia/personajes",
        isDir: true,
        isConfig: false,
        children: [
          {
            name: "ana.md",
            path: "biblia/personajes/ana.md",
            isDir: false,
            isConfig: false,
          },
        ],
      },
    ],
  },
  {
    name: "guion",
    path: "guion",
    isDir: true,
    isConfig: false,
    children: [
      { name: "acto-1.fountain", path: "guion/acto-1.fountain", isDir: false, isConfig: false },
      {
        name: "premisa-extra.md",
        path: "guion/premisa-extra.md",
        isDir: false,
        isConfig: false,
      },
    ],
  },
  { name: "README.md", path: "README.md", isDir: false, isConfig: false },
];

function files(): QuickOpenFile[] {
  return flattenFileTree(tree);
}

describe("quick open files (T-1.2.4)", () => {
  it("flattens nested folders and returns only files sorted by path", () => {
    expect(files().map((file) => file.path)).toEqual([
      "README.md",
      "biblia/personajes/ana.md",
      "biblia/premisa.md",
      "guion/acto-1.fountain",
      "guion/premisa-extra.md",
    ]);
  });

  it("returns the first files for an empty query", () => {
    expect(filterQuickOpenFiles(files(), "", 2).map((file) => file.path)).toEqual([
      "README.md",
      "biblia/personajes/ana.md",
    ]);
  });

  it("ranks exact names before prefixes, substrings and path matches", () => {
    expect(filterQuickOpenFiles(files(), "premisa.md").map((file) => file.path)).toEqual([
      "biblia/premisa.md",
    ]);

    const ranked = filterQuickOpenFiles(files(), "premisa");
    expect(ranked.map((file) => file.name)).toEqual([
      "premisa.md",
      "premisa-extra.md",
    ]);

    const pathMatch = filterQuickOpenFiles(files(), "personajes");
    expect(pathMatch.map((file) => file.path)).toEqual(["biblia/personajes/ana.md"]);
  });

  it("is case-insensitive and respects the result limit", () => {
    expect(filterQuickOpenFiles(files(), "ANA.MD").map((file) => file.path)).toEqual([
      "biblia/personajes/ana.md",
    ]);
    expect(filterQuickOpenFiles(files(), "a", 2)).toHaveLength(2);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterQuickOpenFiles(files(), "zzz")).toEqual([]);
  });
});
