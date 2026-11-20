import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { fountainElementAt, inferFountainElement } from "./fountainEditing";

describe("Fountain element context", () => {
  it("infers the element from the visible line", () => {
    expect(inferFountainElement("INT. CASA - DAY")).toBe("scene");
    expect(inferFountainElement("# Acto 1")).toBe("section");
    expect(inferFountainElement(">CUT TO:")).toBe("transition");
    expect(inferFountainElement("(beat)")).toBe("parenthetical");
    expect(inferFountainElement("ANA")).toBe("character");
    expect(inferFountainElement("Hola.")).toBe("action");
    expect(inferFountainElement("")).toBeNull();
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
});
