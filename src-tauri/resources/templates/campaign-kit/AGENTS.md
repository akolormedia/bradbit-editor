# Project instructions

This file is read by Bradbit when the project opens. It is the general
contract for every agent and skill working in this client workspace.

## Language
- Instructions in this kit are written in English.
- Always follow the app language policy: reply and write deliverables in
  the language configured in Bradbit.
- Client documents may be in Spanish, English or both. Preserve the
  language of the source document unless the user asks otherwise.

## Before writing
1. Identify the **client** and the **campaign**.
2. Read `clients/<client>/client.md`, `brand/manual.md`,
   `brand/voice.md`, `brand/visual-identity.md`,
   `brand/mandatories.md` and `history/campaigns.md`.
3. Read `library/agency-manual.md`, `library/creative-standards.md` and
   the relevant files in `library/channel-specs/`.
4. Read the campaign `brief.md` and, when it exists, `strategy.md`.

## Source of truth
- The client's `brand/` folder is the source of truth for brand facts,
  voice, visual identity and legal mandatories.
- The campaign `brief.md` is the source of truth for objectives,
  audience, budget, timing and deliverables.
- Do not overwrite the brief, the strategy or a client manual without
  explicit approval and a saved version.
- If you need a new client fact, claim, price, testimonial or data point,
  ask the user first. Never invent it.

## Brand and legal
- Follow `brand/voice.md` and `brand/mandatories.md` in every piece.
- Flag missing legal text, substantiation or approvals with `[PENDIENTE]`
  / `[TODO]` instead of filling it in.
- Never present an assumption as a verified fact.

## Approvals
- Record approvals in `campaigns/<campaign>/approvals.md`: date,
  deliverable, approver, status and comments.
- Never mark something as approved without explicit confirmation from the
  user or the named approver.
- Keep `status.md` current: status, next steps, blockers, owners, dates.

## Versioning
- At meaningful milestones (brief approved, strategy approved, concept
  approved, copy approved, final deliverables), suggest **Save version**.
- Use the general `git-versioning` skill and `/save-version` provided by
  Bradbit (not by this kit).
- Never commit without explicit approval. Never commit secrets, client
  credentials or large generated exports.

## Repository structure
```
AGENTS.md                  this file
clients/                   one folder per client
  <client>/
    client.md              overview, stakeholders, scope
    contacts.md            roles and contacts (no secrets)
    brand/                 manual, voice, visual identity, mandatories
    history/               past campaigns and learnings
    assets/                logos, images, fonts (compressed)
    references/            PDFs, decks, original brand books
campaigns/                 one folder per campaign
  <campaign>/
    brief.md               campaign brief (source of truth)
    strategy.md            audience, insight, positioning, proposition
    research/              market, category, audience, culture
    concepts/              creative territories, big idea, rationales
    copy/                  headlines, body, scripts, social, email, CTA
    art-direction/         references, moodboard brief, shot list
    deliverables/          channel-ready pieces
    production/            specs, timing, suppliers
    approvals.md           approval log
    status.md              status and next steps
    notes/                 meetings and working notes
library/                   agency manuals, standards, channel specs
exports/                   generated PDFs and decks
```

## Asset rules
- Keep client assets in `clients/<client>/assets/`.
- Prefer compressed images and fonts. For files larger than ~5 MB, use
  Git LFS or an external link documented in `assets/README.md`.
- Keep original PDFs and decks in `clients/<client>/references/`. If the
  agent needs a manual, ask for a Markdown version or convert the key
  sections into `brand/manual.md`.
