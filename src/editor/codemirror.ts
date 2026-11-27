import { startCompletion } from "@codemirror/autocomplete";
import {
  Compartment,
  EditorState,
  Extension,
  RangeSetBuilder,
  Transaction,
} from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  hoverTooltip,
  keymap,
  lineNumbers as cmLineNumbers,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab, redo as cmRedo, undo as cmUndo } from "@codemirror/commands";
import {
  findNext,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  search,
  SearchQuery,
  setSearchQuery,
} from "@codemirror/search";
import {
  buildEditorSearchQuery,
  EditorSearchQuery,
  searchMatchInfo,
} from "./searchQuery";
import { searchHighlightExtension } from "./searchHighlight";
import { markdown } from "@codemirror/lang-markdown";
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { AppSettings, GitBlameLine, LineDiffHunk } from "../types";
import { isFountainPath, isMarkdownPath } from "../workspace/state";
import {
  classifyFountainLine,
  createFountainState,
  fountainLineClass,
  fountainSceneNumbers,
} from "./fountain";
import {
  fountainCompletionExtension,
  setFountainCompletionIntent,
} from "./fountainCompletion";
import {
  FOUNTAIN_COMMANDS,
  FountainCommand,
} from "./fountainCommands";
import {
  EMPTY_FOUNTAIN_SYMBOLS,
  FountainSymbols,
} from "./fountainSymbols";
import {
  buildInlineDiffHunks,
  buildInlineDiffHunksFromLines,
} from "./inlineDiff";
import { InlineBlameView } from "./inlineBlame";
import { InlineDiffView } from "./inlineDiffView";
import { computeWrapEdit } from "./markdownFormat";

/**
 * Fountain 1.1 highlighter. A stream parser is not enough here: CodeMirror
 * never calls the tokenizer for empty lines, so Fountain's blank-line state
 * never resets and later character cues are misclassified as dialogue. This
 * line decoration classifies the whole document, including blank lines.
 */
function buildFountainDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  let state = createFountainState();
  for (let index = 1; index <= view.state.doc.lines; index += 1) {
    const line = view.state.doc.line(index);
    const classified = classifyFountainLine(line.text, state);
    state = classified.state;
    if (classified.type === "blank") continue;
    builder.add(
      line.from,
      line.from,
      Decoration.line({
        class: fountainLineClass(classified.type),
      }),
    );
  }
  return builder.finish();
}

const fountainHighlighting = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildFountainDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildFountainDecorations(update.view);
      }
    }
  },
  {
    decorations: (value) => value.decorations,
  },
);

const sceneHoverTooltip = hoverTooltip(
  (view, pos) => {
    const line = view.state.doc.lineAt(pos);
    const scene = fountainSceneNumbers(view.state.doc.toString()).find(
      (candidate) => candidate.line === line.number,
    );
    if (!scene) return null;
    return {
      pos: line.from,
      end: line.to,
      above: true,
      create: () => {
        const dom = document.createElement("div");
        dom.className = "cm-scene-hover";
        dom.textContent = `${scene.number}.`;
        return { dom };
      },
    };
  },
  { hoverTime: 250 },
);

const writerHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, fontWeight: "700", color: "var(--cm-heading)" },
  { tag: tags.strong, fontWeight: "700", color: "var(--cm-keyword)" },
  { tag: tags.emphasis, fontStyle: "italic", color: "var(--cm-character)" },
  { tag: tags.keyword, color: "var(--cm-keyword)", fontWeight: "600" },
  {
    tag: tags.special(tags.variableName),
    color: "var(--cm-character)",
    fontWeight: "700",
  },
  { tag: tags.string, color: "var(--cm-dialogue)" },
  { tag: tags.meta, color: "var(--cm-parenthetical)", fontStyle: "italic" },
  { tag: tags.comment, color: "var(--text-muted)", fontStyle: "italic" },
  {
    tag: tags.link,
    color: "var(--accent)",
    textDecoration: "underline",
  },
  { tag: tags.url, color: "var(--accent)" },
  {
    tag: tags.monospace,
    fontFamily: "var(--font-mono)",
    color: "var(--text-primary)",
    backgroundColor: "var(--bg-surface)",
  },
  {
    tag: tags.quote,
    color: "var(--cm-parenthetical)",
    fontStyle: "italic",
  },
  { tag: tags.list, color: "var(--cm-keyword)" },
  {
    tag: tags.processingInstruction,
    color: "var(--text-muted)",
  },
  { tag: tags.contentSeparator, color: "var(--text-muted)" },
]);

function languageExtensionForPath(path: string): Extension {
  const lower = path.toLowerCase();
  if (lower.endsWith(".fountain") || lower.endsWith(".spmd")) {
    return [fountainHighlighting, sceneHoverTooltip];
  }
  if (lower.endsWith(".md") || lower.endsWith(".mdx") || lower.endsWith(".markdown")) {
    return markdown();
  }
  return [];
}

function buildAppearanceExtension(settings: AppSettings): Extension {
  const isFountain = false;
  return EditorView.theme({
    "&": {
      fontSize: `${settings.fontSize}px`,
      height: "100%",
      backgroundColor: "var(--bg-editor)",
      color: "var(--text-primary)",
    },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily: isFountain ? "var(--font-mono)" : "var(--font-editor)",
      lineHeight: "1.68",
    },
    ".cm-content": {
      margin: "0",
      padding: "24px 32px 96px 18px",
      minHeight: "100%",
      boxSizing: "border-box",
      caretColor: "var(--accent)",
    },
    ".cm-focused": {
      outline: "none",
    },
    ".cm-line": {
      padding: "0 2px",
    },
    ".cm-activeLine": {
      backgroundColor: "var(--bg-active-line)",
    },
    ".cm-selectionBackground, ::selection": {
      backgroundColor: "var(--bg-selection) !important",
    },
    ".cm-gutters": {
      backgroundColor: "var(--bg-editor)",
      color: "var(--text-muted)",
      border: "none",
      paddingRight: "8px",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: "var(--text-primary)",
    },
    ".cm-panels": {
      backgroundColor: "var(--bg-surface)",
      color: "var(--text-primary)",
      borderBottom: "1px solid var(--border-color)",
    },
    ".cm-search": {
      padding: "8px 14px",
      display: "flex",
      flexWrap: "wrap",
      gap: "6px",
      alignItems: "center",
      fontFamily: "var(--font-ui)",
      fontSize: "13px",
    },
    ".cm-textfield": {
      backgroundColor: "var(--bg-input)",
      color: "var(--text-primary)",
      border: "1px solid var(--border-color)",
      borderRadius: "5px",
      padding: "4px 8px",
    },
    ".cm-button": {
      backgroundImage: "none",
      backgroundColor: "var(--bg-elevated)",
      color: "var(--text-primary)",
      border: "1px solid var(--border-color)",
      borderRadius: "5px",
      padding: "3px 9px",
      cursor: "pointer",
    },
  });
}

export interface EditorCallbacks {
  onContentChange: (path: string, content: string) => void;
  onCursorChange: (path: string, line: number, col: number) => void;
  onSaveShortcut: () => void;
  computeDiffHunks?: (
    original: string,
    current: string,
  ) => Promise<LineDiffHunk[] | null>;
  getFountainBibleSymbols?: () => FountainSymbols;
}

export class BradbitCodeMirror {
  private view: EditorView | null = null;
  private currentPath: string | null = null;
  private statesByPath = new Map<string, EditorState>();
  private scrollPositions = new Map<string, { top: number; left: number }>();
  private gitOriginals = new Map<string, string | null>();
  private inlineDiffTimer: number | null = null;
  private inlineDiffRequest = 0;
  private inlineDiff: InlineDiffView;
  private inlineBlame: InlineBlameView;
  private settings: AppSettings;

  private wrapCompartment = new Compartment();
  private lineNumbersCompartment = new Compartment();
  private appearanceCompartment = new Compartment();
  private languageCompartment = new Compartment();
  private completionCompartment = new Compartment();
  private readOnlyCompartment = new Compartment();
  private livePreviewPath: string | null = null;
  private livePreviewUpdating = false;

  constructor(
    private parent: HTMLElement,
    initialSettings: AppSettings,
    private callbacks: EditorCallbacks,
  ) {
    this.settings = initialSettings;
    this.inlineDiff = new InlineDiffView({
      parent: this.parent,
      getView: () => this.view,
      getLanguage: () => this.settings.language,
    });
    this.inlineBlame = new InlineBlameView(
      () => this.settings.language,
      () => this.view,
    );
  }

  public openDocument(path: string, content: string, settings: AppSettings): void {
    this.settings = settings;
    const switched = this.currentPath !== path;
    if (this.view && this.currentPath) {
      this.statesByPath.set(this.currentPath, this.view.state);
      this.scrollPositions.set(this.currentPath, {
        top: this.view.scrollDOM.scrollTop,
        left: this.view.scrollDOM.scrollLeft,
      });
    }
    this.currentPath = path;

    let state = this.statesByPath.get(path);
    if (!state || state.doc.toString() !== content) {
      state = this.createState(path, content, settings);
      this.statesByPath.set(path, state);
    }

    if (!this.view) {
      this.view = new EditorView({
        state,
        parent: this.parent,
      });
      this.installClickGuard(this.view);
    } else {
      this.view.setState(state);
      this.applySettings(settings);
    }
    if (switched && this.view) {
      const target = this.scrollPositions.get(path) ?? { top: 0, left: 0 };
      const restore = () => {
        if (!this.view || this.currentPath !== path) return;
        this.view.scrollDOM.scrollTop = target.top;
        this.view.scrollDOM.scrollLeft = target.left;
      };
      restore();
      if (typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(restore);
      }
    }
    this.reportCursor(this.view.state);
    void this.refreshInlineDiff();
  }

  public openLivePreview(
    path: string,
    content: string,
    settings: AppSettings,
  ): void {
    this.livePreviewPath = path;
    this.openDocument(path, content, settings);
    this.applyReadOnly(true);
    this.scrollPreviewToEnd();
  }

  public isLivePreview(path: string): boolean {
    return this.livePreviewPath === path && this.currentPath === path;
  }

  public updateLivePreview(path: string, content: string): void {
    const view = this.view;
    if (!view || this.currentPath !== path || this.livePreviewPath !== path) {
      return;
    }
    const current = view.state.doc.toString();
    if (current === content) return;
    const changes = content.startsWith(current)
      ? { from: current.length, insert: content.slice(current.length) }
      : { from: 0, to: current.length, insert: content };
    this.livePreviewUpdating = true;
    view.dispatch({
      changes,
      annotations: Transaction.addToHistory.of(false),
    });
    this.livePreviewUpdating = false;
    this.scrollPreviewToEnd();
  }

  public finishLivePreview(
    path: string,
    content: string,
    settings: AppSettings,
  ): void {
    if (this.livePreviewPath === path) this.livePreviewPath = null;
    this.livePreviewUpdating = false;
    if (this.currentPath === path) {
      this.openDocument(path, content, settings);
      this.applyReadOnly(false);
    } else {
      this.statesByPath.delete(path);
    }
  }

  private applyReadOnly(enabled: boolean): void {
    this.view?.dispatch({
      effects: this.readOnlyCompartment.reconfigure(
        enabled
          ? [EditorState.readOnly.of(true), EditorView.editable.of(false)]
          : [],
      ),
    });
  }

  private scrollPreviewToEnd(): void {
    const scroll = () => {
      if (
        !this.view ||
        !this.livePreviewPath ||
        this.currentPath !== this.livePreviewPath
      ) {
        return;
      }
      this.view.scrollDOM.scrollTop = this.view.scrollDOM.scrollHeight;
    };
    scroll();
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(scroll);
    }
  }

  /** Baseline (HEAD) content used for the inline Git diff; `null` = new file. */
  public setGitOriginal(path: string, original: string | null | undefined): void {
    if (original === undefined) {
      this.gitOriginals.delete(path);
    } else {
      this.gitOriginals.set(path, original);
    }
    if (this.currentPath === path) void this.refreshInlineDiff();
  }

  public setInlineBlame(lines: readonly GitBlameLine[]): void {
    this.inlineBlame.setBlame(lines);
  }

  public setInlineBlameEnabled(enabled: boolean): void {
    this.inlineBlame.setEnabled(enabled);
  }

  public clearGitOriginals(): void {
    this.inlineDiffRequest += 1;
    this.gitOriginals.clear();
    this.inlineDiff.clear();
  }

  private async refreshInlineDiff(): Promise<void> {
    const view = this.view;
    const path = this.currentPath;
    if (!view || !path) return;
    if (this.inlineDiffTimer !== null) {
      window.clearTimeout(this.inlineDiffTimer);
      this.inlineDiffTimer = null;
    }
    const original = this.gitOriginals.get(path);
    if (original === undefined) {
      this.inlineDiffRequest += 1;
      this.inlineDiff.clear();
      return;
    }

    const current = view.state.doc.toString();
    const token = ++this.inlineDiffRequest;
    const baseline = original ?? "";
    const applyLocal = () => {
      if (
        token !== this.inlineDiffRequest ||
        this.currentPath !== path ||
        this.view !== view ||
        view.state.doc.toString() !== current
      ) {
        return;
      }
      this.inlineDiff.setHunks(buildInlineDiffHunks(baseline, current));
    };

    const compute = this.callbacks.computeDiffHunks;
    if (!compute) {
      applyLocal();
      return;
    }

    try {
      const lineHunks = await compute(baseline, current);
      if (
        token !== this.inlineDiffRequest ||
        this.currentPath !== path ||
        this.view !== view ||
        view.state.doc.toString() !== current
      ) {
        return;
      }
      if (lineHunks === null) {
        this.inlineDiff.setHunks(buildInlineDiffHunks(baseline, current));
        return;
      }
      this.inlineDiff.setHunks(
        buildInlineDiffHunksFromLines(baseline, current, lineHunks),
      );
    } catch (error) {
      console.error("Could not compute the inline diff", error);
      applyLocal();
    }
  }

  private scheduleInlineDiff(): void {
    this.inlineDiffRequest += 1;
    if (this.inlineDiffTimer !== null) {
      window.clearTimeout(this.inlineDiffTimer);
    }
    this.inlineDiffTimer = window.setTimeout(() => {
      this.inlineDiffTimer = null;
      void this.refreshInlineDiff();
    }, 240);
  }

  public closeDocumentState(path: string): void {
    this.statesByPath.delete(path);
    this.scrollPositions.delete(path);
    this.gitOriginals.delete(path);
    if (this.currentPath === path) {
      this.currentPath = null;
    }
  }

  public renameDocumentState(oldPath: string, newPath: string): void {
    const existing = this.statesByPath.get(oldPath);
    if (existing) {
      this.statesByPath.delete(oldPath);
      this.statesByPath.set(newPath, existing);
    }
    const scroll = this.scrollPositions.get(oldPath);
    if (scroll) {
      this.scrollPositions.delete(oldPath);
      this.scrollPositions.set(newPath, scroll);
    }
    if (this.gitOriginals.has(oldPath)) {
      const original = this.gitOriginals.get(oldPath) ?? null;
      this.gitOriginals.delete(oldPath);
      this.gitOriginals.set(newPath, original);
    }
    if (this.currentPath === oldPath) {
      this.currentPath = newPath;
    }
  }

  /**
   * Clicking the blank area below the last line can leave the native selection
   * anchored to a previous line. Put the caret at the nearest document
   * position and prevent the browser's multi-line selection. Expanded diff
   * ghost rows are not document text either, so they must never start a
   * native selection.
   *
   * After scrolling, the browser can also resolve a single click against a
   * stale line map and leave a range selected. A simple click (no drag and no
   * modifier) is collapsed to the pointer position on mouseup; drag, double
   * click and multi-cursor clicks keep their native behavior.
   */
  private clickPosition(view: EditorView, event: MouseEvent): number | null {
    const position = view.posAtCoords({
      x: event.clientX,
      y: event.clientY,
    });
    let lineElement: HTMLElement | null = null;
    for (const candidate of view.contentDOM.querySelectorAll<HTMLElement>(
      ".cm-line",
    )) {
      const rect = candidate.getBoundingClientRect();
      if (event.clientY >= rect.top && event.clientY <= rect.bottom) {
        lineElement = candidate;
        break;
      }
    }
    if (!lineElement) return position;
    const lineStart = view.posAtDOM(lineElement, 0);
    const line = view.state.doc.lineAt(lineStart);
    if (position === null || position < line.from || position > line.to) {
      return line.from;
    }
    return position;
  }

  private selectWithoutScrolling(view: EditorView, position: number): void {
    const top = view.scrollDOM.scrollTop;
    const left = view.scrollDOM.scrollLeft;
    view.dispatch({ selection: { anchor: position } });
    const restore = () => {
      if (!view.dom.isConnected) return;
      view.scrollDOM.scrollTop = top;
      view.scrollDOM.scrollLeft = left;
    };
    restore();
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(restore);
    }
  }

  private installClickGuard(view: EditorView): void {
    let pressed: {
      x: number;
      y: number;
      detail: number;
      fromContent: boolean;
    } | null = null;
    let moved = false;
    let recentClick: { position: number; until: number } | null = null;

    view.scrollDOM.addEventListener(
      "mousedown",
      (event) => {
        if (event.button !== 0) return;
        const target = event.target as HTMLElement | null;
        if (target?.closest(".cm-git-deleted-ghost")) {
          if (target.closest("button")) return;
          event.preventDefault();
          view.focus();
          return;
        }
        if (!target || !view.contentDOM.contains(target)) return;
        if (target.closest(".cm-gutter, button, a, .cm-inline-blame")) return;
        if (!view.hasFocus) {
          const top = view.scrollDOM.scrollTop;
          const left = view.scrollDOM.scrollLeft;
          view.contentDOM.focus({ preventScroll: true });
          view.scrollDOM.scrollTop = top;
          view.scrollDOM.scrollLeft = left;
        }
        pressed = {
          x: event.clientX,
          y: event.clientY,
          detail: event.detail,
          fromContent: true,
        };
        moved = false;
        if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) {
          recentClick = null;
          return;
        }
        if (target !== view.contentDOM) return;
        const position = this.clickPosition(view, event);
        if (position === null) return;
        event.preventDefault();
        this.selectWithoutScrolling(view, position);
        view.focus();
      },
      { capture: true },
    );

    view.scrollDOM.addEventListener(
      "mousemove",
      (event) => {
        if (!pressed) return;
        if (
          Math.abs(event.clientX - pressed.x) > 4 ||
          Math.abs(event.clientY - pressed.y) > 4
        ) {
          moved = true;
        }
      },
      { capture: true },
    );

    view.scrollDOM.addEventListener(
      "mouseup",
      (event) => {
        const start = pressed;
        pressed = null;
        if (
          !start ||
          !start.fromContent ||
          moved ||
          start.detail > 1 ||
          event.button !== 0 ||
          event.shiftKey ||
          event.metaKey ||
          event.ctrlKey ||
          event.altKey
        ) {
          return;
        }
        const position = this.clickPosition(view, event);
        if (position === null) return;
        recentClick = { position, until: performance.now() + 220 };
        const collapse = () => {
          if (!view.dom.isConnected) return;
          const selection = view.state.selection.main;
          if (selection.empty && selection.head === position) return;
          this.selectWithoutScrolling(view, position);
        };
        collapse();
        // WebKit can apply its native selection after mouseup; settle once
        // more on the next frames without affecting keyboard input later.
        window.setTimeout(collapse, 0);
        window.setTimeout(collapse, 20);
      },
      { capture: true },
    );

    // WebKit sometimes publishes a native range after our mouseup handlers.
    // While a simple click is settling, collapse any range that appears.
    document.addEventListener(
      "selectionchange",
      () => {
        if (!view.dom.isConnected || !recentClick) return;
        if (performance.now() > recentClick.until) {
          recentClick = null;
          return;
        }
        const selection = view.state.selection.main;
        if (!selection.empty || selection.head !== recentClick.position) {
          this.selectWithoutScrolling(view, recentClick.position);
        }
      },
      { capture: true },
    );

    view.contentDOM.addEventListener("keydown", () => {
      recentClick = null;
    });
  }

  public applySettings(settings: AppSettings): void {
    this.settings = settings;
    if (!this.view) return;
    const fountain = Boolean(
      this.currentPath && isFountainPath(this.currentPath),
    );
    this.view.dispatch({
      effects: [
        this.wrapCompartment.reconfigure(settings.wordWrap ? EditorView.lineWrapping : []),
        this.lineNumbersCompartment.reconfigure(
          settings.lineNumbers ? [cmLineNumbers(), highlightActiveLineGutter()] : [],
        ),
        this.appearanceCompartment.reconfigure(buildAppearanceExtension(settings)),
        this.completionCompartment.reconfigure(
          fountain
            ? fountainCompletionExtension(
                () =>
                  this.callbacks.getFountainBibleSymbols?.() ??
                  EMPTY_FOUNTAIN_SYMBOLS,
                settings.language,
                settings.fountainAutocomplete,
              )
            : [],
        ),
      ],
    });
  }

  public setSearchQuery(config: EditorSearchQuery): boolean {
    if (!this.view) return false;
    const query = buildEditorSearchQuery(config);
    this.view.dispatch({ effects: setSearchQuery.of(query) });
    return query.valid;
  }

  public searchNext(): void {
    if (!this.view) return;
    const query = getSearchQuery(this.view.state);
    if (!query.valid || !query.search) return;
    findNext(this.view);
  }

  public searchPrevious(): void {
    if (!this.view) return;
    const query = getSearchQuery(this.view.state);
    if (!query.valid || !query.search) return;
    findPrevious(this.view);
  }

  public replaceSearch(replace: string): boolean {
    if (!this.view) return false;
    const current = getSearchQuery(this.view.state);
    if (!current.valid || !current.search) return false;
    const query = buildEditorSearchQuery(
      {
        search: current.search,
        caseSensitive: current.caseSensitive,
        wholeWord: current.wholeWord,
        regexp: current.regexp,
      },
      replace,
    );
    this.view.dispatch({ effects: setSearchQuery.of(query) });
    return replaceNext(this.view);
  }

  public replaceAllSearch(replace: string): boolean {
    if (!this.view) return false;
    const current = getSearchQuery(this.view.state);
    if (!current.valid || !current.search) return false;
    const query = buildEditorSearchQuery(
      {
        search: current.search,
        caseSensitive: current.caseSensitive,
        wholeWord: current.wholeWord,
        regexp: current.regexp,
      },
      replace,
    );
    this.view.dispatch({ effects: setSearchQuery.of(query) });
    return replaceAll(this.view);
  }

  public clearSearch(): void {
    if (!this.view) return;
    this.view.dispatch({
      effects: setSearchQuery.of(new SearchQuery({ search: "" })),
    });
  }

  public searchMatchInfo(): { current: number; total: number } {
    if (!this.view) return { current: 0, total: 0 };
    return searchMatchInfo(
      this.view.state,
      getSearchQuery(this.view.state),
    );
  }

  public getSelectedText(): string {
    if (!this.view) return "";
    const selection = this.view.state.selection.main;
    return this.view.state.sliceDoc(selection.from, selection.to);
  }

  public focusEditor(): void {
    this.view?.focus();
  }

  public undo(): void {
    if (!this.view) return;
    this.view.focus();
    cmUndo(this.view);
  }

  public redo(): void {
    if (!this.view) return;
    this.view.focus();
    cmRedo(this.view);
  }

  public toggleBold(): void {
    this.applyWrap("**");
  }

  public toggleItalic(): void {
    this.applyWrap("*");
  }

  public runFountainCommand(command: FountainCommand): void {
    if (!this.view || !this.currentPath || !isFountainPath(this.currentPath)) {
      return;
    }
    const state = this.view.state;
    const line = state.doc.lineAt(state.selection.main.from);

    if (command === "note") {
      this.insertFountainNote();
      return;
    }

    this.view.dispatch({
      effects: setFountainCompletionIntent(command),
    });
    this.view.focus();
    const opened = startCompletion(this.view);
    if (!opened) {
      this.view.dispatch({
        effects: setFountainCompletionIntent(null),
      });
      this.insertFountainFallback(command, line.from, line.to);
    }
  }

  private insertFountainNote(): void {
    if (!this.view) return;
    const { from, to } = this.view.state.selection.main;
    const selected = this.view.state.sliceDoc(from, to);
    const content = selected || "";
    const insert = `[[${content}]]`;
    const start = from + 2;
    this.view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: start, head: start + content.length },
    });
    this.view.focus();
  }

  private insertFountainFallback(
    command: FountainCommand,
    lineFrom: number,
    lineTo: number,
  ): void {
    if (!this.view) return;
    const fallback =
      command === "scene"
        ? "INT. "
        : command === "character"
          ? "PERSONAJE"
          : command === "parenthetical"
            ? "()"
            : command === "transition"
              ? "CUT TO:\n"
              : command === "section"
                ? "# \n"
                : "";
    if (!fallback) {
      this.focusLine(lineFrom);
      return;
    }
    const select =
      command === "character"
        ? { anchor: lineFrom, head: lineFrom + fallback.length }
        : command === "parenthetical"
          ? { anchor: lineFrom + 1, head: lineFrom + 1 }
          : { anchor: lineFrom + fallback.length, head: lineFrom + fallback.length };
    this.view.dispatch({
      changes: { from: lineFrom, to: lineTo, insert: fallback },
      selection: select,
    });
    this.view.focus();
  }

  private focusLine(position: number): void {
    if (!this.view) return;
    this.view.dispatch({ selection: { anchor: position } });
    this.view.focus();
  }

  private applyWrap(marker: string): void {
    if (!this.view) return;
    const { from, to } = this.view.state.selection.main;
    const edit = computeWrapEdit(this.view.state.doc.toString(), from, to, marker);
    this.view.dispatch({
      changes: edit.changes,
      selection: edit.selection,
    });
    this.view.focus();
  }

  public getSelection(): string {
    if (!this.view) return "";
    const { from, to } = this.view.state.selection.main;
    return this.view.state.sliceDoc(from, to);
  }

  public focus(): void {
    this.view?.focus();
  }

  public gotoLine(line: number): void {
    if (!this.view) return;
    const clamped = Math.min(Math.max(1, Math.floor(line)), this.view.state.doc.lines);
    const target = this.view.state.doc.line(clamped);
    this.view.dispatch({
      selection: { anchor: target.from },
      effects: EditorView.scrollIntoView(target.from, { y: "center" }),
    });
    this.view.focus();
  }

  public destroy(): void {
    if (this.inlineDiffTimer !== null) {
      window.clearTimeout(this.inlineDiffTimer);
      this.inlineDiffTimer = null;
    }
    this.inlineDiff.destroy();
    this.view?.destroy();
    this.view = null;
  }

  private createState(path: string, content: string, settings: AppSettings): EditorState {
    const fountain = isFountainPath(path);
    return EditorState.create({
      doc: content,
      extensions: [
        history(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        highlightActiveLine(),
        search({ top: true }),
        searchHighlightExtension,
        syntaxHighlighting(writerHighlightStyle, { fallback: true }),
        EditorView.contentAttributes.of({
          spellcheck: "true",
          autocorrect: "on",
          autocapitalize: "sentences",
        }),
        this.wrapCompartment.of(settings.wordWrap ? EditorView.lineWrapping : []),
        this.lineNumbersCompartment.of(
          settings.lineNumbers ? [cmLineNumbers(), highlightActiveLineGutter()] : [],
        ),
        this.appearanceCompartment.of(buildAppearanceExtension(settings)),
        this.completionCompartment.of(
          fountain
            ? fountainCompletionExtension(
                () =>
                  this.callbacks.getFountainBibleSymbols?.() ??
                  EMPTY_FOUNTAIN_SYMBOLS,
                settings.language,
                settings.fountainAutocomplete,
              )
            : [],
        ),
        this.readOnlyCompartment.of(
          this.livePreviewPath === path
            ? [EditorState.readOnly.of(true), EditorView.editable.of(false)]
            : [],
        ),
        EditorState.transactionFilter.of((transaction) => {
          if (
            this.livePreviewPath &&
            this.currentPath === this.livePreviewPath &&
            transaction.docChanged &&
            !this.livePreviewUpdating
          ) {
            return [];
          }
          return transaction;
        }),
        this.languageCompartment.of(languageExtensionForPath(path)),
        this.inlineDiff.extension(),
        this.inlineBlame.extension(),
        keymap.of([
          {
            key: "Mod-s",
            run: () => {
              this.callbacks.onSaveShortcut();
              return true;
            },
          },
          ...(isMarkdownPath(path)
            ? [
                {
                  key: "Mod-b",
                  run: () => {
                    this.toggleBold();
                    return true;
                  },
                },
                {
                  key: "Mod-i",
                  run: () => {
                    this.toggleItalic();
                    return true;
                  },
                },
              ]
            : []),
          ...(fountain
            ? FOUNTAIN_COMMANDS.map((command) => ({
                key: command.key,
                run: () => {
                  this.runFountainCommand(command.id);
                  return true;
                },
              }))
            : []),
          indentWithTab,
          ...historyKeymap,
          ...defaultKeymap,
        ]),
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (!this.currentPath) return;
          if (update.docChanged) {
            if (!this.livePreviewUpdating) {
              this.callbacks.onContentChange(
                this.currentPath,
                update.state.doc.toString(),
              );
              this.scheduleInlineDiff();
            }
          }
          if (
            !this.livePreviewUpdating &&
            (update.selectionSet || update.docChanged)
          ) {
            this.reportCursor(update.state);
          }
        }),
      ],
    });
  }

  private reportCursor(state: EditorState): void {
    if (!this.currentPath) return;
    const head = state.selection.main.head;
    const line = state.doc.lineAt(head);
    const col = head - line.from + 1;
    this.callbacks.onCursorChange(this.currentPath, line.number, col);
  }
}
