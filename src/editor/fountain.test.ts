import { describe, expect, it } from "vitest";
import {
  classifyFountainLine,
  createFountainState,
  estimateFountainPages,
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
    const [scene, section, transition, note] = classify([
      "INT. CASA - DÍA",
      "## Acto 1",
      "CUT TO:",
      "[[nota privada]]",
    ]);
    expect(scene.type).toBe("scene");
    expect(section.type).toBe("section");
    expect(transition.type).toBe("transition");
    expect(note.type).toBe("action");
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
