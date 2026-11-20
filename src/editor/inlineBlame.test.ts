// @vitest-environment jsdom
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { InlineBlameView } from "./inlineBlame";

function mount() {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const holder: { view: EditorView | null } = { view: null };
  const blame = new InlineBlameView(
    () => "es",
    () => holder.view,
  );
  holder.view = new EditorView({
    state: EditorState.create({
      doc: "uno\ndos",
      extensions: [blame.extension()],
    }),
    parent,
  });
  return { parent, holder, blame };
}

const entry = (line: number, commit = "abc1234567") => ({
  line,
  author: "Ana",
  email: "ana@example.com",
  date: new Date().toISOString(),
  commit,
  summary: "Primera versión",
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("inline blame (T-3.9.3)", () => {
  it("shows blame for the cursor line and follows the selection", () => {
    const { parent, holder, blame } = mount();
    blame.setBlame([entry(1), { ...entry(2), author: "Luis" }]);

    expect(parent.querySelector(".cm-inline-blame")?.textContent).toContain(
      "Ana",
    );

    holder.view?.dispatch({ selection: { anchor: 4 } });
    expect(parent.querySelector(".cm-inline-blame")?.textContent).toContain(
      "Luis",
    );
    holder.view?.destroy();
  });

  it("marks uncommitted lines and hides when disabled", () => {
    const { parent, holder, blame } = mount();
    blame.setBlame([entry(1, "")]);

    expect(parent.querySelector(".cm-inline-blame")?.textContent).toBe(
      "Sin guardar",
    );

    blame.setEnabled(false);
    expect(parent.querySelector(".cm-inline-blame")).toBeNull();
    holder.view?.destroy();
  });
});
