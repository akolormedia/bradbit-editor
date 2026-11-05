import { describe, expect, it } from "vitest";
import { computeWrapEdit } from "./markdownFormat";

describe("Markdown formatting transactions (T-1.2.1)", () => {
  it("inserts bold markers and places the cursor between them on an empty selection", () => {
    const edit = computeWrapEdit("hola", 0, 0, "**");
    expect(edit.changes).toEqual([{ from: 0, to: 0, insert: "****" }]);
    expect(edit.selection).toEqual({ anchor: 2, head: 2 });
  });

  it("wraps the selected text with bold markers and keeps the selection", () => {
    const edit = computeWrapEdit("hola mundo", 0, 4, "**");
    expect(edit.changes).toEqual([{ from: 0, to: 4, insert: "**hola**" }]);
    expect(edit.selection).toEqual({ anchor: 2, head: 6 });
  });

  it("unwraps markers when the selection already includes them", () => {
    const edit = computeWrapEdit("**hola**", 0, 8, "**");
    expect(edit.changes).toEqual([{ from: 0, to: 8, insert: "hola" }]);
    expect(edit.selection).toEqual({ anchor: 0, head: 4 });
  });

  it("removes markers that surround the selection", () => {
    const edit = computeWrapEdit("**hola**", 2, 6, "**");
    expect(edit.changes).toEqual([
      { from: 0, to: 2, insert: "" },
      { from: 6, to: 8, insert: "" },
    ]);
    expect(edit.selection).toEqual({ anchor: 0, head: 4 });
  });

  it("works with italic markers and selections in the middle of a document", () => {
    const edit = computeWrapEdit("una frase completa", 4, 9, "*");
    expect(edit.changes).toEqual([{ from: 4, to: 9, insert: "*frase*" }]);
    expect(edit.selection).toEqual({ anchor: 5, head: 10 });
  });

  it("does not unwrap a single marker that only touches one side", () => {
    const edit = computeWrapEdit("**hola", 2, 6, "*");
    expect(edit.changes).toEqual([{ from: 2, to: 6, insert: "*hola*" }]);
  });
});
