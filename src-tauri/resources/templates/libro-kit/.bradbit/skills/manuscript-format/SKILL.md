---
name: manuscript-format
description: Use this skill to keep the manuscript consistent in Markdown — title page, chapter headings, scene breaks, word count and export.
i18n:
  es:
    name: Formato de manuscrito
    description: Usa este skill para mantener el manuscrito consistente en Markdown — portada, títulos de capítulo, saltos de escena, conteo de palabras y exportación.
---

# Manuscript format

## Goal
Keep the manuscript clean, consistent and ready to read or print.

## Rules
- One chapter per file in `manuscript/` (`ch01.md`, `ch02.md`, ...).
- Chapter heading: `# Chapter N` or `# Capítulo N` consistently.
- Scene break: `* * *` on its own line.
- Plain prose; blank line between paragraphs; no manual indentation.
- Title page metadata in `manuscript/title-page.md` (template included):
  title, author, genre, word count.
- Keep POV/tense consistent with `bible/style.md`.

## Word count
Use the editor or a word-count tool per chapter and total. Record the
target in `bible/premise.md`.

## Export
The editor previews Markdown and can print/export a PDF. There is no DOCX
export yet; if a publisher asks for DOCX, explain the limitation and
provide a clean Markdown/PDF first.

## Example (Spanish)
```markdown
# Capítulo 1

La carta estaba doblada en cuatro.

* * *

Julia no recordaba haber cerrado la puerta.
```

## Do not
- Do not mix chapter numbering styles.
- Do not use tabs or multiple blank lines for layout.
