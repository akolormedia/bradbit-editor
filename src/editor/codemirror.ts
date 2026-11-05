import { Compartment, EditorState, Extension } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers as cmLineNumbers,
  ViewUpdate,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { openSearchPanel, search, searchKeymap } from "@codemirror/search";
import { markdown } from "@codemirror/lang-markdown";
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  StreamLanguage,
  syntaxHighlighting,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { AppSettings } from "../types";

/**
 * Lightweight Fountain stream highlighter for Story 1.1 (expanded in Story 1.2)
 */
const fountainStreamLanguage = StreamLanguage.define({
  startState: () => ({ afterCue: false }),
  token(stream, state) {
    if (stream.sol()) {
      const line = stream.string.trim();
      if (/^(INT\.|EXT\.|INT\.\/EXT\.|I\/E\.)/i.test(line) || line.startsWith(".")) {
        stream.skipToEnd();
        state.afterCue = false;
        return "heading";
      }
      if (/^#+/.test(line)) {
        stream.skipToEnd();
        state.afterCue = false;
        return "heading";
      }
      if (line.endsWith("TO:") || line.startsWith(">")) {
        stream.skipToEnd();
        state.afterCue = false;
        return "keyword";
      }
      if (
        line.length > 0 &&
        line.length < 50 &&
        line === line.toUpperCase() &&
        /[A-ZÁÉÍÓÚÑ]/.test(line)
      ) {
        stream.skipToEnd();
        state.afterCue = true;
        return "variableName.special";
      }
      if (line.startsWith("(") && line.endsWith(")")) {
        stream.skipToEnd();
        return "meta";
      }
      if (line.length === 0) {
        state.afterCue = false;
      }
    }
    stream.skipToEnd();
    return state.afterCue ? "string" : null;
  },
});

const writerHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, fontWeight: "700", color: "var(--cm-heading)" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.keyword, color: "var(--cm-keyword)", fontWeight: "600" },
  { tag: tags.special(tags.variableName), color: "var(--cm-character)", fontWeight: "700" },
  { tag: tags.string, color: "var(--cm-dialogue)" },
  { tag: tags.meta, color: "var(--cm-parenthetical)", fontStyle: "italic" },
  { tag: tags.link, color: "var(--cm-accent)", textDecoration: "underline" },
  { tag: tags.monospace, fontFamily: "var(--font-mono)" },
]);

function languageExtensionForPath(path: string): Extension {
  const lower = path.toLowerCase();
  if (lower.endsWith(".fountain") || lower.endsWith(".spmd")) {
    return fountainStreamLanguage;
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
      margin: "0 auto",
      padding: "28px 36px 96px 36px",
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

  public focus(): void {
    this.view?.focus();
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
