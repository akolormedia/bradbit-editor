// @vitest-environment jsdom
import { EditorState } from "@codemirror/state";
import { search, SearchQuery, setSearchQuery } from "@codemirror/search";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { searchHighlightExtension } from "./searchHighlight";

function mount(doc: string) {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [search({ top: true }), searchHighlightExtension],
    }),
    parent,
  });
  return { view, parent };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("custom search highlights", () => {
  it("paints every match while the native panel stays closed", () => {
    const { view } = mount("gato y gato\nGATO");
    view.dispatch({
      effects: setSearchQuery.of(
        new SearchQuery({ search: "gato", caseSensitive: false }),
      ),
    });
    expect(view.dom.querySelectorAll(".cm-editor-search-match")).toHaveLength(3);
    expect(
      view.dom.querySelectorAll(".cm-editor-search-match-selected"),
    ).toHaveLength(0);

    view.dispatch({ selection: { anchor: 0, head: 4 } });
    expect(
      view.dom.querySelectorAll(".cm-editor-search-match-selected"),
    ).toHaveLength(1);
  });
});
