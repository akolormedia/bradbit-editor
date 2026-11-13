---
name: git-versioning
description: Use this skill to inspect Git changes, propose a human-readable version, and commit only after explicit approval.
i18n:
  es:
    name: Versionado con Git
    description: Usa este skill para revisar cambios de Git, proponer una versión en lenguaje humano y hacer commit solo después de una aprobación explícita.
---

# Git versioning

## Goal
Help the author save a meaningful version of the project without exposing
raw Git output or committing anything without permission.

## Before proposing a version
1. Check that the project is a Git repository. If it is not, explain the
   benefit and offer `git init` with approval; do not initialize silently.
2. Run `git status --short` to see changed, added and untracked files.
3. Run `git diff --stat` and `git diff` to understand the changes. Do not
   dump the full diff to the user; use it to write the summary.
4. Identify secrets, credentials, `.env` files and generated `exports/`
   files. They must stay out of the commit.

## What to present
- A 2-4 line summary in the user's language of what changed.
- The list of files that will be included.
- A proposed version name and commit message in the user's language.
- A direct question: "¿Guardo esta versión?" / "Save this version?"

## After explicit approval
1. Stage only the approved paths, for example:
   `git add bible/premise.md structure/outline.md script/act-1.fountain`
2. Commit with the approved message:
   `git commit -m "<message>"`
3. Show the short commit hash and a one-line summary.

## Never
- Never commit without explicit approval.
- Never rewrite history, force push, amend or delete branches.
- Never include secrets, tokens, keys, `.env` files or generated
  `exports/`.
- Never use `git add -A` unless the user explicitly approved every
  change in the working tree.
