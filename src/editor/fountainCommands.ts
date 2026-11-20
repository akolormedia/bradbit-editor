import type { TranslationKey } from "../i18n";

export type FountainElement =
  | "scene"
  | "action"
  | "character"
  | "dialogue"
  | "parenthetical"
  | "transition"
  | "section"
  | "note";

/** Commands exposed in the toolbar; Action and Dialogue add no new structure. */
export type FountainCommand =
  | "scene"
  | "character"
  | "parenthetical"
  | "transition"
  | "section"
  | "note";

export interface FountainCommandDefinition {
  id: FountainCommand;
  labelKey: TranslationKey;
  shortcut: string;
  key: string;
}

export const FOUNTAIN_COMMANDS: FountainCommandDefinition[] = [
  {
    id: "scene",
    labelKey: "fountainElementScene",
    shortcut: "⌘1",
    key: "Mod-1",
  },
  {
    id: "character",
    labelKey: "fountainElementCharacter",
    shortcut: "⌘2",
    key: "Mod-2",
  },
  {
    id: "parenthetical",
    labelKey: "fountainElementParenthetical",
    shortcut: "⌘3",
    key: "Mod-3",
  },
  {
    id: "transition",
    labelKey: "fountainElementTransition",
    shortcut: "⌘4",
    key: "Mod-4",
  },
  {
    id: "section",
    labelKey: "fountainElementSection",
    shortcut: "⌘5",
    key: "Mod-5",
  },
  {
    id: "note",
    labelKey: "fountainElementNote",
    shortcut: "⌘6",
    key: "Mod-6",
  },
];
