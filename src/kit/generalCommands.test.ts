import { describe, expect, it } from "vitest";
import { GENERAL_COMMANDS, mergeGeneralCommands } from "./generalCommands";
import { localizedKitText, matchesKitCommand } from "./localize";
import { KitCatalog } from "../types";

const kitCatalog: KitCatalog = {
  agents: [],
  commands: [
    {
      id: "save-version",
      name: "Kit save version",
      description: "Kit-specific",
      agent: null,
      path: ".bradbit/commands/save-version.md",
    },
    {
      id: "idea",
      name: "Idea",
      description: "Starts the premise",
      agent: "screenwriter",
      path: ".bradbit/commands/idea.md",
    },
  ],
  skills: [],
};

describe("general kit commands", () => {
  it("exposes the Git commands with Spanish aliases", () => {
    expect(GENERAL_COMMANDS.map((command) => command.id)).toEqual([
      "save-version",
      "history",
    ]);
    expect(localizedKitText(GENERAL_COMMANDS[0], "es").name).toBe(
      "Guardar versión",
    );
    expect(localizedKitText(GENERAL_COMMANDS[0], "es").aliases).toContain(
      "guardar-version",
    );
    expect(matchesKitCommand(GENERAL_COMMANDS[0], "guardar-version", "es")).toBe(
      true,
    );
  });

  it("puts general commands first and drops kit duplicates", () => {
    const merged = mergeGeneralCommands(kitCatalog);
    expect(merged.commands.map((command) => command.id)).toEqual([
      "save-version",
      "history",
      "idea",
    ]);
    expect(merged.commands[0].path).toBe("builtin:save-version");
    expect(
      merged.commands.find((command) => command.id === "save-version")?.path,
    ).toBe("builtin:save-version");
  });

  it("preserves kit commands that do not conflict", () => {
    const merged = mergeGeneralCommands(kitCatalog);
    expect(
      merged.commands.find((command) => command.id === "idea")?.path,
    ).toBe(".bradbit/commands/idea.md");
  });
});
