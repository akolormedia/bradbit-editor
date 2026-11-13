---
name: client-context
description: Use this skill to create and maintain the client folder — overview, contacts, brand manual, voice, visual identity, mandatories and history.
i18n:
  es:
    name: Contexto del cliente
    description: Usa este skill para crear y mantener la carpeta del cliente — overview, contactos, manual de marca, voz, identidad visual, mandatorios e historial.
---

# Client context

## Goal
Keep one reliable client folder that every campaign can reuse.

## Process
1. Copy `clients/_template/` to `clients/<client>/` if it does not exist.
2. Fill `client.md`: overview, business objectives, audience, category,
   brand platform summary, stakeholders, scope and links.
3. Fill `contacts.md` with roles and decision areas. No passwords or
   sensitive personal data.
4. Fill `brand/manual.md`, `brand/voice.md`,
   `brand/visual-identity.md` and `brand/mandatories.md`.
5. Log past campaigns in `history/campaigns.md`.
6. Keep original PDFs/decks in `references/` and approved assets in
   `assets/`.

## Source of truth
- If a client document contradicts the folder, flag it and ask which is
  current.
- If a PDF manual is needed for writing, create a Markdown summary in
  `brand/manual.md`; the agent reads Markdown reliably, PDFs not always.

## Example (Spanish)
> **Cliente:** Hotel Mar Abierto.
> **Audiencia:** parejas de 30-45 años que trabajan remoto y buscan
> desconectar sin viajar lejos.

## Do not
- Do not invent a brand purpose, positioning or legal mandatory.
- Do not store credentials or private client data.
