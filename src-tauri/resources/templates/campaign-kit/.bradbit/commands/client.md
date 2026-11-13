---
name: Client
description: Creates or updates the client folder, brand manual and contacts.
agent: account-manager
i18n:
  es:
    name: Cliente
    description: Crea o actualiza la carpeta del cliente, el manual de marca y los contactos.
    aliases: [cliente]
---
Use the `client-context` skill. Copy `clients/_template/` to
`clients/<client>/` if it does not exist, then fill `client.md`,
`contacts.md` and `brand/`. If the client has a PDF brand book, keep it
in `references/` and create a Markdown summary in `brand/manual.md`.
