import {
  EditorState,
  Extension,
  StateEffect,
  StateField,
} from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import { GitBlameLine, Language } from "../types";
import { t } from "../i18n";

const setBlameEffect = StateEffect.define<readonly GitBlameLine[]>();
const setBlameEnabledEffect = StateEffect.define<boolean>();

export const blameField = StateField.define<readonly GitBlameLine[]>({
  create: () => [],
  update(lines, transaction) {
    let next = lines;
    for (const effect of transaction.effects) {
      if (effect.is(setBlameEffect)) next = effect.value;
    }
    return next;
  },
});

const blameEnabledField = StateField.define<boolean>({
  create: () => true,
  update(enabled, transaction) {
    let next = enabled;
    for (const effect of transaction.effects) {
      if (effect.is(setBlameEnabledEffect)) next = effect.value;
    }
    return next;
  },
});

function shortCommit(commit: string): string {
  return commit.slice(0, 7);
}

function relativeDate(iso: string, language: Language): string {
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return "";
  const deltaSeconds = Math.round((timestamp - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(language, {
    numeric: "auto",
  });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
  ];
  for (const [unit, seconds] of units) {
    if (Math.abs(deltaSeconds) >= seconds) {
      return formatter.format(Math.round(deltaSeconds / seconds), unit);
    }
  }
  return formatter.format(Math.round(deltaSeconds), "second");
}

class BlameWidget extends WidgetType {
  constructor(
    private readonly entry: GitBlameLine,
    private readonly language: Language,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof BlameWidget &&
      other.entry.line === this.entry.line &&
      other.entry.commit === this.entry.commit &&
      other.entry.author === this.entry.author &&
      other.language === this.language
    );
  }

  toDOM(): HTMLElement {
    const element = document.createElement("span");
    element.className = "cm-inline-blame";

    if (!this.entry.commit) {
      element.textContent = t(this.language, "blameUnsaved");
      element.classList.add("unsaved");
      return element;
    }

    const author = this.entry.author.trim() || t(this.language, "blameUnknownAuthor");
    const date = relativeDate(this.entry.date, this.language);
    element.textContent = date ? `${author}, ${date}` : author;
    element.title = this.entry.summary
      ? `${shortCommit(this.entry.commit)} · ${this.entry.summary}`
      : shortCommit(this.entry.commit);
    return element;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function buildBlameDecorations(
  state: EditorState,
  language: Language,
): DecorationSet {
  if (!state.field(blameEnabledField, false)) return Decoration.none;
  const lines = state.field(blameField, false) ?? [];
  if (lines.length === 0) return Decoration.none;
  const line = state.doc.lineAt(state.selection.main.head);
  if (line.text.trim().length === 0) return Decoration.none;
  const entry = lines.find((candidate) => candidate.line === line.number);
  if (!entry) return Decoration.none;
  return Decoration.set(
    [
      Decoration.widget({
        widget: new BlameWidget(entry, language),
        side: 1,
      }).range(line.to),
    ],
    true,
  );
}

/** Shows Git blame for the current line, Zed-style. */
export class InlineBlameView {
  constructor(
    private readonly getLanguage: () => Language,
    private readonly getView: () => EditorView | null,
  ) {}

  public extension(): Extension {
    return [
      blameField,
      blameEnabledField,
      EditorView.decorations.compute(
        ["selection", blameField, blameEnabledField],
        (state) => buildBlameDecorations(state, this.getLanguage()),
      ),
    ];
  }

  public setBlame(lines: readonly GitBlameLine[]): void {
    this.getView()?.dispatch({ effects: setBlameEffect.of(lines) });
  }

  public setEnabled(enabled: boolean): void {
    this.getView()?.dispatch({
      effects: setBlameEnabledEffect.of(enabled),
    });
  }

  public clear(): void {
    this.setBlame([]);
  }
}
