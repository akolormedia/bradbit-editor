import { MergeView, unifiedMergeView } from "@codemirror/merge";
import { EditorState, Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { AppSettings } from "../types";

export type DiffViewMode = "split" | "unified";

/**
 * Read-only diff between the last committed version and the current editor
 * content. Split mode shows two columns; unified mode shows every change
 * inline in a single document.
 */
export class BradbitDiffView {
  private mergeView: MergeView | null = null;
  private editorView: EditorView | null = null;

  constructor(private readonly parent: HTMLElement) {}

  public open(
    original: string,
    current: string,
    settings: AppSettings,
    mode: DiffViewMode = "split",
  ): void {
    this.destroy();
    this.parent.innerHTML = "";

    const readOnly: Extension[] = [
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      buildDiffTheme(settings),
    ];

    if (mode === "unified") {
      this.editorView = new EditorView({
        state: EditorState.create({
          doc: current,
          extensions: [
            ...readOnly,
            unifiedMergeView({
              original,
              highlightChanges: true,
              gutter: true,
              mergeControls: false,
              syntaxHighlightDeletions: false,
            }),
          ],
        }),
        parent: this.parent,
      });
      return;
    }

    this.mergeView = new MergeView({
      a: { doc: original, extensions: readOnly },
      b: { doc: current, extensions: readOnly },
      parent: this.parent,
      highlightChanges: true,
      gutter: true,
      collapseUnchanged: { margin: 3, minSize: 5 },
    });
  }

  public destroy(): void {
    this.mergeView?.destroy();
    this.mergeView = null;
    this.editorView?.destroy();
    this.editorView = null;
  }
}

function buildDiffTheme(settings: AppSettings): Extension {
  return EditorView.theme({
    "&": {
      height: "100%",
      fontSize: `${settings.fontSize}px`,
      backgroundColor: "var(--bg-editor)",
      color: "var(--text-primary)",
    },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily: "var(--font-editor)",
      lineHeight: "1.68",
    },
    ".cm-content": {
      fontFamily: "var(--font-editor)",
      padding: "16px 20px",
    },
    ".cm-gutters": {
      backgroundColor: "var(--bg-editor)",
      color: "var(--text-muted)",
      border: "none",
    },
    ".cm-changedLine": {
      backgroundColor: "rgba(88, 196, 136, 0.12)",
    },
    ".cm-changedText": {
      backgroundColor: "rgba(88, 196, 136, 0.28)",
    },
    ".cm-deletedChunk": {
      backgroundColor: "rgba(243, 108, 108, 0.12)",
    },
    ".cm-deletedText": {
      backgroundColor: "rgba(243, 108, 108, 0.28)",
    },
    ".cm-insertedLine": {
      backgroundColor: "rgba(88, 196, 136, 0.12)",
    },
    ".cm-insertedText": {
      backgroundColor: "rgba(88, 196, 136, 0.28)",
    },
  });
}
