import {
  EditorState,
  Extension,
  Facet,
  RangeSet,
  RangeSetBuilder,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  GutterMarker,
  WidgetType,
  gutter,
  keymap,
  lineNumberMarkers,
} from "@codemirror/view";
import { Language } from "../types";
import { t } from "../i18n";
import {
  InlineDiffHunk,
  deletedRestoreText,
  hunkAnchorLine,
  hunkLineRange,
} from "./inlineDiff";

const setInlineDiffEffect = StateEffect.define<readonly InlineDiffHunk[]>();
const setExpandedHunksEffect = StateEffect.define<ReadonlySet<string>>();

const inlineDiffLanguage = Facet.define<Language, Language>({
  combine: (values) => values[0] ?? "es",
});

const inlineDiffField = StateField.define<readonly InlineDiffHunk[]>({
  create: () => [],
  update(hunks, transaction) {
    let next = hunks;
    for (const effect of transaction.effects) {
      if (effect.is(setInlineDiffEffect)) next = effect.value;
    }
    if (transaction.docChanged && next.length > 0) {
      next = next.map((hunk) => {
        const from = transaction.changes.mapPos(hunk.from, 1);
        const to = Math.max(from, transaction.changes.mapPos(hunk.to, -1));
        return { ...hunk, from, to };
      });
    }
    return next;
  },
});

const expandedHunksField = StateField.define<ReadonlySet<string>>({
  create: () => new Set<string>(),
  update(value, transaction) {
    let next = value;
    for (const effect of transaction.effects) {
      if (effect.is(setExpandedHunksEffect)) next = effect.value;
    }
    return next;
  },
});

interface InlineDiffViewOptions {
  parent: HTMLElement;
  getView: () => EditorView | null;
  getLanguage: () => Language;
}

function hunkKey(hunk: InlineDiffHunk): string {
  return `${hunk.kind}:${hunk.originalFrom}:${hunk.originalTo}`;
}

function textLines(text: string): string[] {
  const lines = text.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function hunkSummary(lang: Language, hunk: InlineDiffHunk): string {
  if (hunk.kind === "added") {
    return hunk.addedLines === 1
      ? t(lang, "gitDiffAddedLine")
      : t(lang, "gitDiffAddedLines", { count: String(hunk.addedLines) });
  }
  if (hunk.kind === "deleted") {
    return hunk.deletedLines === 1
      ? t(lang, "gitDiffDeletedLine")
      : t(lang, "gitDiffDeletedLines", {
          count: String(hunk.deletedLines),
        });
  }
  const count = Math.max(hunk.addedLines, hunk.deletedLines);
  return count === 1
    ? t(lang, "gitDiffModifiedLine")
    : t(lang, "gitDiffModifiedLines", { count: String(count) });
}

function hunkLineLabel(
  lang: Language,
  hunk: InlineDiffHunk,
  view: EditorView,
): string {
  if (hunk.kind === "deleted") {
    return t(lang, "gitDiffBeforeLine", {
      line: String(hunkAnchorLine(hunk, view.state.doc)),
    });
  }
  const range = hunkLineRange(hunk, view.state.doc);
  return range.fromLine === range.toLine
    ? t(lang, "gitDiffLine", { line: String(range.fromLine) })
    : t(lang, "gitDiffLines", {
        from: String(range.fromLine),
        to: String(range.toLine),
      });
}

class HunkWidget extends WidgetType {
  constructor(
    private readonly key: string,
    private readonly text: string,
    private readonly from: number,
    private readonly showRestore: boolean,
    private readonly labels: {
      restore: string;
      previous: string;
      next: string;
      collapse: string;
    },
    private readonly onRestore: (view: EditorView) => void,
    private readonly onNavigate: (view: EditorView, direction: 1 | -1) => void,
    private readonly onCollapse: (view: EditorView) => void,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof HunkWidget &&
      other.key === this.key &&
      other.text === this.text &&
      other.from === this.from &&
      other.showRestore === this.showRestore
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const block = document.createElement("div");
    block.className = "cm-git-deleted-ghost";
    block.addEventListener("mousedown", (event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("button")) return;
      event.preventDefault();
    });

    for (const line of textLines(this.text)) {
      const row = document.createElement("div");
      row.className = "cm-git-deleted-ghost-line";
      row.textContent = line || "\u00a0";
      block.appendChild(row);
    }

    const actions = document.createElement("div");
    actions.className = "cm-git-hunk-actions";

    const previous = this.actionButton("↑", this.labels.previous);
    previous.addEventListener("click", () => this.onNavigate(view, -1));
    const next = this.actionButton("↓", this.labels.next);
    next.addEventListener("click", () => this.onNavigate(view, 1));
    actions.append(previous, next);

    if (this.showRestore) {
      const restore = document.createElement("button");
      restore.type = "button";
      restore.className = "cm-git-hunk-action cm-git-hunk-restore";
      restore.textContent = this.labels.restore;
      restore.addEventListener("click", () => this.onRestore(view));
      actions.appendChild(restore);
    }

    const collapse = this.actionButton("×", this.labels.collapse);
    collapse.classList.add("cm-git-hunk-collapse");
    collapse.addEventListener("click", () => this.onCollapse(view));
    actions.appendChild(collapse);

    block.appendChild(actions);
    return block;
  }

  private actionButton(label: string, title: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cm-git-hunk-action";
    button.textContent = label;
    button.title = title;
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    return button;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class LineNumberClassMarker extends GutterMarker {
  elementClass: string;

  constructor(elementClass: string) {
    super();
    this.elementClass = elementClass;
  }

  eq(other: GutterMarker): boolean {
    return (
      other instanceof LineNumberClassMarker &&
      other.elementClass === this.elementClass
    );
  }
}

function expandedHunks(state: EditorState): ReadonlySet<string> {
  return state.field(expandedHunksField, false) ?? new Set<string>();
}

function buildLineNumberMarkers(state: EditorState): RangeSet<GutterMarker> {
  const hunks = state.field(inlineDiffField, false) ?? [];
  if (hunks.length === 0) return RangeSet.empty;
  const expanded = expandedHunks(state);
  const builder = new RangeSetBuilder<GutterMarker>();
  const seen = new Set<number>();
  for (const hunk of hunks) {
    if (hunk.kind === "deleted") continue;
    if (!expanded.has(hunkKey(hunk))) continue;
    const range = hunkLineRange(hunk, state.doc);
    for (let number = range.fromLine; number <= range.toLine; number += 1) {
      const line = state.doc.line(number);
      if (seen.has(line.from)) continue;
      seen.add(line.from);
      builder.add(
        line.from,
        line.from,
        new LineNumberClassMarker("cm-git-line-number-expanded"),
      );
    }
  }
  return builder.finish();
}

class GitLineMarker extends GutterMarker {
  constructor(
    private readonly kind: InlineDiffHunk["kind"],
    private readonly title: string,
    private readonly atStart: boolean,
    private readonly atEnd: boolean,
    private readonly restoreTitle: string,
  ) {
    super();
  }

  eq(other: GutterMarker): boolean {
    return (
      other instanceof GitLineMarker &&
      other.kind === this.kind &&
      other.title === this.title &&
      other.atStart === this.atStart &&
      other.atEnd === this.atEnd
    );
  }

  toDOM(): Node {
    const marker = document.createElement("span");
    marker.className = `cm-git-marker cm-git-marker-${this.kind}`;
    marker.title = this.title;

    if (this.kind === "deleted") {
      marker.classList.add(
        this.atStart ? "at-start" : this.atEnd ? "at-end" : "between",
      );
      const triangle = document.createElement("span");
      triangle.className = "cm-git-triangle";
      marker.appendChild(triangle);

      const restore = document.createElement("span");
      restore.className = "cm-git-restore";
      restore.textContent = "↺";
      restore.title = this.restoreTitle;
      marker.appendChild(restore);
      return marker;
    }

    const bar = document.createElement("span");
    bar.className = "cm-git-bar";
    marker.appendChild(bar);
    return marker;
  }
}

class GutterSpacer extends GutterMarker {
  toDOM(): Node {
    const spacer = document.createElement("span");
    spacer.className = "cm-git-gutter-spacer";
    return spacer;
  }
}

function currentHunk(view: EditorView, key: string): InlineDiffHunk | null {
  return (
    (view.state.field(inlineDiffField, false) ?? []).find(
      (hunk) => hunkKey(hunk) === key,
    ) ?? null
  );
}

function restoreHunk(view: EditorView, hunk: InlineDiffHunk): void {
  if (!hunk.originalText) return;
  if (hunk.kind === "deleted") {
    const current = view.state.doc.toString();
    const insert = deletedRestoreText(current, hunk.from, hunk.originalText);
    if (!insert) return;
    view.dispatch({
      changes: { from: hunk.from, insert },
      selection: { anchor: hunk.from + insert.length },
    });
    return;
  }
  if (hunk.kind === "modified") {
    view.dispatch({
      changes: { from: hunk.from, to: hunk.to, insert: hunk.originalText },
      selection: { anchor: hunk.from + hunk.originalText.length },
    });
  }
}

/**
 * Renders the Zed-style inline diff: collapsed gutter markers and per-hunk
 * inline expansion on click, plus navigation and the overview ruler.
 */
export class InlineDiffView {
  private readonly ruler: HTMLElement;
  private readonly nav: HTMLElement;
  private readonly prevButton: HTMLButtonElement;
  private readonly nextButton: HTMLButtonElement;

  constructor(private readonly options: InlineDiffViewOptions) {
    this.ruler = document.createElement("div");
    this.ruler.className = "git-diff-ruler";

    this.nav = document.createElement("div");
    this.nav.className = "git-diff-nav";
    this.prevButton = document.createElement("button");
    this.prevButton.type = "button";
    this.prevButton.className = "git-diff-nav-button";
    this.prevButton.textContent = "↑";
    this.prevButton.title = t(this.options.getLanguage(), "gitDiffPreviousChange");
    this.prevButton.addEventListener("click", () => this.navigate(-1));
    this.nextButton = document.createElement("button");
    this.nextButton.type = "button";
    this.nextButton.className = "git-diff-nav-button";
    this.nextButton.textContent = "↓";
    this.nextButton.title = t(this.options.getLanguage(), "gitDiffNextChange");
    this.nextButton.addEventListener("click", () => this.navigate(1));
    this.nav.append(this.prevButton, this.nextButton);

    this.options.parent.append(this.ruler, this.nav);
  }

  private buildHunkDecorations(state: EditorState): DecorationSet {
    const hunks = state.field(inlineDiffField, false) ?? [];
    if (hunks.length === 0) return Decoration.none;
    const expanded = expandedHunks(state);
    if (expanded.size === 0) return Decoration.none;

    const builder = new RangeSetBuilder<Decoration>();
    const seen = new Set<number>();
    const lang = this.options.getLanguage();
    const labels = {
      restore: t(lang, "gitDiffRestore"),
      previous: t(lang, "gitDiffPreviousChange"),
      next: t(lang, "gitDiffNextChange"),
      collapse: t(lang, "gitDiffCollapse"),
    };

    for (const hunk of hunks) {
      const key = hunkKey(hunk);
      if (!expanded.has(key)) continue;

      if (hunk.kind === "deleted" || hunk.kind === "modified") {
        const atDocumentEnd =
          hunk.from >= state.doc.length &&
          state.doc.length > 0 &&
          state.doc.sliceString(state.doc.length - 1) !== "\n";
        const line = state.doc.lineAt(
          Math.min(hunk.from, state.doc.length),
        );
        const position = atDocumentEnd ? line.to : line.from;
        builder.add(
          position,
          position,
          Decoration.widget({
            widget: new HunkWidget(
              key,
              hunk.originalText,
              hunk.from,
              true,
              labels,
              (view) => {
                const current = currentHunk(view, key);
                if (current) restoreHunk(view, current);
              },
              (_view, direction) => this.navigate(direction),
              (view) => {
                const next = new Set(expandedHunks(view.state));
                next.delete(key);
                view.dispatch({
                  effects: setExpandedHunksEffect.of(next),
                });
              },
            ),
            block: true,
            side: atDocumentEnd ? 1 : -1,
          }),
        );
      }

      if (hunk.kind === "deleted") continue;
      const range = hunkLineRange(hunk, state.doc);
      for (let number = range.fromLine; number <= range.toLine; number += 1) {
        const line = state.doc.line(number);
        if (seen.has(line.from)) continue;
        seen.add(line.from);
        builder.add(
          line.from,
          line.from,
          Decoration.line({ class: "cm-git-line-expanded" }),
        );
      }
    }
    return builder.finish();
  }

  public extension(): Extension {
    return [
      inlineDiffField,
      expandedHunksField,
      inlineDiffLanguage.of(this.options.getLanguage()),
      EditorView.decorations.compute(
        [inlineDiffField, expandedHunksField, inlineDiffLanguage],
        (state) => this.buildHunkDecorations(state),
      ),
      lineNumberMarkers.compute(
        [inlineDiffField, expandedHunksField],
        (state) => buildLineNumberMarkers(state),
      ),
      keymap.of([
        {
          key: "Escape",
          run: (view) => {
            if (expandedHunks(view.state).size === 0) return false;
            view.dispatch({
              effects: setExpandedHunksEffect.of(new Set<string>()),
            });
            return true;
          },
        },
      ]),
      gutter({
        class: "cm-git-diff-gutter",
        initialSpacer: () => new GutterSpacer(),
        markers: (view) => this.buildGutterMarkers(view),
        lineMarkerChange: (update) =>
          update.docChanged ||
          update.startState.field(inlineDiffField) !==
            update.state.field(inlineDiffField),
        domEventHandlers: {
          mousedown: (_view, _line, event) => {
            const target = event.target as HTMLElement | null;
            if (!target?.closest(".cm-git-marker")) return false;
            event.preventDefault();
            return true;
          },
          click: (view, line, event) =>
            this.handleGutterClick(view, line.from, event as MouseEvent),
        },
      }),
    ];
  }

  public setHunks(hunks: readonly InlineDiffHunk[]): void {
    const view = this.options.getView();
    if (!view) return;
    const keys = new Set(hunks.map(hunkKey));
    const current = expandedHunks(view.state);
    const next = new Set([...current].filter((key) => keys.has(key)));
    view.dispatch({
      effects: [
        setInlineDiffEffect.of(hunks),
        setExpandedHunksEffect.of(next),
      ],
    });
    this.rebuildRuler();
  }

  public clear(): void {
    this.setHunks([]);
  }

  public rebuildRuler(): void {
    const view = this.options.getView();
    const hunks = view?.state.field(inlineDiffField, false) ?? [];
    const lang = this.options.getLanguage();
    this.ruler.replaceChildren();
    this.ruler.classList.toggle("visible", hunks.length > 0);
    this.nav.classList.toggle("visible", hunks.length > 0);
    this.prevButton.title = t(lang, "gitDiffPreviousChange");
    this.nextButton.title = t(lang, "gitDiffNextChange");
    if (!view || hunks.length === 0) return;
    const total = Math.max(1, view.state.doc.lines);

    for (const hunk of hunks) {
      const range = hunkLineRange(hunk, view.state.doc);
      const top = ((range.fromLine - 1) / total) * 100;
      const height = Math.max(
        0.35,
        ((range.toLine - range.fromLine + 1) / total) * 100,
      );
      const tick = document.createElement("button");
      tick.type = "button";
      tick.className = `git-diff-ruler-tick git-diff-ruler-${hunk.kind}`;
      tick.style.top = `${top}%`;
      tick.style.height = `${height}%`;
      tick.title = `${hunkSummary(lang, hunk)} · ${hunkLineLabel(
        lang,
        hunk,
        view,
      )}`;
      tick.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.revealHunk(hunk);
      });
      this.ruler.appendChild(tick);
    }
  }

  private navigate(direction: 1 | -1): void {
    const view = this.options.getView();
    if (!view) return;
    const hunks = view.state.field(inlineDiffField, false) ?? [];
    if (hunks.length === 0) return;
    const doc = view.state.doc;
    const entries = hunks
      .map((hunk) => ({
        hunk,
        line:
          hunk.kind === "deleted"
            ? hunkAnchorLine(hunk, doc)
            : hunkLineRange(hunk, doc).fromLine,
      }))
      .sort((a, b) => a.line - b.line);
    const cursor = doc.lineAt(view.state.selection.main.head).number;
    let target: { hunk: InlineDiffHunk; line: number } | undefined;
    if (direction > 0) {
      target = entries.find((entry) => entry.line > cursor) ?? entries[0];
    } else {
      target =
        [...entries].reverse().find((entry) => entry.line < cursor) ??
        entries[entries.length - 1];
    }
    if (target) this.revealHunk(target.hunk);
  }

  private revealHunk(hunk: InlineDiffHunk): void {
    const view = this.options.getView();
    if (!view) return;
    const doc = view.state.doc;
    const lineNumber =
      hunk.kind === "deleted"
        ? hunkAnchorLine(hunk, doc)
        : hunkLineRange(hunk, doc).fromLine;
    const line = doc.line(Math.min(Math.max(1, lineNumber), doc.lines));
    const next = new Set(expandedHunks(view.state));
    next.add(hunkKey(hunk));
    view.dispatch({
      selection: { anchor: line.from },
      effects: [
        EditorView.scrollIntoView(line.from, { y: "center" }),
        setExpandedHunksEffect.of(next),
      ],
    });
    view.focus();
  }

  private buildGutterMarkers(view: EditorView) {
    const hunks = view.state.field(inlineDiffField, false) ?? [];
    const builder = new RangeSetBuilder<GutterMarker>();
    if (hunks.length === 0) return builder.finish();

    const lang = this.options.getLanguage();
    const doc = view.state.doc;
    const markers: Array<{
      line: number;
      kind: InlineDiffHunk["kind"];
      title: string;
      atStart: boolean;
      atEnd: boolean;
      restoreTitle: string;
    }> = [];
    const seen = new Set<number>();

    for (const hunk of hunks) {
      const title = hunkSummary(lang, hunk);
      if (hunk.kind === "deleted") {
        const line = hunkAnchorLine(hunk, doc);
        if (seen.has(line)) continue;
        seen.add(line);
        markers.push({
          line,
          kind: hunk.kind,
          title,
          atStart: hunk.from === 0,
          atEnd: hunk.from >= doc.length,
          restoreTitle: t(lang, "gitDiffRestoreDeleted"),
        });
        continue;
      }

      const range = hunkLineRange(hunk, doc);
      for (let number = range.fromLine; number <= range.toLine; number += 1) {
        if (seen.has(number)) continue;
        seen.add(number);
        markers.push({
          line: number,
          kind: hunk.kind,
          title,
          atStart: false,
          atEnd: false,
          restoreTitle: "",
        });
      }
    }

    markers.sort((a, b) => a.line - b.line);
    for (const info of markers) {
      const line = doc.line(Math.min(Math.max(1, info.line), doc.lines));
      builder.add(
        line.from,
        line.from,
        new GitLineMarker(
          info.kind,
          info.title,
          info.atStart,
          info.atEnd,
          info.restoreTitle,
        ),
      );
    }
    return builder.finish();
  }

  private findHunkAtLine(
    view: EditorView,
    lineFrom: number,
  ): InlineDiffHunk | null {
    const line = view.state.doc.lineAt(lineFrom).number;
    for (const hunk of view.state.field(inlineDiffField, false) ?? []) {
      if (hunk.kind === "deleted") {
        if (hunkAnchorLine(hunk, view.state.doc) === line) return hunk;
        continue;
      }
      const range = hunkLineRange(hunk, view.state.doc);
      if (line >= range.fromLine && line <= range.toLine) return hunk;
    }
    return null;
  }

  private handleGutterClick(
    view: EditorView,
    lineFrom: number,
    event: MouseEvent,
  ): boolean {
    const target = event.target as HTMLElement | null;
    if (!target?.closest(".cm-git-marker")) return false;
    const hunk = this.findHunkAtLine(view, lineFrom);
    if (!hunk) return false;
    event.preventDefault();

    if (target.closest(".cm-git-restore")) {
      const current = currentHunk(view, hunkKey(hunk));
      if (current) restoreHunk(view, current);
      return true;
    }

    const next = new Set(expandedHunks(view.state));
    const key = hunkKey(hunk);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    view.dispatch({ effects: setExpandedHunksEffect.of(next) });
    view.requestMeasure();
    return true;
  }

  public destroy(): void {
    this.ruler.remove();
    this.nav.remove();
  }
}
