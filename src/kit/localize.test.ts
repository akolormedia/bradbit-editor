import { describe, expect, it } from "vitest";
import {
  kitCommandCandidates,
  localizedKitText,
  matchesKitCommand,
} from "./localize";
import { KitCommand } from "../types";

const command: KitCommand = {
  id: "scene",
  name: "Scene",
  description: "Write a scene",
  agent: "screenwriter",
  path: ".bradbit/commands/scene.md",
  aliases: ["write-scene"],
  i18n: {
    es: {
      name: "Escena",
      description: "Escribe una escena",
      aliases: ["escena"],
    },
  },
};

describe("kit localization", () => {
  it("uses canonical English text when no localization exists", () => {
    expect(localizedKitText({ ...command, i18n: undefined }, "en")).toEqual({
      name: "Scene",
      description: "Write a scene",
      aliases: ["write-scene"],
    });
  });

  it("uses Spanish labels and merges aliases", () => {
    expect(localizedKitText(command, "es")).toEqual({
      name: "Escena",
      description: "Escribe una escena",
      aliases: ["write-scene", "escena"],
    });
  });

  it("shapes command candidates with the canonical id as name", () => {
    const [candidate] = kitCommandCandidates([command], "es");
    expect(candidate.name).toBe("scene");
    expect(candidate.description).toBe("Escribe una escena");
    expect(candidate.aliases).toEqual(["Escena", "write-scene", "escena"]);
  });

  it("matches canonical, localized and alias spellings", () => {
    expect(matchesKitCommand(command, "scene", "es")).toBe(true);
    expect(matchesKitCommand(command, "Scene", "en")).toBe(true);
    expect(matchesKitCommand(command, "escena", "es")).toBe(true);
    expect(matchesKitCommand(command, "write-scene", "en")).toBe(true);
    expect(matchesKitCommand(command, "otro", "es")).toBe(false);
  });
});
