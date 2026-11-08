import {
  Compartment,
  EditorState,
  Extension,
  RangeSetBuilder,
} from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers as cmLineNumbers,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab, redo as cmRedo, undo as cmUndo } from "@codemirror/commands";
import { openSearchPanel, search, searchKeymap } from "@codemirror/search";
import { markdown } from "@codemirror/lang-markdown";
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { AppSettings } from "../types";
import { isMarkdownPath } from "../workspace/state";
import {
  classifyFountainLine,
  createFountainState,
  fountainLineClass,
} from "./fountain";
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
    color: "var(--cm-dialogue)",
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
    return fountainHighlighting;
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
      maxWidth: "820px",
      margin: "0",
      padding: "24px 32px 96px 18px",
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
}

export class BradbitCodeMirror {
  private view: EditorView | null = null;
  private currentPath: string | null = null;
  private statesByPath = new Map<string, EditorState>();

  private wrapCompartment = new Compartment();
  private lineNumbersCompartment = new Compartment();
  private appearanceCompartment = new Compartment();
  private languageCompartment = new Compartment();

  constructor(
    private parent: HTMLElement,
    _initialSettings: AppSettings,
    private callbacks: EditorCallbacks,
  ) {}

  public openDocument(path: string, content: string, settings: AppSettings): void {
    if (this.view && this.currentPath) {
      this.statesByPath.set(this.currentPath, this.view.state);
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
    } else {
      this.view.setState(state);
      this.applySettings(settings);
    }
    this.reportCursor(this.view.state);
  }

  public closeDocumentState(path: string): void {
    this.statesByPath.delete(path);
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
    if (this.currentPath === oldPath) {
      this.currentPath = newPath;
    }
  }

  public applySettings(settings: AppSettings): void {
    if (!this.view) return;
    this.view.dispatch({
      effects: [
        this.wrapCompartment.reconfigure(settings.wordWrap ? EditorView.lineWrapping : []),
        this.lineNumbersCompartment.reconfigure(
          settings.lineNumbers ? [cmLineNumbers(), highlightActiveLineGutter()] : [],
        ),
        this.appearanceCompartment.reconfigure(buildAppearanceExtension(settings)),
      ],
    });
  }

  public openFindPanel(): void {
    if (!this.view) return;
    this.view.focus();
    openSearchPanel(this.view);
  }

  public openReplacePanel(): void {
    if (!this.view) return;
    this.view.focus();
    openSearchPanel(this.view);
    const replaceInput = this.view.dom.querySelector<HTMLInputElement>(
      '.cm-search input[name="replace"]',
    );
    replaceInput?.focus();
    replaceInput?.select();
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
    this.view?.destroy();
    this.view = null;
  }

  private createState(path: string, content: string, settings: AppSettings): EditorState {
    return EditorState.create({
      doc: content,
      extensions: [
        history(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        highlightActiveLine(),
        search({ top: true }),
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
        this.languageCompartment.of(languageExtensionForPath(path)),
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
          indentWithTab,
          ...searchKeymap,
          ...historyKeymap,
          ...defaultKeymap,
        ]),
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (!this.currentPath) return;
          if (update.docChanged) {
            this.callbacks.onContentChange(this.currentPath, update.state.doc.toString());
          }
          if (update.selectionSet || update.docChanged) {
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
