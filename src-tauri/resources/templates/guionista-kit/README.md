# guionista-kit

Base project template for screenwriting (feature film, series, micro
drama) with Bradbit. It contains the shared skills, agents and commands,
plus the folder structure for the story bible and the script.

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
