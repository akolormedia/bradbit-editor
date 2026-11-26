import { RangeSetBuilder } from "@codemirror/state";
import { getSearchQuery } from "@codemirror/search";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";

const matchMark = Decoration.mark({ class: "cm-editor-search-match" });
const selectedMark = Decoration.mark({
  class: "cm-editor-search-match cm-editor-search-match-selected",
});

/**
 * CodeMirror only paints its built-in search decorations while its own panel
 * is open. Bradbit uses a custom toolbar, so this plugin paints matches from
 * the same search state without showing the native panel.
 */
export const searchHighlightExtension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }

    update(update: ViewUpdate): void {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        getSearchQuery(update.state) !== getSearchQuery(update.startState)
      ) {
        this.decorations = this.build(update.view);
      }
    }

    private build(view: EditorView): DecorationSet {
      const query = getSearchQuery(view.state);
      if (!query.valid || !query.search) return Decoration.none;

      const builder = new RangeSetBuilder<Decoration>();
      const ranges = view.visibleRanges;
      for (let i = 0; i < ranges.length; i++) {
        let { from, to } = ranges[i];
        // Merge nearby ranges so a match crossing a boundary is not missed.
        while (i < ranges.length - 1 && to > ranges[i + 1].from - 1000) {
          to = ranges[++i].to;
        }
        const cursor = query.getCursor(view.state, from, to);
        for (;;) {
          const next = cursor.next();
          if (next.done) break;
          const match = next.value;
          const selected = view.state.selection.ranges.some(
            (selection) =>
              selection.from === match.from && selection.to === match.to,
          );
          builder.add(match.from, match.to, selected ? selectedMark : matchMark);
        }
      }
      return builder.finish();
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
  },
);
