---
name: write-chapter
description: Use this skill to write a chapter draft in Markdown, respecting the outline, the bible and the book's voice.
i18n:
  es:
    name: Escribir capítulo
    description: Usa este skill para escribir el borrador de un capítulo en Markdown, respetando la escaleta, la biblia y la voz del libro.
---

# Write chapter

## Goal
Produce a chapter draft that advances the outline and stays consistent
with the bible and the style guide.

## Before writing
1. Read the chapter entry in `structure/outline.md`.
2. Read the relevant `bible/characters/`, `bible/world/`,
   `bible/chronology.md` and `bible/style.md`.
3. Read the previous chapter for voice, continuity and momentum.

## While writing
- Respect POV, tense and voice from `bible/style.md`.
- Give the chapter a clear turn or change; do not pad.
- Keep dialogue in character; keep description selective.
- Mark missing facts or research needs with `[NOTA: ...]`.
- Mark the draft with `[BORRADOR]` / `[DRAFT]`.

## After writing
- Save to `manuscript/ch##.md`.
- Update `bible/chronology.md` if the timeline changed.
- Summarize in 1-2 lines the decisions not fully specified in the
  outline.

## Example (Spanish)
> La carta estaba doblada en cuatro, como si alguien hubiera querido
> esconderla incluso de sí mismo. Julia la abrió sobre la mesa y leyó la
> primera línea dos veces antes de entender que no era una súplica.

## Do not
- Do not change the outline's ending or function without warning.
- Do not write the whole book without pauses unless the user asked for
  autonomous mode.
