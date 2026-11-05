import { MergeView } from "@codemirror/merge";
import { EditorState, Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { AppSettings } from "../types";

/**
 * Read-only side-by-side diff between the last committed version (left) and
 * the current editor content (right).
 */
export class BradbitDiffView {
  private mergeView: MergeView | null = null;

  constructor(private readonly parent: HTMLElement) {}

  public open(original: string, current: string, settings: AppSettings): void {
    this.destroy();
    this.parent.innerHTML = "";

    const extensions: Extension[] = [
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      buildDiffTheme(settings),
    ];

    this.mergeView = new MergeView({
      a: { doc: original, extensions },
      b: { doc: current, extensions },
      parent: this.parent,
      highlightChanges: true,
      gutter: true,
      collapseUnchanged: { margin: 3, minSize: 5 },
    });
  }

  public destroy(): void {
    this.mergeView?.destroy();
    this.mergeView = null;
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
