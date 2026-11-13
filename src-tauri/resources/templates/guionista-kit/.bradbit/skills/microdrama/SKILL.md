---
name: microdrama
description: Use this skill to structure vertical web micro dramas (short episodes with an opening hook and a cliffhanger) — different from feature film or traditional series pacing.
i18n:
  es:
    name: Micro drama
    description: Usa este skill para estructurar micro dramas web (episodios cortos, verticales, con gancho inicial y cliffhanger) — distinto del ritmo de largometraje o serie tradicional.
---

# Micro drama (vertical web format)

## Goal
Structure stories in very short episodes (typically 1-3 minutes), designed
for vertical/mobile viewing, with episode-to-episode retention as the
primary design constraint.

## Format rules
- **Hook in the first 3-5 seconds** of every episode — there is no time
  for a slow setup.
- **A clear cliffhanger at the end of every episode**, pushing the viewer
  to the next one. Mark it explicitly in the outline: `CLIFFHANGER: ...`.
- **Big, readable emotions and information** — the format does not forgive
  excessive subtlety; twists must be clear even without full attention.
- **Few characters per episode** — usually 2-3 on screen.

## Process
1. Define the overall arc in large beats (you can use any method from
   `story-structure`, compressed).
2. Break the arc into episodes, each with its own hook + cliffhanger,
   using the scene format from `outline` plus the `CLIFFHANGER` field.
3. Save each episode as a separate file in `script/` (for example
   `ep01.fountain`, `ep02.fountain`).

## Example (Spanish)
```markdown
CLIFFHANGER: Elena reconoce la voz de su padre en la última cinta.
```

## Do not
- Do not apply feature-film pacing (extended setup, transitional scenes) —
  every episode must work on its own and as part of the chain.
