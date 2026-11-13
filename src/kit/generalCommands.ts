import { KitCommand } from "../types";

/**
 * Commands provided by Bradbit itself, available in every project with or
 * without a kit. Their runtime definitions are injected through
 * `OPENCODE_CONFIG_CONTENT.commands`; the Git behavior lives in the general
 * `git-versioning` skill.
 */
export const GENERAL_COMMANDS: KitCommand[] = [
  {
    id: "save-version",
    name: "Save version",
    description:
      "Saves the current project state as a Git version after the user approves it.",
    agent: null,
    path: "builtin:save-version",
    aliases: ["save-version"],
    i18n: {
      es: {
        name: "Guardar versión",
        description:
          "Guarda el estado actual del proyecto como una versión de Git después de que el usuario lo apruebe.",
        aliases: ["guardar-version"],
      },
    },
  },
  {
    id: "history",
    name: "History",
    description: "Summarizes the recent saved versions of the project.",
    agent: null,
    path: "builtin:history",
    aliases: ["history"],
    i18n: {
      es: {
        name: "Historial",
        description:
          "Resume las versiones guardadas recientemente en el proyecto.",
        aliases: ["historial"],
      },
    },
  },
];

/**
 * Puts the general commands first and drops any kit command with the same
 * canonical id, so the general behavior always wins.
 */
export function mergeGeneralCommands<T extends { commands: KitCommand[] }>(
  catalog: T,
): T {
  const general = new Set(GENERAL_COMMANDS.map((command) => command.id));
  return {
    ...catalog,
    commands: [
      ...GENERAL_COMMANDS,
      ...catalog.commands.filter((command) => !general.has(command.id)),
    ],
  };
}
