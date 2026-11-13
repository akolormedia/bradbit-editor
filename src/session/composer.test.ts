import { describe, expect, it } from "vitest";
import {
  activeCompletion,
  filterCommands,
  filterProjectFiles,
  parseSlashCommand,
  replaceCompletion,
} from "./composer";

describe("composer completions (T-2.2.2)", () => {
  it("detects slash commands only at the start of the message", () => {
    expect(activeCompletion("/esc", 4)).toEqual({
      kind: "command",
      query: "esc",
      start: 0,
      end: 4,
    });
    expect(activeCompletion("  /esc", 6)).toEqual({
      kind: "command",
      query: "esc",
      start: 2,
      end: 6,
    });
    expect(activeCompletion("hola /esc", 9)).toBeNull();
  });

  it("detects file mentions after whitespace and ignores emails", () => {
    expect(activeCompletion("revisa @not", 11)).toEqual({
      kind: "mention",
      query: "not",
      start: 7,
      end: 11,
    });
    expect(activeCompletion("correo foo@bar", 15)).toBeNull();
    expect(activeCompletion("@", 1)).toEqual({
      kind: "mention",
      query: "",
      start: 0,
      end: 1,
    });
  });

  it("filters commands by name and description", () => {
    const commands = [
      { name: "escena", description: "Escribe una escena" },
      { name: "estructura", description: "Método narrativo" },
      { name: "revisar", description: "Notas de editor" },
    ];
    expect(filterCommands(commands, "es").map((command) => command.name)).toEqual([
      "escena",
      "estructura",
    ]);
    expect(
      filterCommands(commands, "editor").map((command) => command.name),
    ).toEqual(["revisar"]);
  });

  it("filters commands by localized aliases", () => {
    const commands = [
      { name: "scene", description: "Write a scene", aliases: ["escena"] },
      { name: "review", description: "Review a scene", aliases: ["revisar"] },
    ];
    expect(filterCommands(commands, "esc").map((command) => command.name)).toEqual([
      "scene",
    ]);
    expect(
      filterCommands(commands, "revis").map((command) => command.name),
    ).toEqual(["review"]);
  });

  it("filters project files by name and path", () => {
    const files = [
      { path: "biblia/personajes/ana.md", name: "ana.md" },
      { path: "guion/escena-1.fountain", name: "escena-1.fountain" },
      { path: "notas/ideas.md", name: "ideas.md" },
    ];
    expect(filterProjectFiles(files, "ana").map((file) => file.path)).toEqual([
      "biblia/personajes/ana.md",
    ]);
    expect(filterProjectFiles(files, "guion").map((file) => file.path)).toEqual([
      "guion/escena-1.fountain",
    ]);
  });

  it("replaces the active token and positions the cursor", () => {
    const text = "revisa @not y dime";
    const token = activeCompletion(text, 11)!;
    const result = replaceCompletion(text, token, "@notas.md ");
    expect(result.text).toBe("revisa @notas.md  y dime");
    expect(result.cursor).toBe(17);
  });

  it("parses slash commands with optional arguments", () => {
    expect(parseSlashCommand("/escena 3")).toEqual({
      name: "escena",
      args: "3",
    });
    expect(parseSlashCommand("/revisar")).toEqual({
      name: "revisar",
      args: "",
    });
    expect(parseSlashCommand("hola /escena")).toBeNull();
  });
});
