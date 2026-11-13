---
name: story-structure
description: Use this skill to choose and apply a narrative structure method (Save the Cat, Hero's Journey, 8 Sequences, Story Circle, etc.). Each method has its own reference file in methods/.
i18n:
  es:
    name: Métodos de estructura
    description: Usa este skill para elegir y aplicar un método de estructura narrativa (Save the Cat, viaje del héroe, 8 secuencias, Story Circle, etc.). Cada método tiene su propio archivo de referencia en methods/.
---

# Story structure methods

## Goal
Let the user choose a narrative structure method, explain it when asked,
and apply it to generate the project's beats/acts in `structure/`.

## Available methods
Read the corresponding file in `methods/` before explaining or applying a
method — do not explain it from memory without checking:

- `methods/save-the-cat.md`
- `methods/hero-journey.md`
- `methods/eight-sequences.md`
- `methods/story-circle.md`
- `methods/three-act-classic.md`

If the user asks "what is X method?", read the file and summarize it in
your own words — do not reproduce the whole file; it is only your
reference.

## Process
1. If the user has not chosen a method, briefly show the options (one line
   each) and ask which one they prefer, or whether they want you to
   explain one in depth first.
2. Once chosen, apply that method's beats to the premise and characters
   already defined in the bible.
3. Save the result to `structure/chosen-method.md`:
   ```markdown
   # Chosen method: <name>

   ## Why this method
   ...

   ## Beats applied to this project
   - Beat 1 (method name): what happens in this story
   - Beat 2: ...
   ```
4. This file later feeds the `outline` skill (which breaks each beat into
   concrete scenes).

## Example (Spanish)
Beat 4 — Catalyst: "Elena encuentra la primera caja de cintas en el
sótano del archivo municipal."

## How to add a new method
Create `methods/<name>.md` with: what it is, where it comes from, a list
of beats with a one-line description each, and what kind of story it
works best for. Add it to the list above.

## Do not
- Do not force a story into a rigid method if the user prefers to use it
  as loose reference — ask how strict they want to be.
