import { describe, expect, it } from "vitest";
import { widthFromPointerDrag } from "./resizing";

describe("panel resizing (T-2.4.2)", () => {
  it("moves the tree width by the pointer delta, not by its viewport x", () => {
    expect(widthFromPointerDrag(260, 435, 535, 180, 480)).toBe(360);
    expect(widthFromPointerDrag(300, 435, 335, 180, 480)).toBe(200);
  });

  it("works when the panel starts at the left edge", () => {
    expect(widthFromPointerDrag(260, 0, 40, 180, 480)).toBe(300);
  });

  it("clamps to the configured minimum and maximum", () => {
    expect(widthFromPointerDrag(260, 435, 100, 180, 480)).toBe(180);
    expect(widthFromPointerDrag(260, 435, 900, 180, 480)).toBe(480);
  });
});
