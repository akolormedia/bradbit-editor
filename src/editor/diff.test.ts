// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../workspace/state";
import { BradbitDiffView } from "./diff";

afterEach(() => {
  document.body.replaceChildren();
});

describe("diff view modes (T-3.10.4)", () => {
  it("renders split and unified read-only views", () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const view = new BradbitDiffView(parent);

    view.open("uno\ndos\n", "uno\nDOS\n", DEFAULT_SETTINGS, "split");
    expect(parent.querySelector(".cm-mergeView")).not.toBeNull();
    view.destroy();

    view.open("uno\ndos\n", "uno\nDOS\n", DEFAULT_SETTINGS, "unified");
    expect(parent.querySelector(".cm-mergeView")).toBeNull();
    expect(parent.querySelector(".cm-editor")).not.toBeNull();
    view.destroy();
  });
});
