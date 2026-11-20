import { describe, expect, it } from "vitest";
import {
  collectFountainSymbols,
  extractFountainCharacters,
  extractFountainLocations,
} from "./fountainSymbols";

describe("Fountain document symbols", () => {
  it("extracts character cues and scene locations from the current script", () => {
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
      "",
      "EXT./INT. CASA / ENTRADA - DÍA",
    ].join("\n");

    expect(extractFountainCharacters(source)).toEqual(["ANA", "LUIS"]);
    expect(extractFountainLocations(source)).toEqual([
      "CASA",
      "CALLE",
      "CASA / ENTRADA",
    ]);
  });

  it("merges contributed bible symbols without duplicates", () => {
    const symbols = collectFountainSymbols(
      "INT. CASA - DAY\n\nANA\nHola.",
      ["Ana", "Luis"],
      ["Casa", "Calle"],
    );
    expect(symbols.characters).toEqual(["Ana", "Luis"]);
    expect(symbols.locations).toEqual(["Casa", "Calle"]);
  });
});
