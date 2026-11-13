# campaign-kit

Base workspace for advertising campaigns with Bradbit. One project holds
**one client** and all of its campaigns, brand manuals and references.

## Quick start

1. Copy this folder as the repository for the client:
   ```bash
   cp -r campaign-kit acme-campaigns
   cd acme-campaigns
   git init
   ```
2. Copy `clients/_template/` to `clients/<client>/` and fill
   `client.md`, `brand/` and `contacts.md`.
3. Copy `campaigns/_template/` to `campaigns/<year>-<campaign>/` and
   fill `brief.md` and (with the strategist) `strategy.md`.
4. Ask the agent for `/brief`, `/strategy`, `/concept`, `/copy`,
   `/art-direction`, `/deliverable`, `/deck` or `/review` as needed.
5. Save versions at milestones with `/save-version`.

## What is inside

### Clients
`clients/<client>/` stores the client context once:
`client.md`, `contacts.md`, `brand/`, `history/`, `assets/` and
`references/`.

### Campaigns
`campaigns/<campaign>/` stores the brief, strategy, research, concepts,
copy, art direction, deliverables, production, approvals, status and
notes.

### Library
`library/` stores the agency manual, creative standards, channel specs
and reusable templates.

## Agents

- `strategist` — brief, audience, insight, positioning, proposition,
  channel strategy.
- `copywriter` — concepts, headlines, body, scripts, social, email,
  landing, CTAs.
- `art-director` — visual territory, references, moodboard brief, shot
  list, layout notes.
- `creative-director` — critique, concept and brand consistency; gives
  notes, does not rewrite.
- `account-manager` — client context, status, approvals, timing, scope.
- `researcher` — market, category, competitors, audience and culture.

## Commands and Spanish aliases

| English | Spanish |
|---|---|
| `/brief` | `/brief` |
| `/client` | `/cliente` |
| `/strategy` | `/estrategia` |
| `/concept` | `/concepto` |
| `/copy` | `/copy` |
| `/art-direction` | `/direccion-arte` |
| `/review` | `/revisar` |
| `/deliverable` | `/entregable` |
| `/deck` | `/presentacion` |
| `/status` | `/estado` |

## Channels

Channel specs live in `library/channel-specs/`: social, digital/landing,
email, TV/radio, OOH and print. Social, digital/landing, email and
TV/radio are the initial priority; OOH and print remain as reference.
Always verify current platform dimensions and policies before producing
final assets.

## Presentations

`/deck` builds a Markdown deck outline in the campaign deliverables. The
editor can preview Markdown and export a PDF through the available print
flow; there is no slide editor yet.

## Assets and references

- `clients/<client>/assets/` for logos, images and fonts.
- `clients/<client>/references/` for PDFs, decks and original brand
  books. If the agent needs a manual, keep an editable Markdown version
  in `brand/manual.md`.
- For files larger than ~5 MB, use Git LFS or document an external link.

## Versioning

The Git assistant is a **general Bradbit capability**, not part of this
kit. When available in the app, `/save-version` inspects the working tree,
summarizes the changes, proposes a version name and asks for approval. It
only commits after the user approves. Never commit secrets or generated
`exports/`.

Technical note: Bradbit reads `.bradbit/` as the canonical kit folder. If
you open the kit with OpenCode upstream, rename `.bradbit/` to
`.opencode/`; Bradbit still reads `.opencode/` as legacy compatibility.
