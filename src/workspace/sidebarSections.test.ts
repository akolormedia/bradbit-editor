import { describe, expect, it } from "vitest";
import { hasIcon } from "../ui/icons";
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

  it("provides a registered line icon and translation keys for every section", () => {
    for (const section of SIDEBAR_SECTIONS) {
      expect(hasIcon(section.icon)).toBe(true);
      expect(section.titleKey.length).toBeGreaterThan(0);
      expect(section.labelKey.length).toBeGreaterThan(0);
    }
  });
});
