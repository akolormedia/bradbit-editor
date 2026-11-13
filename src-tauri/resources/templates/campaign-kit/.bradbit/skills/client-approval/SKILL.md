---
name: client-approval
description: Use this skill to keep status and approvals current — who approved what, when, and what is still pending.
i18n:
  es:
    name: Aprobaciones del cliente
    description: Usa este skill para mantener el estado y las aprobaciones al día — quién aprobó qué, cuándo y qué sigue pendiente.
---

# Client approval

## Goal
Make the campaign's status and approvals visible and trustworthy.

## Files
- `campaigns/<campaign>/status.md`: status, next steps, owners, dates,
  blockers, decisions.
- `campaigns/<campaign>/approvals.md`: date, deliverable, approver,
  status, comments.

## Rules
- Record an approval only after explicit confirmation from the named
  approver.
- Statuses: draft, in review, approved, rejected, changes requested.
- Flag scope changes and timeline risks.
- Never mark something approved to keep the project moving.

## Example (Spanish)
| Fecha | Entregable | Aprueba | Estado | Comentarios |
|---|---|---|---|---|
| 2026-05-12 | Guion TV 30s | Laura (cliente) | approved | "Ok, adelante" |

## Do not
- Do not invent an approver or a date.
- Do not hide a blocker in the notes; put it in `status.md`.
