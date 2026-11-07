import { describe, expect, it } from "vitest";
import { FileTreeNode } from "../types";
import { filterTreeByQuery } from "./treeFilter";

function file(name: string, path: string): FileTreeNode {
  return { name, path, isDir: false, isConfig: false };
}

function dir(name: string, path: string, children: FileTreeNode[]): FileTreeNode {
  return { name, path, isDir: true, isConfig: false, children };
}

const tree: FileTreeNode[] = [
  dir("guion", "guion", [
    file("escena-1.md", "guion/escena-1.md"),
    file("escena-2.md", "guion/escena-2.md"),
  ]),
  dir("personajes", "personajes", [
    file("ana.md", "personajes/ana.md"),
    file("luis.md", "personajes/luis.md"),
  ]),
  dir("investigación", "investigación", [
    file("cronología.md", "investigación/cronología.md"),
  ]),
  file("README.md", "README.md"),
];

function paths(nodes: FileTreeNode[]): string[] {
  return nodes.flatMap((node) => [
    node.path,
    ...(node.children ? paths(node.children) : []),
  ]);
}

describe("tree file filter (T-2.4.5)", () => {
  it("keeps matching files and their ancestor folders", () => {
    const filtered = filterTreeByQuery(tree, "escena");
    expect(filtered.map((node) => node.path)).toEqual(["guion"]);
    expect(paths(filtered)).toEqual([
      "guion",
      "guion/escena-1.md",
      "guion/escena-2.md",
    ]);
  });

  it("filters files inside a folder and keeps the folder", () => {
    const filtered = filterTreeByQuery(tree, "ana");
    expect(filtered.map((node) => node.path)).toEqual(["personajes"]);
    expect(paths(filtered)).toEqual(["personajes", "personajes/ana.md"]);
  });

  it("shows all children when the folder name matches", () => {
    const filtered = filterTreeByQuery(tree, "personajes");
    expect(paths(filtered)).toEqual([
      "personajes",
      "personajes/ana.md",
      "personajes/luis.md",
    ]);
  });

  it("is case- and accent-insensitive", () => {
    expect(filterTreeByQuery(tree, "GUION").map((node) => node.path)).toEqual([
      "guion",
    ]);
    expect(
      filterTreeByQuery(tree, "cronologia").map((node) => node.path),
    ).toEqual(["investigación"]);
  });

  it("matches relative paths", () => {
    const filtered = filterTreeByQuery(tree, "guion/escena-2");
    expect(paths(filtered)).toEqual(["guion", "guion/escena-2.md"]);
  });

  it("returns the original tree for an empty query and no results otherwise", () => {
    expect(filterTreeByQuery(tree, "  ")).toBe(tree);
    expect(filterTreeByQuery(tree, "zzz-no-file")).toEqual([]);
  });
});
