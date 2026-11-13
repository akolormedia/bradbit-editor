---
name: characters
description: Use this skill to create or develop character sheets in the bible — arc, voice, relationships, dramatic engine. One file per character in bible/characters/.
i18n:
  es:
    name: Personajes
    description: Usa este skill para crear o desarrollar fichas de personaje en la biblia — arco, voz, relaciones, motor dramático. Un archivo por personaje en bible/characters/.
---

# Characters

## Goal
Build character sheets that a screenwriter (human or AI) can use to write
consistent dialogue and believable decisions.

## Standard sheet
Save each character in `bible/characters/<name>.md`:

```markdown
# <Name>

## Role in the story
Protagonist / antagonist / supporting / etc. What dramatic function they serve.

## Want / Need
What the character thinks they want (conscious desire) vs. what they
actually need (arc). These can conflict.

## Arc
Where they start and where they arrive emotionally. If the character does
NOT change (comedic supporting characters, for example), say so explicitly.

## Voice
How they speak: vocabulary, rhythm, verbal tics, what they would never
say. 2-3 sample lines of their dialogue if they already exist.

## Relationships
Who they relate to and how (tension, alliance, shared history).

## Physical and production details
Age, appearance if relevant for casting/production.

## Special rules
Any special constraint (e.g. "we never see them speak", "they only
communicate through X").
```

## Process
1. If the character already exists in earlier material (adaptation),
   extract what the source already establishes before inventing anything.
2. Ask the user for what is missing — do not invent arc or motivation
   without confirmation, unless they ask you to propose options.
3. Check against `bible/premise.md` that the character serves the theme.
4. If two characters have similar voices, flag it — they need to be
   differentiated before writing scenes.

## Voice example (Spanish)
> ANA
> No vine a discutir. Vine a que me digas qué pasó con las cintas.

> ELENA
> Si te lo digo, ya no vas a poder mirar esta ciudad de la misma forma.

## Do not
- Do not give a character a psychological revelation out of nowhere in
  the middle of writing without updating their sheet.
- Do not write a character's dialogue without reading their sheet first.
