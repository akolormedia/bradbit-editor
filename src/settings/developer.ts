import { AppSettings } from "../types";
import { isValidGitAuthor } from "../git/versions";
import { SettingsCategoryId } from "./catalog";

/** Categories that only make sense for developers or advanced users. */
const DEVELOPER_CATEGORIES = new Set<SettingsCategoryId>([
  "files",
  "terminal",
  "git",
]);

export function isSettingsCategoryVisible(
  category: SettingsCategoryId,
  settings: AppSettings,
): boolean {
  return settings.showDeveloperOptions || !DEVELOPER_CATEGORIES.has(category);
}

/** Config folders are only shown when developer options and the file toggle are on. */
export function configFilesVisible(settings: AppSettings): boolean {
  return settings.showDeveloperOptions && settings.showConfigFiles;
}

/**
 * Versions always need an author. Non-developers should not have to configure
 * one, so fall back to a local identity; developer options expose the fields
 * to customize it.
 */
export function effectiveGitAuthor(settings: AppSettings): {
  name: string;
  email: string;
} {
  const name = settings.gitAuthorName.trim();
  const email = settings.gitAuthorEmail.trim();
  if (isValidGitAuthor(name, email)) return { name, email };
  return { name: "Bradbit Writer", email: "writer@bradbit.local" };
}
