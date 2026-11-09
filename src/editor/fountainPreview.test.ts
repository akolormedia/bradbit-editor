// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  classifyFountainLines,
  paginateFountain,
  renderFountainPreview,
} from "./fountainPreview";

const script = `EXT. GREYHOUND BUS STATION - DAWN

MAYA (28), leather jacket and tired eyes.

REESE (30)
They're boarding in three minutes.

MAYA
You brought the map?

REESE
(dead serious)
He hired a P.I. last month.
`;

describe("Fountain preview (T-2.5.7)", () => {
  it("classifies scenes, characters, dialogue and parentheticals", () => {
    const lines = classifyFountainLines(script);
    expect(lines[0]).toEqual({
      type: "scene",
      text: "EXT. GREYHOUND BUS STATION - DAWN",
    });
    expect(lines[2]?.type).toBe("action");
    expect(lines[4]?.type).toBe("character");
    expect(lines[5]?.type).toBe("dialogue");
    expect(lines.some((line) => line.type === "parenthetical")).toBe(true);
  });

  it("splits long documents into pages and keeps every line in order", () => {
    const long = Array.from(
      { length: 120 },
      (_, index) => `Action line ${index + 1}.`,
    ).join("\n");
    const pages = paginateFountain(long);
    expect(pages.length).toBeGreaterThan(1);
    const total = pages.reduce((count, page) => count + page.lines.length, 0);
    expect(total).toBe(120);
  });

  it("renders numbered paper pages with screenplay classes", () => {
    const preview = renderFountainPreview(script);
    const pages = preview.querySelectorAll(".fountain-page");
    expect(pages).toHaveLength(1);
    expect(pages[0].querySelector(".fountain-page-number")?.textContent).toBe(
      "1",
    );
    expect(
      preview.querySelector(".fountain-scene")?.textContent,
    ).toContain("EXT. GREYHOUND");
    expect(
      preview.querySelector(".fountain-character")?.textContent,
    ).toContain("REESE");
    expect(
      preview.querySelector(".fountain-dialogue")?.textContent,
    ).toContain("boarding");
  });
});
