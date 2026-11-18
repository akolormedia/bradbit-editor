import { EditorState } from "@codemirror/state";
import {
  classifyFountainLine,
  createFountainState,
  FountainLineType,
} from "./fountain";

export type FountainElement =
  | "scene"
  | "action"
  | "character"
  | "dialogue"
  | "parenthetical"
  | "transition"
  | "section"
  | "note";

export const FOUNTAIN_ELEMENT_ORDER: FountainElement[] = [
  "scene",
  "action",
  "character",
  "dialogue",
  "parenthetical",
  "transition",
  "section",
  "note",
];

export interface FountainLineEdit {
  text: string;
  selectionStart: number;
  selectionEnd: number;
  moveToNextLine?: boolean;
}

const SCENE_PREFIX =
  /^(?:INT\.\/EXT\.|INT\/EXT\.|EXT\/INT\.|I\/E\.|INT\.|EXT\.|EST\.)\s*/i;

function edit(
  text: string,
  selectionStart = text.length,
  selectionEnd = selectionStart,
): FountainLineEdit {
  return { text, selectionStart, selectionEnd };
}

function stripForcedPrefix(text: string): string {
  return text
    .replace(/^[.@>]+/, "")
    .replace(/^#+\s*/, "")
    .replace(/^\((.*)\)$/, "$1")
    .trim();
}

/**
 * Converts the current line to a Fountain element. The returned positions are
 * relative to the line, so the editor can replace the line and keep the caret.
 */
export function applyFountainElement(
  line: string,
  element: FountainElement,
): FountainLineEdit {
  const content = line.trim();

  switch (element) {
    case "scene": {
      if (!content) return edit("INT. ");
      const scene = SCENE_PREFIX.test(content)
        ? content.toUpperCase()
        : `INT. ${content.toUpperCase()}`;
      return edit(scene);
    }
    case "action": {
      if (!content) return edit("");
      return edit(stripForcedPrefix(content));
    }
    case "character": {
      if (!content) return edit("PERSONAJE", 0, "PERSONAJE".length);
      return edit(content.replace(/^@/, "").toUpperCase());
    }
    case "dialogue": {
      if (!content) return edit("");
      return edit(content.replace(/^@/, ""));
    }
    case "parenthetical": {
      if (!content) return edit("()", 1);
      if (content.startsWith("(") && content.endsWith(")")) {
        return edit(content, 1, content.length - 1);
      }
      return edit(`(${content})`, 1, content.length + 1);
    }
    case "transition": {
      if (!content) return edit(">CUT TO:");
      const transition = content.startsWith(">")
        ? content.toUpperCase()
        : `>${content.toUpperCase()}`;
      return edit(transition);
    }
    case "section": {
      if (!content) return edit("# ");
      return edit(/^#+\s/.test(content) ? content : `# ${content}`);
    }
    case "note": {
      if (!content) return edit("[[]]", 2);
      if (content.startsWith("[[") && content.endsWith("]]")) {
        return edit(content, 2, content.length - 2);
      }
      return edit(`[[${content}]]`, 2, content.length + 2);
    }
  }
}

export function inferFountainElement(line: string): FountainElement | null {
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
): FountainElement | null {
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

export function cycleFountainElement(
  line: string,
  direction: 1 | -1,
  current: FountainElement | null = inferFountainElement(line),
): FountainLineEdit {
  const index = current ? FOUNTAIN_ELEMENT_ORDER.indexOf(current) : -1;
  const nextIndex =
    index === -1
      ? direction === 1
        ? 0
        : FOUNTAIN_ELEMENT_ORDER.length - 1
      : (index + direction + FOUNTAIN_ELEMENT_ORDER.length) %
        FOUNTAIN_ELEMENT_ORDER.length;
  const next = FOUNTAIN_ELEMENT_ORDER[nextIndex];

  if (current === "character" && next === "dialogue") {
    return {
      text: line,
      selectionStart: line.length,
      selectionEnd: line.length,
      moveToNextLine: true,
    };
  }
  return applyFountainElement(line, next);
}
