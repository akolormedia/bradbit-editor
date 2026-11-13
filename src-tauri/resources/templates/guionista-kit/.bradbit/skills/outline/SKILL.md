---
name: outline
description: Use this skill to break the chosen structure method into a scene-by-scene outline (what happens, where, who, dramatic function) before writing dialogue.
i18n:
  es:
    name: Escaleta
    description: Usa este skill para desglosar el método de estructura elegido en una escaleta escena por escena (qué pasa, dónde, quién, función dramática) antes de escribir diálogo.
---

# Outline

## Goal
Turn `structure/chosen-method.md` into a concrete list of scenes — the map
used to write the script, without dialogue yet.

## Scene format
```markdown
### Scene N — INT/EXT. LOCATION — DAY/NIGHT
**Dramatic function:** what this scene accomplishes in the story (not
what literally happens, but what it is for).
**What happens:** a 2-4 line summary.
**Characters:** list.
**Connects to:** the structure beat it belongs to.
```

## Example (Spanish)
```markdown
### Scene 1 — INT. ARCHIVO MUNICIPAL — NOCHE
**Dramatic function:** present Elena's routine and the first crack in the
official story.
**What happens:** Elena catalogs wet boxes before closing and finds a
reel that is not in the inventory.
**Characters:** Elena.
**Connects to:** Opening image / status quo.
```

## Process
1. Read `structure/chosen-method.md` and the whole bible.
2. Generate the scene list in order, grouped by act/sequence.
3. Flag scenes that could be merged (if there are too many short scenes
   in the same location) — for projects with few locations this is
   especially relevant.
4. Save to `structure/outline.md`.
5. Before moving to `write-scene`, confirm with the user that the outline
   is approved — it is cheaper to fix it here than to rewrite full scenes
   later.

## Do not
- Do not write dialogue in the outline — only function and summary.
- Do not generate a scene without a clear dramatic function; if you do
  not know what it is for, ask the user or cut it.
