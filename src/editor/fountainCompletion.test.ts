import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  detectFountainCompletion,
  fountainCompletionExtension,
  fountainCompletionIntent,
  fountainCompletionSource,
  setFountainCompletionIntent,
} from "./fountainCompletion";
import { FountainCommand } from "./fountainCommands";
import { FountainSymbols } from "./fountainSymbols";
import { Language } from "../types";

const symbols: FountainSymbols = {
  characters: ["ANA", "LUIS"],
  locations: ["CASA", "CALLE"],
};

function state(
  doc: string,
  forced: FountainCommand | null = null,
): EditorState {
  let editorState = EditorState.create({
    doc,
    extensions: [fountainCompletionIntent],
  });
  if (forced) {
    editorState = editorState.update({
      effects: setFountainCompletionIntent(forced),
    }).state;
  }
  return editorState;
}

function sourceAt(
  doc: string,
  explicit = false,
  forced: FountainCommand | null = null,
  language: Language = "es",
) {
  const editorState = state(doc, forced);
  return fountainCompletionSource(
    () => symbols,
    language,
  )(new CompletionContext(editorState, editorState.doc.length, explicit));
}

function labels(
  doc: string,
  explicit = false,
  forced: FountainCommand | null = null,
  language: Language = "es",
) {
  return sourceAt(doc, explicit, forced, language)?.options.map(
    (item) => item.label,
  ) ?? [];
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
    expect(labels("INT. CASA - DAY\n\nAN")).toContain("ANA");
    expect(labels("INT. CASA - DAY\n\nAN")).toContain("LUIS");
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
    expect(labels("INT. ")).toEqual(["CASA", "CALLE"]);

    const momentState = state("INT. CASA - ");
    expect(
      detectFountainCompletion(
        momentState,
        momentState.doc.length,
        false,
      )?.kind,
    ).toBe("moment");
    expect(labels("INT. CASA - ")).toContain("DÍA");
    expect(labels("INT. CASA - ", false, null, "en")).toContain("DAY");
  });

  it("never opens automatic completion inside dialogue", () => {
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

  it("opens the requested list when a toolbar command forces it", () => {
    const sceneState = state("Hola.");
    expect(
      detectFountainCompletion(
        sceneState,
        sceneState.doc.length,
        false,
        "scene",
      ),
    ).toMatchObject({ kind: "scene-template", from: 0, to: 5, prefix: "" });
    expect(labels("Hola.", false, "scene")).toEqual([
      "INT.",
      "EXT.",
      "INT./EXT.",
      "EXT./INT.",
      "I/E.",
      "EST.",
    ]);

    expect(labels("AN", false, "character")).toContain("ANA");
    expect(labels("", false, "section")).toEqual(["#", "##", "###"]);
  });

  it("localizes moments and parentheticals", () => {
    expect(labels("ANA\n(")).toContain("(pausa)");
    expect(labels("ANA\n(", false, null, "en")).toContain("(beat)");
    expect(labels("INT. CASA - ")).toContain("ATARDECER");
    expect(labels("INT. CASA - ", false, null, "en")).toContain("DUSK");
  });

  it("offers parentheticals, transitions and explicit mixed completion", () => {
    expect(labels("ANA\n(")).toContain("(pausa)");
    expect(labels("\nCUT")).toContain("CUT TO:");
    expect(labels("\n", true).length).toBeGreaterThan(3);
  });

  it("can be disabled without installing the extension", () => {
    expect(fountainCompletionExtension(() => symbols, "es", false)).toEqual([]);
  });
});
