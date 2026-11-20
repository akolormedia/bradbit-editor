// @vitest-environment jsdom
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { buildInlineDiffHunks } from "./inlineDiff";
import { InlineDiffView } from "./inlineDiffView";

function mount(doc = "uno\ndos\ntres") {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const holder: { view: EditorView | null } = { view: null };
  const diff = new InlineDiffView({
    parent,
    getView: () => holder.view,
    getLanguage: () => "es",
  });
  holder.view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [lineNumbers(), diff.extension()],
    }),
    parent,
  });
  return { parent, holder, diff };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("inline diff view (T-3.9.2)", () => {
  it("renders gutter bars and shaded lines for modified lines", () => {
    const { parent, holder, diff } = mount();
    diff.setHunks(
      buildInlineDiffHunks("uno\ndos\ntres", "uno\nDOS\ntres"),
    );

    expect(parent.querySelector(".cm-git-marker-modified")).not.toBeNull();
    expect(parent.querySelector(".cm-git-line-modified")).not.toBeNull();
    expect(parent.querySelector(".cm-git-line-number-modified")).not.toBeNull();
    expect(parent.querySelectorAll(".git-diff-ruler-tick")).toHaveLength(1);
    expect(
      parent.querySelector(".git-diff-ruler")?.classList.contains("visible"),
    ).toBe(true);
    holder.view?.destroy();
  });

  it("renders deleted lines inline as a ghost block without a popover", () => {
    const { parent, holder, diff } = mount();
    diff.setHunks(buildInlineDiffHunks("uno\ndos\ntres", "uno\ntres"));

    const marker = parent.querySelector(".cm-git-marker-deleted");
    expect(marker).not.toBeNull();
    expect(marker?.querySelector(".cm-git-restore")).not.toBeNull();

    const ghost = parent.querySelector(".cm-git-deleted-ghost");
    expect(ghost?.textContent).toContain("dos");
    expect(ghost?.querySelector(".cm-git-ghost-restore")).not.toBeNull();
    expect(parent.querySelector(".git-diff-ruler-deleted")).not.toBeNull();
    expect(parent.querySelector(".cm-git-popover")).toBeNull();
    holder.view?.destroy();
  });

  it("navigates to the next and previous changed line", () => {
    const { parent, holder, diff } = mount("uno\ndos\ntres\ncuatro");
    diff.setHunks(
      buildInlineDiffHunks(
        "uno\ndos\ntres\ncuatro",
        "uno\nDOS\ntres\nCUATRO",
      ),
    );
    const buttons = parent.querySelectorAll<HTMLButtonElement>(
      ".git-diff-nav-button",
    );
    expect(buttons).toHaveLength(2);

    const line = () =>
      holder.view?.state.doc.lineAt(holder.view.state.selection.main.head)
        .number;

    buttons[1].click();
    expect(line()).toBe(2);
    buttons[1].click();
    expect(line()).toBe(4);
    buttons[0].click();
    expect(line()).toBe(2);
    holder.view?.destroy();
  });

  it("restores deleted lines when the hover action is clicked", () => {
    const { parent, holder, diff } = mount();
    holder.view?.dispatch({
      changes: { from: 0, to: holder.view.state.doc.length, insert: "dos\ntres" },
    });
    diff.setHunks(buildInlineDiffHunks("uno\ndos\ntres", "dos\ntres"));

    const restore = parent.querySelector<HTMLElement>(".cm-git-restore");
    expect(restore).not.toBeNull();
    restore?.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
    );

    expect(holder.view?.state.doc.toString()).toBe("uno\ndos\ntres");
    holder.view?.destroy();
  });

  it("removes all markers when the diff is cleared", () => {
    const { parent, holder, diff } = mount();
    diff.setHunks(buildInlineDiffHunks("uno", "uno cambiado"));
    expect(parent.querySelector(".cm-git-marker")).not.toBeNull();

    diff.clear();
    expect(parent.querySelector(".cm-git-marker")).toBeNull();
    expect(
      parent.querySelector(".git-diff-ruler")?.classList.contains("visible"),
    ).toBe(false);
    holder.view?.destroy();
  });
});
