# libro-kit

[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Bradbit writing kit](https://img.shields.io/badge/Bradbit-writing%20kit-1c1917)](https://github.com/akolormedia/bradbit-editor)

> Part of the Bradbit writing kits. Use it in **Bradbit Editor** or with `bradbit init`.

Base project template for writing a novel or book with Bradbit. It keeps
the story bible, structure, manuscript, research, revision notes and
pitch documents in one workspace.

## When to use it
Use this kit for a novel, a novella or a long-form book where the
deliverable is a manuscript and the work is organized around a story
bible, structure, chapters and revision.

## Workflow
1. `/idea` — premise, genre, audience and target length.
2. `/character` — character sheets and voices.
3. `/structure` — choose a novel structure method.
4. `/outline` — chapter-by-chapter outline.
5. `/chapter` — chapter drafts in `manuscript/`.
6. `/continuity` — check timeline, names and facts.
7. `/review` and `/style` — revision and voice.
8. `/synopsis` — synopsis and query letter.

## Creating a project
From the app: **New project** → **Novel (libro-kit)**.
From the CLI:
```bash
bradbit init my-novel --kit libro-kit
```

## Quick start

1. Copy this folder as the repository for your book:
   ```bash
   cp -r libro-kit my-novel
   cd my-novel
   git init
   ```
2. Fill `bible/premise.md` with the idea, genre, audience and target
   length.
3. Build `bible/characters/`, `bible/world/` and `bible/style.md` as the
   project grows.
4. Choose a structure method in `structure/chosen-method.md`, then write
   the chapter outline in `structure/outline.md`.
5. Write chapters in `manuscript/ch01.md`, `ch02.md`, ...
6. Use `/review`, `/continuity` and `/style` before calling a draft
   ready.
7. Prepare the synopsis and query letter in `pitch/`.

## What is inside

### Bible
`bible/` holds premise, characters, world, chronology and style — the
source of truth for the book.

### Structure
`structure/chosen-method.md` records the chosen narrative method.
`structure/outline.md` breaks it into chapters.

### Manuscript
`manuscript/` holds one Markdown file per chapter.

### Research, notes and pitch
`research/` for sources, `notes/` for revision and continuity, `pitch/`
for logline, synopsis and query letter.

## Agents

- `novelist` — writes premise, characters, structure, chapters and
  synopsis.
- `editor` — gives structural and line notes; does not rewrite.
- `researcher` — researches context and sources.
- `character` — chats in a character's voice to test dialogue.
- `continuity` — checks timeline, facts, names and open threads.

## Commands and Spanish aliases

| English | Spanish |
|---|---|
| `/idea` | `/idea` |
| `/character` | `/personaje` |
| `/structure` | `/estructura` |
| `/outline` | `/escaleta` |
| `/chapter` | `/capitulo` |
| `/review` | `/revisar` |
| `/continuity` | `/continuidad` |
| `/style` | `/estilo` |
| `/synopsis` | `/sinopsis` |

`/save-version` and `/history` are general Bradbit commands, not part of
this kit.

## Manuscript format

Chapters use Markdown: `# Chapter N` for the chapter title, plain prose,
blank lines between paragraphs, and `* * *` for a scene break. Keep the
title page metadata in `bible/premise.md` or a dedicated
`manuscript/title-page.md` if needed. The editor previews Markdown and
can print/export a PDF; there is no DOCX export yet.

## Language and aliases

Kit instructions are English; the agent replies and writes the manuscript
in the language configured in Bradbit. Canonical command ids are English,
with Spanish aliases when the app runs in Spanish (`/personaje`,
`/estructura`, `/capitulo`, ...). The editor sends the canonical id to the
runtime.

## Versioning

The Git assistant is a general Bradbit capability. `/save-version`
inspects the working tree, summarizes the changes, proposes a version
name and asks for approval. It only commits after the user approves.
Never commit secrets or generated `exports/`.

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
