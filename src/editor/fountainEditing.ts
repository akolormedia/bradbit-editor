import { EditorState } from "@codemirror/state";
import {
  classifyFountainLine,
  createFountainState,
  FountainLineType,
} from "./fountain";
import { FountainCommand } from "./fountainCommands";

const SCENE_PREFIX =
  /^(?:INT\.\/EXT\.|INT\/EXT\.|EXT\/INT\.|I\/E\.|INT\.|EXT\.|EST\.)\s*/i;

export function inferFountainElement(line: string): FountainCommand | null {
  const text = line.trim();
  if (!text) return null;
  if (/^#/.test(text)) return "section";
  if (text.startsWith("[[")) return "note";
  if (text.startsWith("(") && text.endsWith(")")) return "parenthetical";
  if (text.startsWith(">") || /TO:$/.test(text)) return "transition";
  if (SCENE_PREFIX.test(text) || text.startsWith(".")) return "scene";
  if (text === text.toUpperCase() && /[A-ZÁÉÍÓÚÜÑ]/.test(text)) {
    return "character";
  }
  return "action";
}

/**
 * Uses the screenplay context to distinguish a character cue from dialogue:
 * the same text can be either depending on the preceding blank line.
 */
export function fountainElementAt(
  state: EditorState,
  lineNumber: number,
): FountainCommand | null {
  let fountainState = createFountainState();
  let previousType: FountainLineType = "blank";
  for (let index = 1; index < lineNumber; index += 1) {
    const classified = classifyFountainLine(
      state.doc.line(index).text,
      fountainState,
    );
    previousType = classified.type;
    fountainState = classified.state;
  }
  const classified = classifyFountainLine(
    state.doc.line(lineNumber).text,
    fountainState,
  );
  switch (classified.type) {
    case "scene":
      return "scene";
    case "section":
      return "section";
    case "transition":
      return "transition";
    case "character":
      return "character";
    case "parenthetical":
      return "parenthetical";
    case "dialogue":
      return "dialogue";
    case "action":
      return "action";
    case "blank":
      return previousType === "character" ? "dialogue" : null;
  }
}
