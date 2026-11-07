import { t, TranslationKey } from "../i18n";
import { Language } from "../types";
import type { IconName } from "../ui/icons";

export type SettingsCategoryId =
  | "general"
  | "appearance"
  | "editor"
  | "files"
  | "terminal"
  | "git"
  | "github"
  | "models";

export interface SettingsCategory {
  id: SettingsCategoryId;
  labelKey: TranslationKey;
  icon: IconName;
}

export interface SettingsEntry {
  id: string;
  category: SettingsCategoryId;
  labelKey: TranslationKey;
  descriptionKey?: TranslationKey;
}

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  {
    id: "general",
    labelKey: "settingsCategoryGeneral",
    icon: "settings",
  },
  {
    id: "appearance",
    labelKey: "settingsCategoryAppearance",
    icon: "palette",
  },
  {
    id: "editor",
    labelKey: "settingsCategoryEditor",
    icon: "pen-line",
  },
  {
    id: "files",
    labelKey: "settingsCategoryFiles",
    icon: "files",
  },
  {
    id: "terminal",
    labelKey: "settingsCategoryTerminal",
    icon: "terminal",
  },
  {
    id: "git",
    labelKey: "settingsCategoryGit",
    icon: "git-branch",
  },
  {
    id: "github",
    labelKey: "settingsCategoryGithub",
    icon: "github",
  },
  {
    id: "models",
    labelKey: "settingsCategoryModels",
    icon: "sliders-horizontal",
  },
];

/**
 * Searchable index of every setting exposed by the application.
 *
 * Keeping this list separate from the rendering code lets Settings search
 * cover all categories without duplicating labels or descriptions.
 */
export const SETTINGS_ENTRIES: SettingsEntry[] = [
  {
    id: "language",
    category: "general",
    labelKey: "language",
    descriptionKey: "settingsLanguageHint",
  },
  {
    id: "theme",
    category: "appearance",
    labelKey: "theme",
    descriptionKey: "settingsThemeHint",
  },
  {
    id: "fontSize",
    category: "appearance",
    labelKey: "fontSize",
    descriptionKey: "settingsFontSizeHint",
  },
  {
    id: "wordWrap",
    category: "editor",
    labelKey: "wordWrap",
    descriptionKey: "settingsWordWrapHint",
  },
  {
    id: "lineNumbers",
    category: "editor",
    labelKey: "lineNumbers",
    descriptionKey: "settingsLineNumbersHint",
  },
  {
    id: "showConfigFiles",
    category: "files",
    labelKey: "showConfigFiles",
    descriptionKey: "settingsShowConfigFilesHint",
  },
  {
    id: "terminalCommand",
    category: "terminal",
    labelKey: "settingsTerminalCommand",
    descriptionKey: "settingsTerminalCommandHint",
  },
  {
    id: "gitAuthorName",
    category: "git",
    labelKey: "gitAuthorName",
    descriptionKey: "gitAuthorHint",
  },
  {
    id: "gitAuthorEmail",
    category: "git",
    labelKey: "gitAuthorEmail",
  },
  {
    id: "githubAccount",
    category: "github",
    labelKey: "githubAccountSection",
    descriptionKey: "githubConnectHint",
  },
  {
    id: "githubToken",
    category: "github",
    labelKey: "githubTokenLabel",
    descriptionKey: "githubTokenHint",
  },
  {
    id: "models",
    category: "models",
    labelKey: "chatModelsTitle",
    descriptionKey: "chatModelsHint",
  },
];

export function normalizeSettingsSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function categoryMatchesQuery(
  category: SettingsCategory,
  language: Language,
  query: string,
): boolean {
  return normalizeSettingsSearch(t(language, category.labelKey)).includes(query);
}

function entryMatchesQuery(
  entry: SettingsEntry,
  language: Language,
  query: string,
): boolean {
  const text = [
    t(language, entry.labelKey),
    entry.descriptionKey ? t(language, entry.descriptionKey) : "",
  ].join(" ");
  return normalizeSettingsSearch(text).includes(query);
}

export function matchingCategoryIds(
  language: Language,
  query: string,
): SettingsCategoryId[] {
  const normalized = normalizeSettingsSearch(query);
  if (!normalized) return SETTINGS_CATEGORIES.map((category) => category.id);

  return SETTINGS_CATEGORIES.filter((category) => {
    if (categoryMatchesQuery(category, language, normalized)) return true;
    return SETTINGS_ENTRIES.some(
      (entry) =>
        entry.category === category.id &&
        entryMatchesQuery(entry, language, normalized),
    );
  }).map((category) => category.id);
}

/**
 * Returns the entries to show for a category. When the query matches the
 * category name (e.g. "apariencia"), all of its settings are shown; when it
 * matches individual rows, only those rows are returned.
 */
export function visibleEntriesForCategory(
  categoryId: SettingsCategoryId,
  language: Language,
  query: string,
): SettingsEntry[] {
  const normalized = normalizeSettingsSearch(query);
  const entries = SETTINGS_ENTRIES.filter((entry) => entry.category === categoryId);
  if (!normalized) return entries;

  const category = SETTINGS_CATEGORIES.find((item) => item.id === categoryId);
  if (category && categoryMatchesQuery(category, language, normalized)) {
    return entries;
  }
  return entries.filter((entry) =>
    entryMatchesQuery(entry, language, normalized),
  );
}
