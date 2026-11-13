# Project instructions

This file is read by Bradbit when the project opens. It is the general
contract for every skill and agent working in this repository.

## Language
- Instructions in this kit are written in English.
- Always follow the app language policy: reply and write creative content
  in the language configured in Bradbit.
- Check `bible/premise.md` for the project's tone and voice.

## Consistency rules
- Before writing or changing any scene, character or structure beat, read
  the whole `bible/` (premise, characters, world, chronology). The bible
  is the source of truth for the story world.
- If you need to introduce a new fact (a place, a world rule, a character
  trait) that is not in the bible, ask the user first, or add it and tell
  them.
- Never contradict the bible without explicitly flagging it as a proposed
  change.

## Script format
The delivery format is Fountain (see the `fountain-format` skill). Script
files live in `script/`, one file per act, episode or block as the project
requires.

## Working mode
- By default, propose and ask before writing large blocks (a full scene,
  an entire act). Small steps (an idea, a list, a character sheet) can be
  handled directly.
- The user may ask for "autonomous mode" for a specific task; in that
  case, move forward without asking at every step, but summarize what you
  did and which decisions you made at the end.
- When acting as editor/script editor (the `script-editor` skill), do not
  rewrite: give notes. Rewriting is the `screenwriter` agent's job, not
  the `editor`'s.

## Versioning
- At meaningful milestones (premise approved, structure approved, a scene
  or act complete, a revision pass), suggest **Save version**.
- Use the general `git-versioning` skill and the `/save-version` command
  provided by Bradbit (not by this kit).
- Never run `git commit` without explicit approval. Never commit secrets
  or generated `exports/` files.

## Repository structure
```
AGENTS.md            this file
bible/               premise, characters, world, chronology — the source of truth
research/            research notes and sources
structure/           chosen method, outline, treatment
script/              .fountain script files
notes/               development notes and script-editor notes
.bradbit/            skills, agents and commands for this kit
```
