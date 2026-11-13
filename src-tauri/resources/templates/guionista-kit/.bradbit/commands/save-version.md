---
name: Save version
description: Saves the current project state as a Git version after the user approves it.
agent: screenwriter
i18n:
  es:
    name: Guardar versión
    description: Guarda el estado actual del proyecto como una versión de Git después de que el usuario lo apruebe.
    aliases: [guardar-version]
---
Use the `git-versioning` skill. Inspect the working tree, summarize the
changes in human language, propose a version name and a commit message,
and wait for explicit approval before committing. Never commit secrets,
generated `exports/`, or unrelated files.
