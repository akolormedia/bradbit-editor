import { KitCommand, KitLocalized, Language } from "../types";

export interface LocalizedKitText {
  name: string;
  description: string;
  aliases: string[];
}

interface LocalizableKitEntry {
  name: string;
  description: string;
  aliases?: string[];
  i18n?: Record<string, KitLocalized>;
}

/**
 * Resolves the user-facing text for a kit entry. Canonical names and file
 * paths stay in English; `i18n` supplies localized labels and aliases.
 */
export function localizedKitText(
  entry: LocalizableKitEntry,
  language: Language,
): LocalizedKitText {
  const localized = entry.i18n?.[language];
  return {
    name: localized?.name?.trim() || entry.name,
    description: localized?.description ?? entry.description,
    aliases: [...(entry.aliases ?? []), ...(localized?.aliases ?? [])],
  };
}

/**
 * Shapes commands for `filterCommands`: the canonical id is the searchable
 * name and the localized label/aliases are additional matches.
 */
export function kitCommandCandidates(
  commands: KitCommand[],
  language: Language,
): Array<KitCommand & { name: string; aliases: string[] }> {
  return commands.map((command) => {
    const localized = localizedKitText(command, language);
    return {
      ...command,
      name: command.id,
      description: localized.description,
      aliases: [localized.name, ...localized.aliases],
    };
  });
}

/**
 * Matches a slash command typed by the user against the canonical id, the
 * English name, and the localized name/aliases.
 */
export function matchesKitCommand(
  command: KitCommand,
  name: string,
  language: Language,
): boolean {
  const needle = name.trim().toLowerCase();
  if (!needle) return false;
  const localized = localizedKitText(command, language);
  return [
    command.id,
    command.name,
    ...(command.aliases ?? []),
    localized.name,
    ...localized.aliases,
  ].some((value) => value.trim().toLowerCase() === needle);
}
