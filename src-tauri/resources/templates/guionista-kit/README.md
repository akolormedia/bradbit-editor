# guionista-kit

[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Bradbit writing kit](https://img.shields.io/badge/Bradbit-writing%20kit-1c1917)](https://github.com/akolormedia/bradbit-editor)

> Part of the Bradbit writing kits. Use it in **Bradbit Editor** or with `bradbit init`.

Base project template for screenwriting (feature film, series, micro
drama) with Bradbit. It contains the shared skills, agents and commands,
plus the folder structure for the story bible and the script.

## When to use it
Use this kit for a feature film, a series, an episode or a micro drama:
any project where the deliverable is a script in Fountain format and the
work is organized around a story bible, structure and scenes.

## Workflow
1. `/idea` — premise, logline and theme.
2. `/character` — character sheets and voices.
3. `/structure` — choose a structure method and write the beats.
4. `/outline` — turn the beats into a scene outline.
5. `/scene` — draft scenes in `script/`.
6. `/review` — script-editor notes.
7. `/voice` — test dialogue in a character's voice.

## Creating a project
From the app: **New project** → **Screenwriting (guionista-kit)**.
From the CLI:
```bash
bradbit init my-project --kit guionista-kit
```
`guionista-kit` is the default when `--kit` is omitted.

## How to use it

1. Copy this folder as the repository for your new project:
   ```bash
   cp -r guionista-kit my-new-project
   cd my-new-project
   git init
   ```
2. Fill `bible/premise.md` with the initial idea (or use the
   `idea-development` skill to build it with help).
3. Fill `bible/characters/` (one file per character) and
   `bible/world/` as the project grows.
4. Choose a structure method in
   `.bradbit/skills/story-structure/methods/` and write the outline in
   `structure/`.
5. Write the script in `script/*.fountain`.

## What is in `.bradbit/`

- **skills/** — processes: idea development, research, character sheets,
  narrative structure methods, outline, scene writing, Fountain format,
  micro drama and script editing.
- **agents/** — roles with different permissions: `screenwriter`
  (writes), `editor` (gives notes, does not modify), `researcher`
  (researches and records sources), `character` (chats in the voice of a
  character from the bible, to test dialogue).
- **commands/** — shortcuts: `/idea`, `/research`, `/character`,
  `/structure`, `/scene`, `/review`, `/voice`. Spanish aliases are
  available when Bradbit runs in Spanish: `/investigar`, `/personaje`,
  `/estructura`, `/escena`, `/revisar`, `/voz`.
- **Git commands** — `/save-version` and `/history` are provided by
  Bradbit as general commands, not by this kit.

## Language and aliases

Kit instructions are English; the agent replies and writes the script in
the language configured in Bradbit. Canonical command ids are English,
with Spanish aliases when the app runs in Spanish (`/escena`, `/revisar`,
`/voz`, ...). The editor sends the canonical id to the runtime.

## Versioning workflow

The Git assistant is a **general Bradbit capability**, not part of this
kit. `/save-version` inspects the working tree, summarizes the changes in
human language, proposes a version name and asks for approval. It only
commits after the user approves. `/history` summarizes recent versions.
Never commit secrets or generated `exports/`.

## Roadmap

- **v0:** idea, characters, structure, outline, scene drafts, editor.
- **v1 (current):** English kit, Spanish examples and aliases, Git
  versioning workflow, `bible/` folders in English.
- **v2:** web research with annotated sources, more structure methods,
  PDF/Celtx export.
- **v3:** author-facing documentation for the whole team.

Technical note: Bradbit reads `.bradbit/` as the canonical kit folder. If
you open the kit with OpenCode upstream, rename `.bradbit/` to
`.opencode/`; Bradbit still reads `.opencode/` as legacy compatibility.

## Documentation

- [Bradbit Editor](https://github.com/akolormedia/bradbit-editor)
- [Bradbit CLI](https://github.com/akolormedia/bradbit-cli)
- [Installation guide](https://github.com/akolormedia/bradbit-editor/blob/main/docs/INSTALL.md) · [Español](https://github.com/akolormedia/bradbit-editor/blob/main/docs/INSTALL.es.md)

## Contributing

Issues and pull requests are welcome. Keep the kit declarative: agents, commands and skills belong in `.bradbit/`; instructions stay in English, canonical command IDs in English, and user-facing examples in Spanish.

## License

MIT. See [`LICENSE`](LICENSE). The kit is content; **Bradbit Editor** and **Bradbit CLI** are also MIT licensed.
