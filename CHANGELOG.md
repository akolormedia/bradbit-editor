# Changelog

All notable changes to Bradbit Editor are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versioning follows [SemVer](https://semver.org/). `alpha` versions are early tests: behavior may change and there are no compatibility guarantees.

## [Unreleased]

Next alpha. Adds the three writing kits, the `.bradbit/` canonical folder, the general Git assistant and the language policy. **Only tested on macOS.**

### Added
- **Three bundled writing kits** in the new-project selector: **Screenwriting (`guionista-kit`)**, **Novel (`libro-kit`)** and **Advertising campaigns (`campaign-kit`)**. Each kit ships `AGENTS.md`, `.bradbit/` agents/commands/skills, its project structure and a `bradbit-kit.json` manifest.
- **`bradbit init --kit <id>`** in the CLI (default `guionista-kit`).
- **Language policy:** kit instructions are English; the editor writes `agent-language.md` and injects it through `OPENCODE_CONFIG_CONTENT.instructions`, so the agent replies and writes in the app language. Kits add `i18n.es` names, descriptions and aliases; Spanish users can type `/escena`, `/capitulo`, `/cliente`, etc.
- **General Git assistant:** `git-versioning` skill plus `/save-version` and `/history` commands, available in every project with or without a kit. Commits require explicit approval.
- **Kit manifests:** `bradbit-kit.json` with id, name, version, description, author, minimum Bradbit and contents.

### Changed
- **`.bradbit/` is the canonical kit folder.** `.opencode/` remains as legacy compatibility; `.bradbit` entries win when both define the same agent, command or skill.
- `guionista-kit` was rewritten in English with English IDs and Spanish examples/aliases; the `bible/`, `structure/`, `script/`, `research/` and `notes/` folders are in English.
- Kit project templates are copied without generated `exports/`.

### Fixed
- Git versioning no longer lives inside each kit; the general assistant avoids duplicated instructions and inconsistent behavior between kits.

### Known limitations
- The app is ad-hoc signed but not notarized. On first launch, allow it in **System Settings → Privacy & Security → Open Anyway**.
- Markdown decks and manuscripts can be printed/exported to PDF; there is no slide editor or DOCX export yet.
- Spanish command/agent IDs from previous test projects are not preserved; all existing projects are test projects.

## [0.1.0-alpha.4] - 2026-11-13

Fourth alpha. Fixes the downloaded macOS installer from `alpha.3`. **Only tested on macOS.**

### Fixed
- The `.app` bundle is now ad-hoc signed **after** the agent sidecar is embedded. `alpha.3` shipped the linker's ad-hoc signature, which became invalid when the sidecar and other resources were added, so macOS reported the app as **damaged** and refused to open it.
- The release workflow now verifies the bundle signature (`codesign --verify --deep --strict`) and fails if the app still carries the linker signature.

### Known limitations
- The app is ad-hoc signed but not notarized. On first launch, allow it in **System Settings → Privacy & Security → Open Anyway**.
- Only tested on macOS.

## [0.1.0-alpha.3] - 2026-11-13

> **Broken installer:** macOS reports the `alpha.3` app as damaged. Use `alpha.4`.

Third alpha. It bundles the Bradbit agent runtime and adds bring-your-own-key provider settings. **Only tested on macOS.**

### Added

**Agent runtime**
- The macOS app now bundles **`bradbit`** (Bradbit CLI `v0.1.0-alpha.1`, based on OpenCode `2.2.5`) as a Tauri sidecar. A separate OpenCode install is no longer required for the chat.
- Binary resolution order: bundled sidecar → `bradbit` on `PATH` → optional `opencode` fallback → `BRADBIT_OPENCODE_BIN`.
- The terminal's **Bradbit** preset launches the bundled runtime; Claude Code remains optional.
- Source builds download the pinned sidecar with `npm run fetch:bradbit`; the release workflow verifies it inside the `.app`.

**Settings → AI and models**
- **BYOK providers:** connect DeepSeek, OpenRouter, OpenAI, Anthropic, OpenCode or a custom OpenAI-compatible endpoint with its own `baseURL` and model.
- API keys are stored in the **macOS Keychain**; `settings.json` only stores provider metadata.
- Keys are injected into `bradbit serve` through environment variables. Custom providers receive an inline `OPENCODE_CONFIG_CONTENT`; nothing is written to the project.
- The model catalog refreshes after saving or removing a key.
- Missing provider/model errors now show a **Configure models** button that opens Settings directly.

### Changed
- Chat errors, permission prompts and model copy refer to the **agent**, not OpenCode.
- The README and build instructions reflect the bundled runtime and BYOK flow.
- The DMG now includes the agent runtime, so the installer is larger than the previous alpha.

### Fixed
- The editor now waits for the runtime model catalog to finish loading before reporting that no models are available. This fixes a startup race that appeared when a provider key was injected through the environment.

### Known limitations
- The app is ad-hoc signed but not notarized.
- The bundled runtime is used inside the editor; the standalone `bradbit` CLI is distributed separately from the `bradbit-cli` repository.
- Creating a project by chatting from the welcome screen (`T-2.5.10`) remains deferred.
- BYOK currently stores keys in the macOS Keychain only.
- Only tested on macOS.

## [0.1.0-alpha.2] - 2026-11-08

Second alpha. This release focuses on the editor and chat polish from Story 2.5. **Only tested on macOS.**

### Added

**Chat**
- Agent responses are rendered as Markdown (headings, lists, tables, code, quotes and links) instead of plain text.
- Session rename from the tab: double-click, edit inline and press Enter. The title is persisted in OpenCode.
- Questions and answers live inside the chat history. Answered cards show the question, its options and the selected answer with a check.
- Pending questions and permissions stay actionable inside the scroll, not in a fixed area above the composer.

**Editor**
- Markdown/MDX documents open in preview by default, inside a centered reading card with border, padding and shadow.
- Markdown/MDX syntax highlighting in edit mode: headings, bold, italics, links, lists, quotes, code fences and markers.
- Monochrome Markdown preview: hierarchy is kept by size, weight and spacing instead of colored headings.
- **Fountain on-screen preview:** paginated screenplay pages (US Letter, Courier, page numbers, `(MORE)` / `(CONT'D)`) with an Edit/Preview toggle. Each tab remembers its mode.
- Color themes in *Settings → Appearance*: Bradbit, Nord, Solarized and Gruvbox, each with light and dark variants. They apply to the app, editor highlighting, previews and terminal.

### Changed
- The welcome screen no longer shows **Open guionista-kit folder** as a primary action. The kit remains available as a template in **New project**.
- The file explorer reserves no space for hidden hover actions: file names use the full width at rest, and hover actions no longer push the tree downward.

### Fixed
- Session rename now accepts `204 No Content` from OpenCode and keeps the optimistic title update.
- Fountain highlighting classifies the whole document, including blank lines. Character cues are green and dialogue has its own red color instead of looking like action text.
- Remaining Spanish Rust error messages were translated.

### Known limitations
- Creating a project by chatting from the welcome screen (`T-2.5.10`) is deferred: the exploratory branch is saved but not included in this alpha. Project creation remains available through **New project**.
- The app is not signed or notarized. On first launch on macOS, right-click the app and choose **Open**.
- The chat requires OpenCode to be installed and configured.
- Only tested on macOS.

## [0.1.0-alpha.1] - 2026-11-07

First alpha release. It is meant to test the complete workflow: writing, versioning with Git, and working with the OpenCode agent. **Only tested on macOS.**

### Added

**Editor and files**
- Open any folder on disk as a project, without proprietary configuration files.
- File explorer with new file, new folder, rename and delete (with confirmation), plus a quick filter by name or path.
- Document tabs: a single click opens a preview tab and a double click pins it. Unsaved-changes indicator and safe close.
- CodeMirror 6 editing: undo and redo per tab, find and replace, word wrap, line numbers, and bold/italic for Markdown.
- Markdown and MDX with rendered preview and an outline of headings and scenes.
- Fountain with highlighting for scenes, characters and dialogue, and PDF export with screenplay formatting (`⌘E`).
- New file as an "Untitled" tab that asks for a name only when saved (`⌘S`), inside the project folder.
- Quick open (`⌘P`) and find in project (`⌘⇧F`).
- External changes in real time: the tree and tabs update when another tool modifies files. Unsaved changes are never overwritten.
- Native macOS menu with shortcuts, and an application menu inside the window.

**Project templates**
- New project from templates: Audiovisual script (`guionista-kit`) and Blank project.
- User templates in `~/Library/Application Support/Bradbit/templates/`, and "Save project as template".

**Git and versions**
- Git status badges in the explorer and on tabs.
- Integrated Diff viewer, with discard and confirmation.
- Versions panel: current changes, save version, history, parallel drafts (branches) and file restore.
- GitHub sync: account token stored in the macOS Keychain, publish a repository, push and pull changes, and pull requests.

**OpenCode chat**
- Automatic start of `opencode serve` for the open folder.
- Multiple sessions per project, with history restored when the app reopens.
- Streaming responses, with a Stop button and retry.
- Live tools with their status, permissions (Allow once, Always allow or Reject) and interactive questions.
- Project kit: agents, commands (`/`) and skills (`@` or `＋`) discovered from `.opencode/` and `.bradbit/`.
- Model and variant picker with search, recents and management of visible models.
- Send the editor selection to the chat (`↗`).

**Integrated terminal**
- Native terminal (PTY) with Shell, `opencode`, `claude` or a custom command, with restart and clear.

**Interface**
- Unified line icons, with same-size icon buttons across the app.
- Minimal top bar with the project name and the Chat and Editor toggles.
- Bottom bar with the left panel toggle, sections (Files, Outline, Versions), terminal and Git branch.
- Chat and editor as independent panels, with solo-chat, solo-editor and both states.
- Settings organized by categories (General, Appearance, Editor, Files & search, Terminal, Git, GitHub, AI & models), with search.

### Fixed
- The explorer divider no longer jumps when the chat is open: the width is computed from the drag offset.

### Known limitations
- Agent responses are shown as plain text. Markdown rendering is planned for `T-2.5.1`.
- Markdown documents open in edit mode. Preview by default is planned for `T-2.5.2`.
- Chat sessions cannot be renamed yet (`T-2.5.3`).
- Only Dark, Light and System themes exist. Color themes are planned for `T-2.5.4`.
- Fountain has no on-screen view; only PDF export.
- The app is not signed or notarized. On first launch on macOS, right-click the app and choose **Open**.
- The chat requires OpenCode to be installed and configured. If it is missing, the app explains how to fix it.
- Only tested on macOS.
