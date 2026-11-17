# campaign-kit

[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Bradbit writing kit](https://img.shields.io/badge/Bradbit-writing%20kit-1c1917)](https://github.com/akolormedia/bradbit-editor)

> Part of the Bradbit writing kits. Use it in **Bradbit Editor** or with `bradbit init`.

Base workspace for advertising campaigns with Bradbit. One project holds
**one client** and all of its campaigns, brand manuals and references.

## When to use it
Use this kit in an agency or freelance practice where a client has
multiple campaigns. Keep the client context and brand once, then create a
campaign folder for each brief.

## Workflow
1. `/client` — onboard the client and fill `brand/`.
2. `/brief` — campaign brief.
3. `/strategy` — audience, insight, positioning and proposition.
4. `/concept` — creative territories and the big idea.
5. `/copy` and `/art-direction` — produce the work.
6. `/deliverable` — channel-ready pieces.
7. `/deck` — Markdown client deck.
8. `/status` — status and approvals.

## Creating a project
From the app: **New project** → **Advertising campaigns (campaign-kit)**.
From the CLI:
```bash
bradbit init my-client --kit campaign-kit
```

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

## Language and aliases

Kit instructions are English; the agent replies and writes deliverables in
the language configured in Bradbit. Canonical command ids are English,
with Spanish aliases when the app runs in Spanish (`/cliente`,
`/estrategia`, `/concepto`, ...). The editor sends the canonical id to the
runtime.

## Versioning

The Git assistant is a **general Bradbit capability**, not part of this
kit. When available in the app, `/save-version` inspects the working tree,
summarizes the changes, proposes a version name and asks for approval. It
only commits after the user approves. Never commit secrets or generated
`exports/`.

Technical note: Bradbit reads `.bradbit/` as the canonical kit folder. If
you open the kit with OpenCode upstream, rename `.bradbit/` to
`.opencode/`; Bradbit still reads `.opencode/` as legacy compatibility.

## Documentation

- [Bradbit Editor](https://github.com/akolormedia/bradbit-editor)
- [Bradbit CLI](https://github.com/akolormedia/bradbit-cli)
- [Installation guide](https://github.com/akolormedia/bradbit-editor/blob/main/docs/INSTALL.md) · [Español](https://github.com/akolormedia/bradbit-editor/blob/main/docs/INSTALL.es.md)

## Contributing

Issues and pull requests are welcome. Keep the kit declarative: agents, commands and skills belong in `.bradbit/`; instructions stay in English, canonical command IDs in English, and user-facing examples in Spanish.

## License

MIT. See [`LICENSE`](LICENSE). The kit is content; **Bradbit Editor** and **Bradbit CLI** are also MIT licensed.
