import { describe, expect, it } from "vitest";
import { SIDEBAR_SECTIONS } from "./sidebarSections";

describe("sidebar sections (T-1.4.5)", () => {
  it("defines the three sections in stable order with unique ids", () => {
    expect(SIDEBAR_SECTIONS.map((section) => section.id)).toEqual([
      "files",
      "outline",
      "versions",
    ]);
    expect(new Set(SIDEBAR_SECTIONS.map((section) => section.id)).size).toBe(3);
  });

  it("provides a compact icon and translation keys for every section", () => {
    for (const section of SIDEBAR_SECTIONS) {
      expect(section.icon.trim().length).toBeGreaterThan(0);
      expect(section.titleKey.length).toBeGreaterThan(0);
      expect(section.labelKey.length).toBeGreaterThan(0);
    }
  });
});
