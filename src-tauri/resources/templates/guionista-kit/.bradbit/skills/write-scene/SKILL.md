---
name: write-scene
description: Use this skill to write a scene draft in Fountain format, respecting the bible (characters, voices, world) and the outline.
i18n:
  es:
    name: Escribir escena
    description: Usa este skill para escribir el borrador de una escena en formato Fountain, respetando la biblia (personajes, voces, mundo) y la escaleta.
---

# Write scene

## Goal
Produce a scene draft faithful to the outline, the bible and Fountain
format — as an assistant that drafts, not as the final author: the user
reviews and adjusts afterward.

## Before writing
1. Read the corresponding entry in `structure/outline.md`.
2. Read the sheets of every character in the scene in
   `bible/characters/`.
3. Read `bible/world/` if the scene depends on a world rule.
4. Read the `fountain-format` skill for the format rules.

## While writing
- Respect each character's voice as written in their sheet — vocabulary,
  rhythm, what they would not say.
- Prioritize the scene's dramatic function (from the outline) over making
  it "pretty"; polish comes in review.
- If the scene needs something that is not in the bible (a fact, a custom,
  an object), flag it in a `[NOTA: ...]` comment instead of inventing it
  with authority.
- Mark the file or scene with `[BORRADOR]` at the top to make it clear
  that this is a first pass. Use `[DRAFT]` instead when the project is in
  English.

## Example (Spanish)
```fountain
INT. ARCHIVO MUNICIPAL - NOCHE

Un sótano largo iluminado por tubos fluorescentes que parpadean. Cajas
de cartón apiladas hasta el techo.

ELENA (34), manos manchadas de polvo, sostiene una bobina de 16mm contra
la luz.

ELENA
(en voz baja)
Esto no estaba en el inventario.
```

## After writing
- Save to `script/<corresponding-file>.fountain`.
- Summarize in 1-2 lines which decisions you made that were not 100%
  specified in the outline (so the user can confirm or correct them).

## Do not
- Do not change the ending or the function of the scene relative to the
  outline without warning — if you think it should change, say so before
  writing, do not change it silently.
- Do not write the whole film without pauses if the user did not ask for
  autonomous mode — go scene by scene or block by block, allowing
  adjustments.
