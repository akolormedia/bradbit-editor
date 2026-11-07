import { describe, expect, it } from "vitest";
import {
  matchingCategoryIds,
  SETTINGS_CATEGORIES,
  SETTINGS_ENTRIES,
  visibleEntriesForCategory,
} from "./catalog";

describe("settings catalog (T-2.4.4)", () => {
  it("defines the categories in stable order", () => {
    expect(SETTINGS_CATEGORIES.map((category) => category.id)).toEqual([
      "general",
      "appearance",
      "editor",
      "files",
      "terminal",
      "git",
      "github",
      "models",
    ]);
    expect(new Set(SETTINGS_CATEGORIES.map((category) => category.id)).size).toBe(
      SETTINGS_CATEGORIES.length,
    );
  });

  it("indexes every application setting exactly once", () => {
    const ids = SETTINGS_ENTRIES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of [
      "language",
      "theme",
      "fontSize",
      "wordWrap",
      "lineNumbers",
      "showConfigFiles",
      "terminalCommand",
      "gitAuthorName",
      "gitAuthorEmail",
      "githubAccount",
      "githubToken",
      "models",
    ]) {
      expect(ids).toContain(id);
    }
    for (const category of SETTINGS_CATEGORIES) {
      expect(
        SETTINGS_ENTRIES.some((entry) => entry.category === category.id),
      ).toBe(true);
    }
  });

  it("filters categories by labels, descriptions and accents", () => {
    expect(matchingCategoryIds("es", "tema")).toEqual(["appearance"]);
    expect(matchingCategoryIds("es", "tamano")).toEqual(["appearance"]);
    expect(matchingCategoryIds("es", "terminal")).toEqual(["terminal"]);
    expect(matchingCategoryIds("es", "autor")).toEqual(["git"]);
    expect(matchingCategoryIds("es", "token")).toEqual(["github"]);
    expect(matchingCategoryIds("es", "modelo")).toEqual(["models"]);
    expect(matchingCategoryIds("es", "")).toEqual(
      SETTINGS_CATEGORIES.map((category) => category.id),
    );
  });

  it("shows all rows when the category name matches and filters otherwise", () => {
    expect(
      visibleEntriesForCategory("appearance", "es", "tema").map(
        (entry) => entry.id,
      ),
    ).toEqual(["theme"]);
    expect(
      visibleEntriesForCategory("appearance", "es", "apariencia").map(
        (entry) => entry.id,
      ),
    ).toEqual(["theme", "fontSize"]);
    expect(visibleEntriesForCategory("appearance", "es", "zzz")).toEqual([]);
  });
});
