import { describe, expect, it } from "vitest";
import { FOUNTAIN_COMMANDS } from "./fountainCommands";

describe("Fountain commands", () => {
  it("defines the eight screenwriting elements with unique shortcuts", () => {
    expect(FOUNTAIN_COMMANDS.map((command) => command.id)).toEqual([
      "scene",
      "action",
      "character",
      "dialogue",
      "parenthetical",
      "transition",
      "section",
      "note",
    ]);
    expect(FOUNTAIN_COMMANDS.map((command) => command.shortcut)).toEqual([
      "⌘1",
      "⌘2",
      "⌘3",
      "⌘4",
      "⌘5",
      "⌘6",
      "⌘7",
      "⌘8",
    ]);
    expect(new Set(FOUNTAIN_COMMANDS.map((command) => command.key)).size).toBe(8);
  });
});
