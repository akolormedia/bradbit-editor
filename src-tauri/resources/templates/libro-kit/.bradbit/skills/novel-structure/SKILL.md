---
name: novel-structure
description: Use this skill to choose and apply a novel structure method, from three acts to Save the Cat, Hero's Journey, Story Circle, eight sequences or seven-point.
i18n:
  es:
    name: Estructura de novela
    description: Usa este skill para elegir y aplicar un método de estructura de novela, desde tres actos hasta Save the Cat, viaje del héroe, Story Circle, ocho secuencias o siete puntos.
---

# Novel structure

## Goal
Choose a structure method and apply it to the premise and characters,
producing beats that can become chapters.

## Available methods
Read the corresponding file in `methods/` before explaining or applying:
- `methods/three-act.md`
- `methods/save-the-cat.md`
- `methods/hero-journey.md`
- `methods/story-circle.md`
- `methods/eight-sequences.md`
- `methods/seven-point.md`

## Process
1. If the user has not chosen, show the options in one line each and ask.
2. Apply the beats to the premise and characters already in the bible.
3. Save `structure/chosen-method.md` with the method, why it fits, and
   the beats specific to this book.
4. This file feeds the `chapter-outline` skill.

## Example (Spanish)
> **Punto medio:** Julia publica el primer fragmento de las cartas y
> descubre que la mujer acusada era su tatarabuela.

## Do not
- Do not force a method the user does not want.
- Do not skip the book-specific beat sheet.
