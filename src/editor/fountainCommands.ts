import type { TranslationKey } from "../i18n";

export type FountainCommand =
  | "scene"
  | "action"
  | "character"
  | "dialogue"
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
    id: "action",
    labelKey: "fountainElementAction",
    shortcut: "⌘2",
    key: "Mod-2",
  },
  {
    id: "character",
    labelKey: "fountainElementCharacter",
    shortcut: "⌘3",
    key: "Mod-3",
  },
  {
    id: "dialogue",
    labelKey: "fountainElementDialogue",
    shortcut: "⌘4",
    key: "Mod-4",
  },
  {
    id: "parenthetical",
    labelKey: "fountainElementParenthetical",
    shortcut: "⌘5",
    key: "Mod-5",
  },
  {
    id: "transition",
    labelKey: "fountainElementTransition",
    shortcut: "⌘6",
    key: "Mod-6",
  },
  {
    id: "section",
    labelKey: "fountainElementSection",
    shortcut: "⌘7",
    key: "Mod-7",
  },
  {
    id: "note",
    labelKey: "fountainElementNote",
    shortcut: "⌘8",
    key: "Mod-8",
  },
];
