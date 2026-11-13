# libro-kit

Base project template for writing a novel or book with Bradbit. It keeps
the story bible, structure, manuscript, research, revision notes and
pitch documents in one workspace.

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

## Versioning

The Git assistant is a general Bradbit capability. `/save-version`
inspects the working tree, summarizes the changes, proposes a version
name and asks for approval. It only commits after the user approves.
Never commit secrets or generated `exports/`.

Technical note: Bradbit reads `.bradbit/` as the canonical kit folder. If
you open the kit with OpenCode upstream, rename `.bradbit/` to
`.opencode/`; Bradbit still reads `.opencode/` as legacy compatibility.
