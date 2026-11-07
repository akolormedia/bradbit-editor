# Changelog

All notable changes to Bradbit Editor are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versioning follows [SemVer](https://semver.org/). `alpha` versions are early tests: behavior may change and there are no compatibility guarantees.

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
