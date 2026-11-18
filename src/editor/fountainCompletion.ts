import {
  acceptCompletion,
  autocompletion,
  Completion,
  CompletionContext,
  CompletionResult,
  startCompletion,
} from "@codemirror/autocomplete";
import {
  EditorState,
  Extension,
  Prec,
  StateEffect,
  StateField,
} from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { classifyFountainLine, createFountainState } from "./fountain";
import { FountainCommand } from "./fountainCommands";
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
const SECTIONS = ["#", "##", "###"];

const setFountainCompletionIntentEffect =
  StateEffect.define<FountainCommand | null>();

/**
 * Carries a toolbar command into the next completion query. The field clears
 * on the next document or selection change so it cannot leak into typing.
 */
export const fountainCompletionIntent = StateField.define<
  FountainCommand | null
>({
  create: () => null,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setFountainCompletionIntentEffect)) return effect.value;
    }
    if (transaction.docChanged || transaction.selection) return null;
    return value;
  },
});

export function setFountainCompletionIntent(command: FountainCommand | null) {
  return setFountainCompletionIntentEffect.of(command);
}

export type FountainCompletionKind =
  | "scene-template"
  | "location"
  | "moment"
  | "character"
  | "transition"
  | "parenthetical"
  | "section"
  | "mixed";

export interface DetectedFountainCompletion {
  kind: FountainCompletionKind;
  from: number;
  to: number;
  prefix: string;
}

function lineStart(state: EditorState, pos: number) {
  const line = state.doc.lineAt(pos);
  const before = state.sliceDoc(line.from, pos);
  return {
    line,
    before,
    typed: before.trimStart(),
    start: line.from + (before.length - before.trimStart().length),
  };
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

function forcedCompletion(
  state: EditorState,
  pos: number,
  command: FountainCommand,
): DetectedFountainCompletion | null {
  const { line } = lineStart(state, pos);
  const kind =
    command === "scene"
      ? "scene-template"
      : command === "character"
        ? "character"
        : command === "parenthetical"
          ? "parenthetical"
          : command === "transition"
            ? "transition"
            : command === "section"
              ? "section"
              : null;
  if (!kind) return null;
  return {
    kind,
    from: line.from,
    to: line.to,
    prefix: "",
  };
}

/**
 * Detects the Fountain completion context at `pos`. Returning `null` means
 * the cursor is in dialogue/action and no automatic popup should appear.
 */
export function detectFountainCompletion(
  state: EditorState,
  pos: number,
  explicit: boolean,
  forced?: FountainCommand | null,
): DetectedFountainCompletion | null {
  if (forced) return forcedCompletion(state, pos, forced);

  const { line, before, typed, start } = lineStart(state, pos);
  const stateBefore = classifyAt(state, line.number);
  const classified = classifyFountainLine(line.text, stateBefore);
  const type = classified.type;

  if (typed.startsWith("(")) {
    return { kind: "parenthetical", from: start, to: pos, prefix: typed };
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
        to: pos,
        prefix: before.slice(separator + 3),
      };
    }
    const prefixLength =
      sceneMatch?.[0].length ?? forcedScene?.[0].length ?? 0;
    return {
      kind: prefixLength > 0 ? "location" : "scene-template",
      from: line.from + prefixLength,
      to: pos,
      prefix: before.slice(prefixLength),
    };
  }

  if (type === "transition") {
    return { kind: "transition", from: start, to: pos, prefix: typed };
  }
  if (stateBefore.previousBlank && transitionPrefix(typed)) {
    return { kind: "transition", from: start, to: pos, prefix: typed };
  }
  if ((stateBefore.previousBlank || explicit) && scenePrefixPrefix(typed)) {
    return { kind: "scene-template", from: start, to: pos, prefix: typed };
  }
  if (type === "character") {
    return { kind: "character", from: start, to: pos, prefix: typed };
  }
  if (type === "blank") {
    if (stateBefore.afterCue) return null;
    if (explicit) return { kind: "mixed", from: start, to: pos, prefix: typed };
  }
  if (type === "action" && explicit) {
    return { kind: "mixed", from: start, to: pos, prefix: typed };
  }
  return null;
}

function replaceLine(
  view: EditorView,
  from: number,
  to: number,
  insert: string,
  nextLine = false,
) {
  const text = nextLine ? `${insert}\n` : insert;
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length },
  });
  view.focus();
}

function characterOptions(symbols: FountainSymbols): Completion[] {
  return symbols.characters.map((name) => {
    const label = name.toUpperCase();
    return {
      label,
      apply: (view, _completion, from, to) => {
        replaceLine(view, from, to, label, true);
      },
    };
  });
}

function locationOptions(symbols: FountainSymbols): Completion[] {
  return symbols.locations.map((name) => ({
    label: name.toUpperCase(),
    apply: name.toUpperCase(),
  }));
}

function sceneTemplateOptions(): Completion[] {
  return SCENE_TEMPLATES.map((template) => ({
    label: template.trim(),
    boost: template === "INT. " ? 2 : template === "EXT. " ? 1 : 0,
    apply: (view, _completion, from, to) => {
      const existing = view.state.sliceDoc(from, to).trim();
      const insert = existing ? `${template}${existing}` : template;
      replaceLine(view, from, to, insert);
      if (!existing) {
        setTimeout(() => startCompletion(view), 0);
      }
    },
  }));
}

function momentOptions(): Completion[] {
  return MOMENTS.map((moment) => ({ label: moment, apply: moment }));
}

function transitionOptions(): Completion[] {
  return TRANSITION_STARTS.map((transition) => ({
    label: transition,
    apply: (view, _completion, from, to) => {
      replaceLine(view, from, to, transition, true);
    },
  }));
}

function parentheticalOptions(): Completion[] {
  return PARENTHETICALS.map((parenthetical) => ({
    label: parenthetical,
    apply: (view, _completion, from, to) => {
      replaceLine(view, from, to, parenthetical, true);
    },
  }));
}

function sectionOptions(): Completion[] {
  return SECTIONS.map((section) => ({
    label: section,
    apply: (view, _completion, from, to) => {
      const existing = view.state
        .sliceDoc(from, to)
        .trim()
        .replace(/^#+\s*/, "");
      const insert = existing ? `${section} ${existing}` : `${section} `;
      replaceLine(view, from, to, insert, true);
    },
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
    case "section":
      return sectionOptions();
    case "mixed":
      return [
        ...sceneTemplateOptions(),
        ...characterOptions(symbols),
        ...transitionOptions(),
        ...sectionOptions(),
      ];
  }
}

export function fountainCompletionSource(
  getSymbols: () => FountainSymbols,
) {
  return (context: CompletionContext): CompletionResult | null => {
    const forced =
      context.state.field(fountainCompletionIntent, false) ?? null;
    const detected = detectFountainCompletion(
      context.state,
      context.pos,
      context.explicit,
      forced,
    );
    if (!detected) return null;

    const symbols = collectFountainSymbols(
      context.state.doc.toString(),
      getSymbols().characters,
      getSymbols().locations,
    );
    if (
      detected.kind === "character" &&
      detected.prefix.trim().length > 0
    ) {
      const typed = detected.prefix.trim().toUpperCase();
      symbols.characters = symbols.characters.filter(
        (name) => name.toUpperCase() !== typed,
      );
    }
    const options = optionsFor(detected, symbols);
    if (options.length === 0) return null;
    return {
      from: detected.from,
      to: detected.to,
      options,
    };
  };
}

/**
 * Fountain autocomplete. `autocompletion` installs Ctrl+Space, Enter, Esc and
 * arrow keys; Tab is added explicitly so it accepts without cycling elements.
 */
export function fountainCompletionExtension(
  getSymbols: () => FountainSymbols,
  enabled: boolean,
): Extension {
  if (!enabled) return [];
  return [
    fountainCompletionIntent,
    autocompletion({
      override: [fountainCompletionSource(getSymbols)],
      activateOnTyping: true,
    }),
    Prec.high(keymap.of([{ key: "Tab", run: acceptCompletion }])),
  ];
}
