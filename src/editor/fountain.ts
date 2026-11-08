export interface FountainState {
  afterCue: boolean;
  previousBlank: boolean;
}

export type FountainLineType =
  | "blank"
  | "scene"
  | "section"
  | "transition"
  | "character"
  | "parenthetical"
  | "dialogue"
  | "action";

export function createFountainState(): FountainState {
  return { afterCue: false, previousBlank: true };
}

const SCENE_RE = /^(INT\.|EXT\.|INT\.\/EXT\.|INT\/EXT\.|I\/E\.|EST\.|EXT\/INT\.)/i;
const TRANSITION_RE =
  /^(FADE (IN|OUT)|FADE TO BLACK|CUT TO|SMASH CUT TO|DISSOLVE TO|MATCH CUT TO)/i;

/**
 * Classifies a single Fountain line and returns the state for the next line.
 * Keeping this pure makes the screenplay highlighting rules unit-testable.
 */
export function classifyFountainLine(
  rawLine: string,
  state: FountainState,
): { type: FountainLineType; state: FountainState } {
  const line = rawLine.trim();
  const wasBlank = state.previousBlank;

  if (line.length === 0) {
    return { type: "blank", state: { afterCue: false, previousBlank: true } };
  }

  const next = (afterCue: boolean): FountainState => ({
    afterCue,
    previousBlank: false,
  });

  if (SCENE_RE.test(line) || line.startsWith(".")) {
    return { type: "scene", state: next(false) };
  }
  if (/^#+/.test(line)) {
    return { type: "section", state: next(false) };
  }
  if (line.endsWith("TO:") || line.startsWith(">") || TRANSITION_RE.test(line)) {
    return { type: "transition", state: next(false) };
  }
  if (line.startsWith("(") && line.endsWith(")")) {
    return { type: "parenthetical", state: next(state.afterCue) };
  }
  if (line.startsWith("[[")) {
    // Notes and boneyard markers never start a character cue.
    return { type: "action", state: next(false) };
  }
  if (!state.afterCue && wasBlank && isCharacterCue(line)) {
    return { type: "character", state: next(true) };
  }
  if (state.afterCue) {
    return { type: "dialogue", state: next(true) };
  }
  return { type: "action", state: next(false) };
}

function isCharacterCue(line: string): boolean {
  const candidate = line.startsWith("@") ? line.slice(1) : line;
  if (candidate.length === 0 || candidate.length > 50) return false;
  if (!/[A-ZÁÉÍÓÚÜÑ]/.test(candidate)) return false;
  return candidate === candidate.toUpperCase();
}

/** CSS class used by the editor to color a Fountain line. */
export function fountainLineClass(type: FountainLineType): string {
  return `fountain-line-${type}`;
}

/** Rough page estimate of 55 script lines per page (refined in T-1.2.3). */
export function estimateFountainPages(source: string): number {
  if (source.trim().length === 0) return 0;
  const lineCount = source.split(/\r?\n/).length;
  return Math.max(1, Math.ceil(lineCount / 55));
}
