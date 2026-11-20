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

function click(element: Element | null) {
  element?.dispatchEvent(
    new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
  );
  element?.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true }),
  );
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("inline diff view (T-3.9.2)", () => {
  it("shows only gutter marks until a changed bar is clicked", () => {
    const { parent, holder, diff } = mount("uno\ndos");
    diff.setHunks(buildInlineDiffHunks("uno\ndos", "UNO\ndos"));

    expect(parent.querySelector(".cm-git-marker-modified")).not.toBeNull();
    expect(parent.querySelector(".cm-git-line-expanded")).toBeNull();
    expect(parent.querySelector(".cm-git-deleted-ghost")).toBeNull();
    expect(parent.querySelectorAll(".git-diff-ruler-tick")).toHaveLength(1);

    click(parent.querySelector(".cm-git-marker-modified"));

    expect(parent.querySelector(".cm-git-line-expanded")).not.toBeNull();
    expect(parent.querySelector(".cm-git-line-number-expanded")).not.toBeNull();
    const ghost = parent.querySelector(".cm-git-deleted-ghost");
    expect(ghost?.textContent).toContain("uno");
    expect(ghost?.querySelector(".cm-git-hunk-restore")).not.toBeNull();
    holder.view?.destroy();
  });

  it("marks added lines green when their bar is clicked and offers no restore", () => {
    const { parent, holder, diff } = mount("uno");
    diff.setHunks(buildInlineDiffHunks("", "uno"));

    expect(parent.querySelector(".cm-git-line-expanded")).toBeNull();
    click(parent.querySelector(".cm-git-marker-added"));

    expect(parent.querySelector(".cm-git-line-expanded")).not.toBeNull();
    expect(parent.querySelector(".cm-git-deleted-ghost")).toBeNull();
    expect(parent.querySelector(".cm-git-hunk-restore")).toBeNull();
    holder.view?.destroy();
  });

  it("expands a red triangle into deleted lines with restore", () => {
    const { parent, holder, diff } = mount("dos");
    diff.setHunks(buildInlineDiffHunks("uno\ndos", "dos"));

    click(parent.querySelector(".cm-git-marker-deleted"));

    const ghost = parent.querySelector(".cm-git-deleted-ghost");
    expect(ghost?.textContent).toContain("uno");
    expect(ghost?.querySelector(".cm-git-hunk-restore")).not.toBeNull();
    expect(parent.querySelector(".cm-git-line-expanded")).toBeNull();
    holder.view?.destroy();
  });

  it("collapses an expanded hunk when its bar is clicked again", () => {
    const { parent, holder, diff } = mount("uno\ndos");
    diff.setHunks(buildInlineDiffHunks("uno\ndos", "UNO\ndos"));
    const marker = parent.querySelector(".cm-git-marker-modified");

    click(marker);
    expect(parent.querySelector(".cm-git-deleted-ghost")).not.toBeNull();
    click(marker);
    expect(parent.querySelector(".cm-git-deleted-ghost")).toBeNull();
    holder.view?.destroy();
  });

  it("navigates to the next and previous changed line and reveals it", () => {
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
    expect(parent.querySelector(".cm-git-deleted-ghost")).not.toBeNull();
    buttons[1].click();
    expect(line()).toBe(4);
    buttons[0].click();
    expect(line()).toBe(2);
    holder.view?.destroy();
  });

  it("restores deleted lines from the expanded hunk action", () => {
    const { parent, holder, diff } = mount("dos\n");
    diff.setHunks(buildInlineDiffHunks("uno\ndos\n", "dos\n"));
    click(parent.querySelector(".cm-git-marker-deleted"));

    const restore = parent.querySelector<HTMLButtonElement>(
      ".cm-git-hunk-restore",
    );
    expect(restore).not.toBeNull();
    restore?.click();

    expect(holder.view?.state.doc.toString()).toBe("uno\ndos\n");
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
