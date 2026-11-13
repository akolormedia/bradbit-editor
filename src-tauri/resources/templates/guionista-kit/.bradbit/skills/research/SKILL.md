---
name: research
description: Use this skill to research cultural, historical, technical or reference context for the script, with web access. Save everything in research/ with cited sources.
i18n:
  es:
    name: Investigación
    description: Usa este skill para investigar contexto cultural, histórico, técnico o de referencias para el guion, con acceso a web. Guarda todo en research/ con fuentes citadas.
---

# Research

## Goal
Gather verifiable context (cultural, historical, technical,
references/comparables) that supports script decisions, without inventing
data or treating personal impressions as facts.

## Process
1. **Define the research question** with the user: what they need to know
   and which scene or decision it supports.
2. **Search the web** when the question requires it (customs, language,
   objects, current social context). Prioritize direct and recent sources
   over forums or second-hand summaries.
3. **Take notes, do not copy.** Summarize in your own words, cite the
   source (title + link), never reproduce long paragraphs.
4. **Distinguish** in your notes between:
   - Verified fact (with source)
   - Reported custom/language usage (with source, but variable — not every
     speaker uses it the same way)
   - Your interpretation or suggestion (mark it as such)
5. **Save to `research/<topic>.md`**:
   ```markdown
   # Research: <topic>

   ## Question
   ...

   ## Findings
   - Finding 1 (source: ...)
   - Finding 2 (source: ...)

   ## Relevance to the script
   Which scene, character or detail uses this.
   ```

## Example (Spanish)
```markdown
## Hallazgos
- En Venezuela, el uso de aplicaciones de pago móvil se popularizó rápido
  y convive con el efectivo (fuente: ...).
- El término "cambur" se usa de forma distinta según la región; no
  asumir que es universal (fuente: ...).
```

## Cultural context (Venezuela / Latin America)
When the project specifies a country or region, prioritize local and
recent sources on language, customs and everyday objects — usage changes
quickly (slang, social technology such as payment apps, delivery, etc.).
Verify before assuming something is still current.

## Do not
- Do not present an assumption as researched fact.
- Do not use a single source to claim a widespread custom; note whether it
  is specific to a region or generation.
