import { describe, expect, it } from "vitest";
import {
  collectBibleFilePaths,
  collectFountainSymbols,
  extractFountainCharacters,
  extractFountainLocations,
  parseBibleEntry,
} from "./fountainSymbols";

describe("Fountain symbol index", () => {
  it("extracts character cues and scene locations from the screenplay", () => {
    const source = [
      "INT. CASA - DAY",
      "",
      "ANA",
      "Hola.",
      "",
      "EXT. CALLE - NIGHT",
      "",
      "LUIS",
      "Adiós.",
    ].join("\n");

    expect(extractFountainCharacters(source)).toEqual(["ANA", "LUIS"]);
    expect(extractFountainLocations(source)).toEqual(["CASA", "CALLE"]);
  });

  it("reads bible names, aliases and heading fallbacks", () => {
    expect(
      parseBibleEntry(`---
name: Ana
aliases: [Anita, La niña]
---
# Ana`),
    ).toEqual(["Ana", "Anita", "La niña"]);

    expect(
      parseBibleEntry(`---
name: Luis
aliases:
  - Lucho
  - El editor
---`),
    ).toEqual(["Luis", "Lucho", "El editor"]);

    expect(parseBibleEntry("# Fidelina\n\nNana.")).toEqual(["Fidelina"]);
  });

  it("finds character and location files only under the supported folders", () => {
    const tree = [
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
                name: "_template.md",
                path: "bible/characters/_template.md",
                isDir: false,
                isConfig: false,
              },
            ],
          },
          {
            name: "premise.md",
            path: "bible/premise.md",
            isDir: false,
            isConfig: false,
          },
        ],
      },
    ];

    expect(collectBibleFilePaths(tree, ["bible/characters"])).toEqual([
      "bible/characters/ana.md",
    ]);
  });

  it("merges bible and screenplay symbols without duplicates", () => {
    const symbols = collectFountainSymbols(
      "INT. CASA - DAY\n\nANA\nHola.",
      ["Ana", "Luis"],
      ["Casa", "Calle"],
    );
    expect(symbols.characters).toEqual(["Ana", "Luis"]);
    expect(symbols.locations).toEqual(["Casa", "Calle"]);
  });
});
