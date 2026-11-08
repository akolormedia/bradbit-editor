// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  applyColorTheme,
  COLOR_THEMES,
  PALETTE_TOKENS,
  resolveColorMode,
} from "./palettes";

afterEach(() => {
  applyColorTheme("bradbit", "dark");
});

describe("color themes (T-2.5.4)", () => {
  it("defines every palette token for every non-default family and mode", () => {
    for (const theme of COLOR_THEMES) {
      if (theme.id === "bradbit") continue;
      for (const mode of ["light", "dark"] as const) {
        const palette = theme[mode];
        expect(palette, `${theme.id}/${mode}`).toBeDefined();
        for (const [key] of PALETTE_TOKENS) {
          expect(palette?.[key], `${theme.id}/${mode}/${key}`).toBeTruthy();
        }
      }
    }
  });

  it("applies and clears palette variables on the document root", () => {
    applyColorTheme("nord", "dark");
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--bg-app")).toBe("#2e3440");
    expect(root.style.getPropertyValue("--accent")).toBe("#88c0d0");

    applyColorTheme("bradbit", "dark");
    expect(root.style.getPropertyValue("--bg-app")).toBe("");
    expect(root.style.getPropertyValue("--accent")).toBe("");
  });

  it("resolves the effective light or dark mode", () => {
    expect(resolveColorMode("light", false)).toBe("light");
    expect(resolveColorMode("dark", true)).toBe("dark");
    expect(resolveColorMode("system", true)).toBe("light");
    expect(resolveColorMode("system", false)).toBe("dark");
  });
});
