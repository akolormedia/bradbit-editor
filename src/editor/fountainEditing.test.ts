import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  applyFountainElement,
  cycleFountainElement,
  fountainElementAt,
  inferFountainElement,
} from "./fountainEditing";

describe("Fountain element editing", () => {
  it("converts the current line to each screenplay element", () => {
    expect(applyFountainElement("", "scene")).toEqual({
      text: "INT. ",
      selectionStart: 5,
      selectionEnd: 5,
    });
    expect(applyFountainElement("casa", "scene").text).toBe("INT. CASA");
    expect(applyFountainElement("ana", "character").text).toBe("ANA");
    expect(applyFountainElement("@ana", "character").text).toBe("ANA");
    expect(applyFountainElement("hola", "parenthetical").text).toBe("(hola)");
    expect(applyFountainElement("corte", "transition").text).toBe(">CORTE");
    expect(applyFountainElement("acto", "section").text).toBe("# acto");
    expect(applyFountainElement("nota", "note").text).toBe("[[nota]]");
    expect(applyFountainElement("# acto", "action").text).toBe("acto");
  });

  it("keeps a useful caret inside empty templates", () => {
    expect(applyFountainElement("", "parenthetical")).toEqual({
      text: "()",
      selectionStart: 1,
      selectionEnd: 1,
    });
    expect(applyFountainElement("", "note")).toEqual({
      text: "[[]]",
      selectionStart: 2,
      selectionEnd: 2,
    });
    expect(applyFountainElement("", "character")).toEqual({
      text: "PERSONAJE",
      selectionStart: 0,
      selectionEnd: 9,
    });
  });

  it("infers the current element and cycles through the toolbar order", () => {
    expect(inferFountainElement("INT. CASA - DAY")).toBe("scene");
    expect(inferFountainElement("# Acto 1")).toBe("section");
    expect(inferFountainElement(">CUT TO:")).toBe("transition");
    expect(inferFountainElement("(beat)")).toBe("parenthetical");
    expect(inferFountainElement("ANA")).toBe("character");
    expect(inferFountainElement("Hola.")).toBe("action");

    const character = cycleFountainElement("Ana", 1, "action");
    expect(character.text).toBe("ANA");
    const dialogue = cycleFountainElement("ANA", 1, "character");
    expect(dialogue.moveToNextLine).toBe(true);
    const parenthetical = cycleFountainElement("ANA", 1, "dialogue");
    expect(parenthetical.text).toBe("(ANA)");
    const transition = cycleFountainElement(parenthetical.text, 1);
    expect(transition.text).toBe(">(ANA)");
  });

  it("distinguishes character cues from dialogue using the screenplay context", () => {
    const state = EditorState.create({
      doc: "\nANA\nHola.\n\nLUIS",
    });
    expect(fountainElementAt(state, 2)).toBe("character");
    expect(fountainElementAt(state, 3)).toBe("dialogue");
    expect(fountainElementAt(state, 4)).toBeNull();
    expect(fountainElementAt(state, 5)).toBe("character");

    const cueState = EditorState.create({ doc: "ANA\n" });
    expect(fountainElementAt(cueState, 2)).toBe("dialogue");
  });

  it("starts an empty line with a scene heading", () => {
    expect(cycleFountainElement("", 1).text).toBe("INT. ");
    expect(cycleFountainElement("", -1).text).toBe("[[]]");
  });
});
