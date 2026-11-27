import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../workspace/state";
import {
  configFilesVisible,
  effectiveGitAuthor,
  isSettingsCategoryVisible,
} from "./developer";

describe("developer options", () => {
  it("hides developer categories by default and reveals them when enabled", () => {
    expect(isSettingsCategoryVisible("terminal", DEFAULT_SETTINGS)).toBe(false);
    expect(isSettingsCategoryVisible("files", DEFAULT_SETTINGS)).toBe(false);
    expect(isSettingsCategoryVisible("git", DEFAULT_SETTINGS)).toBe(false);
    expect(isSettingsCategoryVisible("general", DEFAULT_SETTINGS)).toBe(true);
    expect(isSettingsCategoryVisible("models", DEFAULT_SETTINGS)).toBe(true);
    expect(isSettingsCategoryVisible("skills", DEFAULT_SETTINGS)).toBe(true);

    const developer = { ...DEFAULT_SETTINGS, showDeveloperOptions: true };
    expect(isSettingsCategoryVisible("terminal", developer)).toBe(true);
    expect(isSettingsCategoryVisible("files", developer)).toBe(true);
    expect(isSettingsCategoryVisible("git", developer)).toBe(true);
  });

  it("only exposes config files when both switches are on", () => {
    expect(configFilesVisible(DEFAULT_SETTINGS)).toBe(false);
    expect(
      configFilesVisible({ ...DEFAULT_SETTINGS, showConfigFiles: true }),
    ).toBe(false);
    expect(
      configFilesVisible({
        ...DEFAULT_SETTINGS,
        showDeveloperOptions: true,
        showConfigFiles: true,
      }),
    ).toBe(true);
  });

  it("uses a valid configured author or falls back to a local identity", () => {
    expect(effectiveGitAuthor(DEFAULT_SETTINGS)).toEqual({
      name: "Bradbit Writer",
      email: "writer@bradbit.local",
    });
    expect(
      effectiveGitAuthor({
        ...DEFAULT_SETTINGS,
        gitAuthorName: "Ada Lovelace",
        gitAuthorEmail: "ada@example.com",
      }),
    ).toEqual({ name: "Ada Lovelace", email: "ada@example.com" });
    expect(
      effectiveGitAuthor({
        ...DEFAULT_SETTINGS,
        gitAuthorName: "Ada",
        gitAuthorEmail: "not-an-email",
      }),
    ).toEqual({ name: "Bradbit Writer", email: "writer@bradbit.local" });
  });
});
