// @vitest-environment jsdom
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildInlineDiffHunks } from "./inlineDiff";
import { InlineDiffView } from "./inlineDiffView";

function mount() {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const holder: { view: EditorView | null } = { view: null };
  const diff = new InlineDiffView({
    parent,
    getView: () => holder.view,
    getLanguage: () => "es",
    onOpenDiff: vi.fn(),
  });
  holder.view = new EditorView({
    state: EditorState.create({
      doc: "uno\ndos\ntres",
      extensions: [diff.extension()],
    }),
    parent,
  });
  return { parent, holder, diff };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("inline diff view (T-3.9.2)", () => {
  it("renders gutter bars and ruler ticks for modified lines", () => {
    const { parent, holder, diff } = mount();
    diff.setHunks(
      buildInlineDiffHunks("uno\ndos\ntres", "uno\nDOS\ntres"),
    );

    expect(parent.querySelector(".cm-git-marker-modified")).not.toBeNull();
    expect(parent.querySelectorAll(".git-diff-ruler-tick")).toHaveLength(1);
    expect(
      parent.querySelector(".git-diff-ruler")?.classList.contains("visible"),
    ).toBe(true);
    holder.view?.destroy();
  });

  it("renders a red deletion marker with its restore action", () => {
    const { parent, holder, diff } = mount();
    diff.setHunks(buildInlineDiffHunks("uno\ndos\ntres", "uno\ntres"));

    const marker = parent.querySelector(".cm-git-marker-deleted");
    expect(marker).not.toBeNull();
    expect(marker?.querySelector(".cm-git-restore")).not.toBeNull();
    expect(parent.querySelector(".git-diff-ruler-deleted")).not.toBeNull();
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
