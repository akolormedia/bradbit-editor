import {
  acceptCompletion,
  autocompletion,
  Completion,
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete";
import { EditorState, Extension, Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { classifyFountainLine, createFountainState } from "./fountain";
import {
  collectFountainSymbols,
  FountainSymbols,
} from "./fountainSymbols";

const SCENE_PREFIX =
  /^(?:INT\.\/EXT\.|INT\/EXT\.|EXT\/INT\.|I\/E\.|INT\.|EXT\.|EST\.)\s*/i;
const FORCED_SCENE = /^\.\s*/;
const TRANSITION_STARTS = [
  "CUT TO:",
  "SMASH CUT TO:",
  "DISSOLVE TO:",
  "MATCH CUT TO:",
  "FADE OUT.",
];
const SCENE_TEMPLATES = ["INT. ", "EXT. ", "INT./EXT. ", "I/E. ", "EST. "];
const MOMENTS = [
  "DAY",
  "NIGHT",
  "DAWN",
  "DUSK",
  "CONTINUOUS",
  "LATER",
  "MOMENTS LATER",
];
const PARENTHETICALS = [
  "(beat)",
  "(V.O.)",
  "(O.S.)",
  "(CONT'D)",
  "(whispering)",
  "(pause)",
];

export type FountainCompletionKind =
  | "scene-template"
  | "location"
  | "moment"
  | "character"
  | "transition"
  | "parenthetical"
  | "mixed";

export interface DetectedFountainCompletion {
  kind: FountainCompletionKind;
  from: number;
  prefix: string;
}

function classifyAt(
  state: EditorState,
  lineNumber: number,
): ReturnType<typeof createFountainState> {
  let fountainState = createFountainState();
  for (let index = 1; index < lineNumber; index += 1) {
    fountainState = classifyFountainLine(
      state.doc.line(index).text,
      fountainState,
    ).state;
  }
  return fountainState;
}

function scenePrefixPrefix(text: string): boolean {
  const upper = text.toUpperCase();
  if (upper.length < 3 && !upper.includes(".") && !upper.includes("/")) {
    return false;
  }
  return ["INT", "EXT", "EST", "I/E", "INT./EXT.", "EXT/INT."].some(
    (prefix) => prefix.startsWith(upper) || upper.startsWith(prefix),
  );
}

function transitionPrefix(text: string): boolean {
  const upper = text.toUpperCase();
  if (upper.length < 3) return false;
  return TRANSITION_STARTS.some(
    (transition) =>
      transition.startsWith(upper) || upper.startsWith(transition),
  );
}

/**
 * Detects the Fountain completion context at `pos`. Returning `null` means
 * the cursor is in dialogue/action and no popup should appear.
 */
export function detectFountainCompletion(
  state: EditorState,
  pos: number,
  explicit: boolean,
): DetectedFountainCompletion | null {
  const line = state.doc.lineAt(pos);
  const before = state.sliceDoc(line.from, pos);
  const typed = before.trimStart();
  const leading = before.length - typed.length;
  const from = line.from + leading;
  const stateBefore = classifyAt(state, line.number);
  const classified = classifyFountainLine(line.text, stateBefore);
  const type = classified.type;

  if (typed.startsWith("(")) {
    return { kind: "parenthetical", from, prefix: typed };
  }
  if (type === "dialogue") return null;

  const sceneMatch = before.match(SCENE_PREFIX);
  const forcedScene = before.match(FORCED_SCENE);
  if (type === "scene" || sceneMatch || forcedScene) {
    const separator = before.indexOf(" - ");
    if (separator >= 0) {
      return {
        kind: "moment",
        from: line.from + separator + 3,
        prefix: before.slice(separator + 3),
      };
    }
    const prefixLength =
      sceneMatch?.[0].length ?? forcedScene?.[0].length ?? 0;
    return {
      kind: prefixLength > 0 ? "location" : "scene-template",
      from: line.from + prefixLength,
      prefix: before.slice(prefixLength),
    };
  }

  if (type === "transition") {
    return { kind: "transition", from, prefix: typed };
  }

  if (stateBefore.previousBlank && transitionPrefix(typed)) {
    return { kind: "transition", from, prefix: typed };
  }
  if (
    (stateBefore.previousBlank || explicit) &&
    scenePrefixPrefix(typed)
  ) {
    return { kind: "scene-template", from, prefix: typed };
  }
  if (type === "character") {
    return { kind: "character", from, prefix: typed };
  }
  if (type === "blank") {
    if (stateBefore.afterCue) return null;
    if (explicit) return { kind: "mixed", from, prefix: typed };
  }
  if (type === "action" && explicit) {
    return { kind: "mixed", from, prefix: typed };
  }
  return null;
}

function characterOptions(
  symbols: FountainSymbols,
): Completion[] {
  return symbols.characters.map((name) => {
    const label = name.toUpperCase();
    return {
      label,
      apply: (view, _completion, from, to) => {
        const insert = `${label}\n`;
        view.dispatch({
          changes: { from, to, insert },
          selection: { anchor: from + insert.length },
        });
        view.focus();
      },
    };
  });
}

function locationOptions(symbols: FountainSymbols): Completion[] {
  if (symbols.locations.length === 0) return [];
  return symbols.locations.map((name) => ({
    label: name.toUpperCase(),
    apply: name.toUpperCase(),
  }));
}

function sceneTemplateOptions(): Completion[] {
  return SCENE_TEMPLATES.map((template) => ({
    label: template.trim(),
    apply: template,
  }));
}

function momentOptions(): Completion[] {
  return MOMENTS.map((moment) => ({ label: moment, apply: moment }));
}

function transitionOptions(): Completion[] {
  return TRANSITION_STARTS.map((transition) => ({
    label: transition,
    apply: (view, _completion, from, to) => {
      const insert = `${transition}\n`;
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + insert.length },
      });
      view.focus();
    },
  }));
}

function parentheticalOptions(): Completion[] {
  return PARENTHETICALS.map((parenthetical) => ({
    label: parenthetical,
    apply: parenthetical,
  }));
}

function optionsFor(
  detected: DetectedFountainCompletion,
  symbols: FountainSymbols,
): Completion[] {
  switch (detected.kind) {
    case "scene-template":
      return sceneTemplateOptions();
    case "location":
      return locationOptions(symbols);
    case "moment":
      return momentOptions();
    case "character":
      return characterOptions(symbols);
    case "transition":
      return transitionOptions();
    case "parenthetical":
      return parentheticalOptions();
    case "mixed":
      return [
        ...sceneTemplateOptions(),
        ...characterOptions(symbols),
        ...transitionOptions(),
      ];
  }
}

export function fountainCompletionSource(
  getSymbols: () => FountainSymbols,
) {
  return (context: CompletionContext): CompletionResult | null => {
    const detected = detectFountainCompletion(
      context.state,
      context.pos,
      context.explicit,
    );
    if (!detected) return null;
    const symbols = collectFountainSymbols(
      context.state.doc.toString(),
      getSymbols().characters,
      getSymbols().locations,
    );
    if (detected.kind === "character" && detected.prefix.trim().length > 0) {
      const typed = detected.prefix.trim().toUpperCase();
      symbols.characters = symbols.characters.filter(
        (name) => name.toUpperCase() !== typed,
      );
    }
    const options = optionsFor(detected, symbols);
    if (options.length === 0) return null;
    return {
      from: detected.from,
      to: context.pos,
      options,
    };
  };
}

/** Fountain autocomplete plus `Ctrl+Space`, `Enter`/`Tab` and `Esc`. */
export function fountainCompletionExtension(
  getSymbols: () => FountainSymbols,
  enabled: boolean,
): Extension {
  if (!enabled) return [];
  return [
    autocompletion({
      override: [fountainCompletionSource(getSymbols)],
      activateOnTyping: true,
    }),
    Prec.high(
      keymap.of([{ key: "Tab", run: acceptCompletion }]),
    ),
  ];
}
