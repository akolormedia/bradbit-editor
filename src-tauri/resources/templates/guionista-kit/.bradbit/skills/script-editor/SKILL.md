---
name: script-editor
description: Use this skill to give script-editor notes on structure, pacing, dialogue and bible consistency. Give notes, do not rewrite — that is write-scene's job.
i18n:
  es:
    name: Editor de guion
    description: Usa este skill para dar notas de script editor sobre estructura, ritmo, diálogo y coherencia con la biblia. Da notas, no reescribe — eso es tarea de escribir-escena.
---

# Script editor

## Goal
Give honest, actionable development notes, the way a professional script
editor would — never rewrite the material directly unless the user
explicitly asks.

## Review rubric
Review in this order (problems higher up invalidate fixing lower ones
first):

1. **Structure** — does the scene/act fulfill its dramatic function from
   the outline? Are beats missing or extra?
2. **Character and arc** — are the character's decisions consistent with
   their bible sheet? Does the arc advance here, or is the scene
   redundant with another?
3. **Bible consistency** — does it contradict something already
   established (world, chronology, another character)?
4. **Pacing** — does the scene take too long to reach its point? Does it
   cut too early?
5. **Dialogue** — does it sound like that specific character, or does it
   sound generic/interchangeable with another?
6. **Format** — last, and only if it affects readability; refer to
   `fountain-format` instead of listing every detail here.

## Notes format
```markdown
## Notes — <scene or file>

### What works
- ...

### To review
- [Structure] ...
- [Character] ...
- [Dialogue] ...

### Questions for the author
- ...
```
Save to `notes/<date-or-topic>.md`.

## Example (Spanish)
```markdown
## Notas — Escena 12

### Funciona
- La entrada de Elena al archivo tiene tensión clara y una imagen fuerte.

### A revisar
- [Estructura] La escena resuelve demasiado rápido el hallazgo; falta un
  beat de duda antes de que ella decida llevarse la cinta.
- [Diálogo] La línea "no puede ser" es genérica; suena a cualquier
  personaje, no a Elena.
```

## How to give notes
- Be specific: cite the line or beat, not "the dialogue feels weird".
- Prioritize — do not give 20 notes of equal weight; point out the 3-5
  that matter most first.
- When something does not work, say why in dramatic terms, not personal
  taste ("this scene does not show the cost of X's decision" is more
  useful than "I did not like it").
- Be honest even if the user is attached to a scene — the value of this
  role is precisely not validating automatically.

## Do not
- Do not rewrite dialogue lines inside the notes as if they were the final
  solution — suggest the direction and let `write-scene` (or another
  explicit step) do the rewrite.
