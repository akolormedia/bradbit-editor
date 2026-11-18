import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  detectFountainCompletion,
  fountainCompletionExtension,
  fountainCompletionSource,
} from "./fountainCompletion";
import { FountainSymbols } from "./fountainSymbols";

const symbols: FountainSymbols = {
  characters: ["ANA", "LUIS"],
  locations: ["CASA", "CALLE"],
};

function state(doc: string): EditorState {
  return EditorState.create({ doc });
}

function sourceAt(doc: string, explicit = false) {
  const editorState = state(doc);
  return fountainCompletionSource(() => symbols)(
    new CompletionContext(editorState, editorState.doc.length, explicit),
  );
}

describe("Fountain autocomplete", () => {
  it("completes characters after a blank line", () => {
    const editorState = state("INT. CASA - DAY\n\nAN");
    const detected = detectFountainCompletion(
      editorState,
      editorState.doc.length,
      false,
    );
    expect(detected?.kind).toBe("character");
    const labels = sourceAt("INT. CASA - DAY\n\nAN")?.options.map(
      (item) => item.label,
    );
    expect(labels).toContain("ANA");
    expect(labels).toContain("LUIS");
  });

  it("completes locations after the scene prefix and moments after the dash", () => {
    const locationState = state("INT. ");
    expect(
      detectFountainCompletion(
        locationState,
        locationState.doc.length,
        false,
      )?.kind,
    ).toBe("location");
    expect(sourceAt("INT. ")?.options.map((item) => item.label)).toEqual([
      "CASA",
      "CALLE",
    ]);

    const momentState = state("INT. CASA - ");
    expect(
      detectFountainCompletion(
        momentState,
        momentState.doc.length,
        false,
      )?.kind,
    ).toBe("moment");
    expect(sourceAt("INT. CASA - ")?.options.map((item) => item.label)).toContain(
      "DAY",
    );
  });

  it("never opens inside dialogue", () => {
    const editorState = state("ANA\nHola, ¿có");
    expect(
      detectFountainCompletion(
        editorState,
        editorState.doc.length,
        true,
      ),
    ).toBeNull();
    expect(sourceAt("ANA\nHola, ¿có", true)).toBeNull();
  });

  it("offers parentheticals, transitions and explicit mixed completion", () => {
    expect(sourceAt("ANA\n(")?.options.map((item) => item.label)).toContain(
      "(beat)",
    );
    expect(sourceAt("\nCUT")?.options.map((item) => item.label)).toContain(
      "CUT TO:",
    );
    expect(sourceAt("\n", true)?.options.length).toBeGreaterThan(3);
  });

  it("can be disabled without installing the extension", () => {
    expect(fountainCompletionExtension(() => symbols, false)).toEqual([]);
  });
});
