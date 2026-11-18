import { describe, expect, it } from "vitest";
import { FileTreeNode } from "../types";
import {
  collectSourceFilePaths,
  loadSymbolIndex,
  parseSymbolDocument,
  symbolNames,
} from "./index";

const charSource = {
  id: "screenplay.characters",
  language: "fountain",
  kind: "character",
  include: ["bible/characters/**/*.md"],
  name: "frontmatter.name",
  aliases: ["frontmatter.aliases"],
  fallback: "heading",
};

const locationSource = {
  id: "screenplay.locations",
  language: "fountain",
  kind: "location",
  include: ["bible/locations/**/*.md"],
  name: "heading",
};

function tree(): FileTreeNode[] {
  return [
    {
      name: "bible",
      path: "bible",
      isDir: true,
      isConfig: false,
      children: [
        {
          name: "characters",
          path: "bible/characters",
          isDir: true,
          isConfig: false,
          children: [
            {
              name: "ana.md",
              path: "bible/characters/ana.md",
              isDir: false,
              isConfig: false,
            },
            {
              name: "ana-duplicate.md",
              path: "bible/characters/ana-duplicate.md",
              isDir: false,
              isConfig: false,
            },
            {
              name: "_template.md",
              path: "bible/characters/_template.md",
              isDir: false,
              isConfig: false,
            },
          ],
        },
        {
          name: "locations",
          path: "bible/locations",
          isDir: true,
          isConfig: false,
          children: [
            {
              name: "casa.md",
              path: "bible/locations/casa.md",
              isDir: false,
              isConfig: false,
            },
          ],
        },
      ],
    },
  ];
}

describe("generic symbol index", () => {
  it("reads names and aliases through source selectors", () => {
    const entry = parseSymbolDocument(
      `---
name: Ana
aliases: [Anita, La niña]
---
# Ana`,
      charSource,
      "bible/characters/ana.md",
    );
    expect(entry).toEqual({
      name: "Ana",
      aliases: ["Anita", "La niña"],
      sourceId: "screenplay.characters",
    });
  });

  it("falls back to the first heading or filename", () => {
    expect(
      parseSymbolDocument("# Casa de Ana\n", locationSource, "bible/locations/casa.md"),
    ).toMatchObject({ name: "Casa de Ana" });
    expect(
      parseSymbolDocument("Sin título\n", charSource, "bible/characters/elena.md"),
    ).toMatchObject({ name: "Elena" });
  });

  it("collects only declared files and skips templates", () => {
    expect(collectSourceFilePaths(tree(), charSource)).toEqual([
      "bible/characters/ana-duplicate.md",
      "bible/characters/ana.md",
    ]);
    expect(collectSourceFilePaths(tree(), locationSource)).toEqual([
      "bible/locations/casa.md",
    ]);
  });

  it("loads, deduplicates and exposes names plus aliases by kind", async () => {
    const files = new Map([
      [
        "bible/characters/ana.md",
        "---\nname: Ana\naliases: [Anita]\n---\n",
      ],
      [
        "bible/characters/ana-duplicate.md",
        "---\nname: Ana\naliases: [La niña]\n---\n",
      ],
      ["bible/locations/casa.md", "# Casa de Ana\n"],
    ]);
    const index = await loadSymbolIndex(
      tree(),
      [charSource, locationSource],
      async (path) => files.get(path) ?? "",
    );

    expect(symbolNames(index, "character")).toEqual([
      "Ana",
      "Anita",
      "La niña",
    ]);
    expect(symbolNames(index, "location")).toEqual(["Casa de Ana"]);
  });
});
