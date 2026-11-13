---
name: fountain-format
description: Fountain format rules so the whole script stays consistent and compatible with standard readers/converters (including Celtx and other programs).
i18n:
  es:
    name: Formato Fountain
    description: Reglas de formato Fountain para que todo el guion salga consistente y sea compatible con lectores/conversores estándar (incluida su importación a Celtx u otros programas).
---

# Fountain format

## What it is
Fountain is plain text with simple conventions that any screenwriting
program recognizes (scene headings, characters, dialogue, action,
transitions). It is the source of truth for this kit; other formats (PDF,
.fdx, Celtx) are exported from it.

## Key rules
- **Scene heading:** `INT. LOCATION - DAY` or `EXT. LOCATION - NIGHT` in
  uppercase, unnumbered (numbering is added on export).
- **Character:** name in uppercase, on its own line, before the dialogue.
- **Parenthetical:** a separate line in parentheses, right after the
  character name or inside the dialogue for a short pause. Use sparingly.
- **Action:** normal text, present tense, no special indentation.
- **Transitions:** uppercase, right-aligned on final export (`CUT TO:`,
  `FADE TO BLACK:`) — in the Fountain file they are written in uppercase
  followed by a colon.
- **Production or writer notes:** `[[like this, in double brackets]]` —
  they are not exported to the final PDF unless requested.
- **Title:** a metadata block at the top of the file:
  ```
  Title: <Title>
  Credit: Written by
  Author: <Name>
  Draft date: <date>
  ```

## Example (Spanish)
```fountain
Title: EL ARCHIVO DEL SILENCIO
Credit: Escrito por
Author: Equipo Creativo
Draft date: 2026

INT. ARCHIVO MUNICIPAL - NOCHE

Un sótano largo iluminado por tubos fluorescentes que parpadean.
```

## Verification
Before accepting a scene, check:
- Does every scene heading have INT/EXT, location and DAY/NIGHT?
- Are character names uppercase and exactly matching
  `bible/characters/` (same name every time)?
- Is there any dialogue without a character name above it?

## Do not
- Do not mix film script format with stage play or novel format in the
  same file.
- Do not rename a character mid-script (e.g. "CARLOS" in one scene and
  "THE FATHER" in another) unless it is a deliberate, flagged story
  decision.
