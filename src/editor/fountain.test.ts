import { describe, expect, it } from "vitest";
import {
  classifyFountainLine,
  createFountainState,
  estimateFountainPages,
  fountainLineClass,
  fountainSceneNumbers,
  FountainState,
} from "./fountain";

function classify(lines: string[]): Array<{ type: string; state: FountainState }> {
  let state = createFountainState();
  const result: Array<{ type: string; state: FountainState }> = [];
  for (const line of lines) {
    const classified = classifyFountainLine(line, state);
    result.push(classified);
    state = classified.state;
  }
  return result;
}

describe("Fountain line classification (T-1.2.2)", () => {
  it("classifies scene headings, sections, transitions and notes", () => {
    const [scene, extInt, section, transition, note] = classify([
      "INT. CASA - DÍA",
      "EXT./INT. CASA / ENTRADA - DÍA",
      "## Acto 1",
      "CUT TO:",
      "[[nota privada]]",
    ]);
    expect(scene.type).toBe("scene");
    expect(extInt.type).toBe("scene");
    expect(section.type).toBe("section");
    expect(transition.type).toBe("transition");
    expect(note.type).toBe("note");
  });

  it("greys the title page until the first blank line", () => {
    const result = classify([
      "Title: Demo",
      "Credit: Escena 1",
      "Author: —",
      "Draft date: 2026-11-07",
      "",
      "INT. CASA - DÍA",
    ]);
    expect(result.slice(0, 4).map((line) => line.type)).toEqual([
      "titlepage",
      "titlepage",
      "titlepage",
      "titlepage",
    ]);
    expect(result[4].type).toBe("blank");
    expect(result[5].type).toBe("scene");
  });

  it("detects a character cue only after a blank line", () => {
    const [action, blank, cue] = classify(["Acción en minúsculas.", "", "ANA"]);
    expect(action.type).toBe("action");
    expect(blank.type).toBe("blank");
    expect(cue.type).toBe("character");
    expect(cue.state.afterCue).toBe(true);
  });

  it("keeps dialogue across parentheticals and resets on blank lines", () => {
    const result = classify([
      "ANA",
      "Hola, ¿cómo estás?",
      "(pausa)",
      "Sigo aquí.",
      "",
      "Acción.",
    ]);
    expect(result[0].type).toBe("character");
    expect(result[1].type).toBe("dialogue");
    expect(result[2].type).toBe("parenthetical");
    expect(result[2].state.afterCue).toBe(true);
    expect(result[3].type).toBe("dialogue");
    expect(result[4].type).toBe("blank");
    expect(result[5].type).toBe("action");
  });

  it("resets dialogue after a new scene heading", () => {
    const result = classify(["ANA", "Hola.", "EXT. CALLE - NOCHE", "Acción."]);
    expect(result[1].type).toBe("dialogue");
    expect(result[2].type).toBe("scene");
    expect(result[3].type).toBe("action");
  });

  it("supports forced scenes, forced cues and centered text", () => {
    const [forcedScene, blank, forcedCue, centered] = classify([
      ".CASA DE ANA",
      "",
      "@ANA",
      "> THE END",
    ]);
    expect(forcedScene.type).toBe("scene");
    expect(blank.type).toBe("blank");
    expect(forcedCue.type).toBe("character");
    expect(centered.type).toBe("transition");
  });

  it("does not treat uppercase action as a cue when there is no blank line", () => {
    const [first, second] = classify(["Texto normal.", "UNA ACCIÓN EN MAYÚSCULAS"]);
    expect(first.type).toBe("action");
    expect(second.type).toBe("action");
  });
});

describe("Fountain line classes (T-2.5.5)", () => {
  it("maps each line type to a stable editor class", () => {
    expect(fountainLineClass("scene")).toBe("fountain-line-scene");
    expect(fountainLineClass("character")).toBe("fountain-line-character");
    expect(fountainLineClass("dialogue")).toBe("fountain-line-dialogue");
    expect(fountainLineClass("parenthetical")).toBe(
      "fountain-line-parenthetical",
    );
    expect(fountainLineClass("transition")).toBe("fountain-line-transition");
    expect(fountainLineClass("action")).toBe("fountain-line-action");
    expect(fountainLineClass("titlepage")).toBe("fountain-line-titlepage");
    expect(fountainLineClass("note")).toBe("fountain-line-note");
  });
});

describe("Fountain page estimate (T-1.2.2)", () => {
  it("returns zero for an empty document", () => {
    expect(estimateFountainPages("")).toBe(0);
    expect(estimateFountainPages("   \n  ")).toBe(0);
  });

  it("estimates one page for up to 55 lines and two after that", () => {
    expect(estimateFountainPages("INT. CASA")).toBe(1);
    expect(estimateFountainPages(Array(55).fill("línea").join("\n"))).toBe(1);
    expect(estimateFountainPages(Array(56).fill("línea").join("\n"))).toBe(2);
    expect(estimateFountainPages(Array(110).fill("línea").join("\n"))).toBe(2);
  });
});

describe("Fountain scene numbers", () => {
  it("numbers scene headings in document order", () => {
    const source = [
      "Title: Demo",
      "",
      "INT. CASA - DÍA",
      "",
      "ANA",
      "Hola.",
      "",
      "EXT. CALLE - NOCHE",
      "",
      "LUIS",
      "Adiós.",
    ].join("\n");
    expect(fountainSceneNumbers(source)).toEqual([
      { line: 3, number: 1 },
      { line: 8, number: 2 },
    ]);
  });
});
