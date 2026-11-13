# Project instructions

This file is read by Bradbit when the project opens. It is the general
contract for every agent and skill working on this book.

## Language
- Instructions in this kit are written in English.
- Always follow the app language policy: reply and write the manuscript
  in the language configured in Bradbit.
- Check `bible/premise.md` for genre, tone and audience, and
  `bible/style.md` for voice and prose rules.

## Source of truth
- `bible/` is the source of truth: premise, characters, world,
  chronology and style.
- Before writing or changing a chapter, read the relevant bible files and
  the previous chapter.
- If you need a new fact (a place, a rule, a character trait) that is not
  in the bible, ask the user first, or add it and tell them.
- Never contradict the bible without flagging it as a proposed change.

## Draft and revision
- Write in `manuscript/ch##.md`, one chapter per file.
- Mark first drafts with `[BORRADOR]` / `[DRAFT]`.
- By default, propose and ask before writing large blocks (a full
  chapter, a plot turn). Small steps (an idea, a character sheet, a
  scene beat) can be handled directly.
- The user may ask for autonomous mode for a specific task; summarize the
  decisions at the end.
- The `editor` agent gives notes; it does not rewrite. Rewriting is the
  `novelist` agent's job.

## Continuity
- Keep `bible/chronology.md` current when the story timeline changes.
- Log continuity issues and open threads in `notes/continuity.md`.
- Check names, dates, ages, world rules and object facts against the
  bible before finalizing a chapter.

## Versioning
- At meaningful milestones (premise approved, structure approved, a
  chapter or act complete, a revision pass), suggest **Save version**.
- Use the general `git-versioning` skill and `/save-version` provided by
  Bradbit (not by this kit).
- Never commit without explicit approval. Never commit secrets or
  generated `exports/`.

## Repository structure
```
AGENTS.md              this file
bible/                 premise, characters, world, chronology, style
structure/             chosen method and chapter outline
manuscript/            chapter files (ch01.md, ch02.md, ...)
research/              research notes and sources
notes/                 revision and continuity notes
pitch/                 logline, synopsis and query letter
exports/               generated PDFs
.bradbit/              skills, agents and commands for this kit
```
