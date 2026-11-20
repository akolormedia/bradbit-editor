import { Extension, RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  GutterMarker,
  ViewPlugin,
  ViewUpdate,
  gutter,
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

interface InlineDiffViewOptions {
  parent: HTMLElement;
  getView: () => EditorView | null;
  getLanguage: () => Language;
  onOpenDiff?: () => void;
}

function buildLineDecorations(view: EditorView): DecorationSet {
  const hunks = view.state.field(inlineDiffField, false) ?? [];
  if (hunks.length === 0) return Decoration.none;
  const builder = new RangeSetBuilder<Decoration>();
  const seen = new Set<number>();
  for (const hunk of hunks) {
    if (hunk.kind === "deleted") continue;
    const range = hunkLineRange(hunk, view.state.doc);
    for (let number = range.fromLine; number <= range.toLine; number += 1) {
      const line = view.state.doc.line(number);
      if (seen.has(line.from)) continue;
      seen.add(line.from);
      builder.add(
        line.from,
        line.from,
        Decoration.line({ class: `cm-git-line-${hunk.kind}` }),
      );
    }
  }
  return builder.finish();
}

const inlineDiffDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildLineDecorations(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.startState.field(inlineDiffField) !==
          update.state.field(inlineDiffField)
      ) {
        this.decorations = buildLineDecorations(update.view);
      }
    }
  },
  {
    decorations: (value) => value.decorations,
  },
);

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
    : t(lang, "gitDiffModifiedLines", {
        count: String(count),
      });
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

function previewLines(text: string): string[] {
  const lines = text.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * Renders the Zed-style inline diff: gutter bars, hunk popovers, deletion
 * restore buttons and the change ruler on the right edge of the editor.
 */
export class InlineDiffView {
  private readonly ruler: HTMLElement;
  private popover: HTMLElement | null = null;
  private removeOutsideListener: (() => void) | null = null;

  constructor(private readonly options: InlineDiffViewOptions) {
    this.ruler = document.createElement("div");
    this.ruler.className = "git-diff-ruler";
    this.options.parent.appendChild(this.ruler);
  }

  public extension(): Extension {
    return [
      inlineDiffField,
      inlineDiffDecorations,
      gutter({
        class: "cm-git-diff-gutter",
        initialSpacer: () => new GutterSpacer(),
        markers: (view) => this.buildGutterMarkers(view),
        lineMarkerChange: (update) =>
          update.docChanged ||
          update.startState.field(inlineDiffField) !==
            update.state.field(inlineDiffField),
        domEventHandlers: {
          mousedown: (view, line, event) =>
            this.handleGutterMouseDown(view, line.from, event as MouseEvent),
        },
      }),
    ];
  }

  public setHunks(hunks: readonly InlineDiffHunk[]): void {
    const view = this.options.getView();
    if (!view) return;
    view.dispatch({ effects: setInlineDiffEffect.of(hunks) });
    this.rebuildRuler();
  }

  public clear(): void {
    this.setHunks([]);
  }

  public rebuildRuler(): void {
    const view = this.options.getView();
    const hunks = view?.state.field(inlineDiffField, false) ?? [];
    this.ruler.replaceChildren();
    this.ruler.classList.toggle("visible", hunks.length > 0);
    if (!view || hunks.length === 0) return;
    const lang = this.options.getLanguage();
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
        const line = view.state.doc.line(
          Math.min(Math.max(1, range.fromLine), view.state.doc.lines),
        );
        view.dispatch({
          selection: { anchor: line.from },
          effects: EditorView.scrollIntoView(line.from, { y: "center" }),
        });
        view.focus();
      });
      this.ruler.appendChild(tick);
    }
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

  private handleGutterMouseDown(
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
      this.restoreDeleted(view, hunk);
      return true;
    }
    const anchor = target.closest<HTMLElement>(".cm-git-marker");
    if (anchor) this.showPopover(view, hunk, anchor);
    return true;
  }

  private restoreDeleted(view: EditorView, hunk: InlineDiffHunk): void {
    if (hunk.kind !== "deleted" || !hunk.originalText) return;
    const current = view.state.doc.toString();
    const insert = deletedRestoreText(current, hunk.from, hunk.originalText);
    if (!insert) return;
    view.dispatch({
      changes: { from: hunk.from, insert },
      selection: { anchor: hunk.from + insert.length },
    });
    view.focus();
    this.closePopover();
  }

  private showPopover(
    view: EditorView,
    hunk: InlineDiffHunk,
    anchor: HTMLElement,
  ): void {
    this.closePopover();
    const lang = this.options.getLanguage();
    const popover = document.createElement("div");
    popover.className = "cm-git-popover";

    const header = document.createElement("div");
    header.className = "cm-git-popover-header";
    const summary = document.createElement("strong");
    summary.textContent = hunkSummary(lang, hunk);
    const location = document.createElement("span");
    location.textContent = hunkLineLabel(lang, hunk, view);
    header.append(summary, location);

    const preview = document.createElement("div");
    preview.className = "cm-git-popover-preview";
    if (hunk.kind !== "added" && hunk.originalText) {
      this.appendPreview(preview, hunk.originalText, "removed");
    }
    if (hunk.kind !== "deleted") {
      this.appendPreview(
        preview,
        view.state.doc.sliceString(hunk.from, hunk.to),
        hunk.kind === "modified" ? "replacement" : "added",
      );
    }

    const actions = document.createElement("div");
    actions.className = "cm-git-popover-actions";
    if (hunk.kind === "deleted") {
      const restore = document.createElement("button");
      restore.type = "button";
      restore.className = "cm-git-popover-action";
      restore.textContent = t(lang, "gitDiffRestore");
      restore.addEventListener("click", () => this.restoreDeleted(view, hunk));
      actions.appendChild(restore);
    }
    if (this.options.onOpenDiff) {
      const openDiff = document.createElement("button");
      openDiff.type = "button";
      openDiff.className = "cm-git-popover-action secondary";
      openDiff.textContent = t(lang, "gitDiffOpen");
      openDiff.addEventListener("click", () => {
        this.closePopover();
        this.options.onOpenDiff?.();
      });
      actions.appendChild(openDiff);
    }

    popover.append(header, preview);
    if (actions.childElementCount > 0) popover.appendChild(actions);
    document.body.appendChild(popover);
    this.popover = popover;

    const rect = anchor.getBoundingClientRect();
    const width = popover.offsetWidth || 300;
    const height = popover.offsetHeight || 160;
    popover.style.left = `${Math.min(
      Math.max(8, rect.right + 10),
      window.innerWidth - width - 8,
    )}px`;
    popover.style.top = `${Math.min(
      Math.max(8, rect.top - 6),
      window.innerHeight - height - 8,
    )}px`;

    const onOutside = (event: MouseEvent) => {
      if (this.popover && !this.popover.contains(event.target as Node)) {
        this.closePopover();
      }
    };
    document.addEventListener("mousedown", onOutside, true);
    this.removeOutsideListener = () =>
      document.removeEventListener("mousedown", onOutside, true);
  }

  private appendPreview(
    parent: HTMLElement,
    text: string,
    kind: "added" | "removed" | "replacement",
  ): void {
    const lines = previewLines(text);
    const limit = 8;
    for (const line of lines.slice(0, limit)) {
      const row = document.createElement("div");
      row.className = `cm-git-preview-line cm-git-preview-${kind}`;
      const prefix = kind === "removed" ? "−" : "+";
      row.textContent = `${prefix} ${line}`;
      parent.appendChild(row);
    }
    if (lines.length > limit) {
      const more = document.createElement("div");
      more.className = "cm-git-preview-more";
      more.textContent = t(this.options.getLanguage(), "gitDiffMoreLines", {
        count: String(lines.length - limit),
      });
      parent.appendChild(more);
    }
  }

  public closePopover(): void {
    this.removeOutsideListener?.();
    this.removeOutsideListener = null;
    this.popover?.remove();
    this.popover = null;
  }

  public destroy(): void {
    this.closePopover();
    this.ruler.remove();
  }
}
