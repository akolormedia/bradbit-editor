# Bradbit Editor (`bradbit-editor`)

Desktop text editor for creative writing (`.md`, `.mdx`, `.fountain`, `.txt`), agnostic by design, built with **Tauri v2**, **CodeMirror 6** and **Rust**.

> **Alpha version `0.1.0-alpha.2`** · macOS only · early testing. Change history in [`CHANGELOG.md`](CHANGELOG.md).

## Features

- **Integrated chat with the Bradbit agent runtime (`T-2.1.1`):**
  - Layout in the style of `opencode-desktop`: **writing session on the left** and the `EditorWorkspace` on the right, with a resizable divider.
  - The **Chat** and **Editor** icons in the top bar show or hide each panel without losing the CodeMirror state. When one is hidden, the other uses the full window width, with messages and composer centered.
  - **Multiple session tabs** with `+`, switching and closing. Each tab keeps its history, generation state and composer draft.
  - **Per-project persistence:** reopening the app restores open tabs, the active session, the chat width and the panel state.
  - Starts or reuses **`opencode serve`** automatically for the open folder, creates a session if there is none, and streams the response live.
  - Composer with **Enter to send**, **Shift+Enter** for a new line, and a **Stop** button during generation.
  - **Live tools with permissions (`T-2.1.3`):** compact cards for `read`, `edit`, `write`, `shell`, searches and skills, with running, completed and error status and expandable input and result details. Clicking a file that was read or edited opens it in the editor; if the tool changed it, the button opens its **Diff** directly. When the runtime asks for permission, a card offers **Allow once**, **Always allow** or **Reject**.
  - **Interactive questions (`T-2.1.4`):** when the agent uses the `question` tool, a card appears with options, free text and multiple fields. After answering, the card shows **Answered** or **Cancelled**, stays in the chat history and no longer occupies a fixed area above the composer.
  - **Project kit (`T-2.2.1`/`T-2.2.2`):** discovers agents, commands and skills from `.opencode/` and `.bradbit/`, and updates automatically when the kit changes. The composer offers command autocomplete with **`/`**, attachments with **`@`** or the **＋** button, and the editor's **↗** button sends the current selection to the active chat.
  - **Composer in the style of `opencode-desktop` (`T-2.2.3`):** a single panel with a helpful placeholder, a **model** picker with search, recents and provider grouping, a separate **effort/variant** picker, the **↑** send button, and a **＋** menu with a context file, command, kit agent and **Manage models**. In *Settings → Manage models* you can search and enable or disable which models appear. Visibility and recents are saved in the settings.
  - **Integrated terminal (`T-2.3.1`):** the **`>_`** button in the bottom bar switches between **Chat / Terminal** in the left column, without losing the editor or the buffer. Native PTY in Rust with a **Shell / opencode / claude / custom command** picker, automatic resize, restart and clear. The session closes when the folder closes.
  - **Minimal top bar and application menu (`T-2.4.2`):** the project title and the **Chat/Editor** toggles live at the top. File, edit, view and settings actions are grouped in a dropdown menu with shortcuts. The left panel and terminal toggles are in the bottom bar, next to the branch.
  - **Chat and editor surfaces (`T-2.4.3`):** Chat/Terminal and the `EditorWorkspace` are two independent panels with a border, radius and spacing over the app background, in the style of `opencode-desktop`. The tree and the document share the editor surface, and the dividers keep the drag-relative resize.
  - Shows connection status, actionable errors and context/token usage, and keeps the session history while you switch files.
  - Uses the project's `.opencode/` kit, agents and models through the bundled `bradbit` sidecar. Bradbit does not store model keys in the project.

- **Native macOS menu (`Story 1.1.1`):** the system menu bar includes **Bradbit Editor, File, Edit, View and Window**:
  - *File:* Open folder (`⌘O`), Open recent, New project (`⇧⌘N`), Save as template, Open templates folder, Quick open (`⌘P`), New file (`⌘N`), Save (`⌘S`), Export PDF (`⌘E`) and Close tab (`⌘W`).
  - *Edit:* Undo and Redo connected to each tab's history, Bold (`⌘B`) and Italic (`⌘I`) in Markdown/MDX, Cut, Copy, Paste and Select all, Find (`⌘F`), Find and replace (`⌥⌘F`) and Find in project (`⌘⇧F`).
  - *View:* Show or hide the explorer (`⌘⇧E`), Preview (`⌘⌥P`), Word wrap, Line numbers and Full screen.
  - *Window:* Minimize, Zoom and Bring all to front.
  - Items are enabled, disabled and checked according to the real state, and labels change with the language.
- **Any folder is a project:** open any folder on disk without proprietary configuration files (`project.yaml`).
- **Welcome screen and recent projects:** open folders from disk or reopen any recent project in one click.
- **New project and templates (`T-1.3.2`):**
  - **New project (`⇧⌘N`)** from the welcome screen, the top bar or the *File* menu: choose a template, a name and a destination folder.
  - Built-in templates: **Audiovisual script (`guionista-kit`)**, with bible, structure, script, research, agents, commands and skills; and **Blank project**.
  - **User templates:** any folder in `~/Library/Application Support/Bradbit/templates/` appears automatically in the template picker.
  - When the project is created, **`git init`** runs if Git is available, and the app opens the resulting folder.
  - **Save current project as template…** and **Open templates folder**, from the modal and the *File* menu.
- **Resizable and collapsible side explorer (`⌘⇧E`):**
  - Compact **Files / Outline / Versions** icon selector at the left end of the bottom bar. Only the active section is shown, and the tree gets more height because it no longer needs a tab row.
  - Hides `.git`, `.DS_Store` and `.opencode` by default, with the option *Show configuration files*.
  - **Filter files (`T-2.4.5`):** a field above the tree that filters by name or path, keeps ancestor folders, auto-expands matches and clears with `Escape`.
  - Built-in actions: New file (`⌘N`), New folder, Rename and Delete (with confirmation).
  - **Untitled new file (`T-2.4.6`):** `⌘N`, the menu and the tree open an **Untitled** tab. The real name is requested when saving, through the native dialog, inside the project folder. Untitled tabs are not persisted.
- **Document outline (`T-1.2.2`):**
  - In Markdown/MDX: headings (`#`, `##`, `###`…) that jump to the exact line when clicked.
  - In Fountain: sections (`# Acto`) and scenes (`INT.`, `EXT.`, `I/E.`, `.forced`) with hierarchy and an estimated page count (`~N pages`).
  - Updates automatically while you type, and also works from the preview: clicking returns to editing and jumps to the line.
- **Search and quick navigation (`T-1.2.4`):**
  - **Quick open (`⌘P`):** a palette that filters any project file by name or path and opens it with Enter.
  - **Find in project (`⌘⇧F`):** full-text search across all files, with `path:line` results and snippets. Enter opens the file at the exact line.
  - Both palettes respect the *Show configuration files* setting and support keyboard navigation (`↑↓`, Enter, Esc).
- **Smart tabs:**
  - A single click opens a tab in *preview* mode (italic). A double click or an edit pins the tab.
  - Unsaved-changes indicator (`•`), safe close with confirmation (`⌘W`) and atomic writes to disk (`⌘S`).
- **Live external files (`T-1.4.1`):**
  - Changes made by `opencode`, `claude` or any other external process update the file tree immediately.
  - Clean tabs reload automatically.
  - If a tab has unsaved changes, your text is kept and a `⚠` notice appears with the message *Changed on disk*. Your draft is never overwritten.
  - Deleted files close their tab if it was clean. If it had changes, the copy is kept so you can save it.
- **Git status badges (`T-1.4.2`):**
  - Badges in the explorer and tabs: **`M`** modified, **`+`** new or untracked, **`D`** deleted, **`R`** renamed and **`!`** conflict.
  - The bottom bar shows the current branch and the `↑`/`↓` counters for commits ahead and behind.
  - Badges update on save and when the file watcher detects external changes.
  - Files deleted from disk appear in the Versions panel (`T-1.4.4`), since they no longer exist in the tree.
- **Integrated Diff viewer (`T-1.4.3`):**
  - The **Diff** button in the header compares the last saved version (Git `HEAD`) with the tab's current content, side by side, with highlighted changes and collapsed unchanged sections.
  - New files show the notice *New file (no saved version)* and are compared against an empty document.
  - The **↺ Discard changes** button asks for confirmation and restores the file to `HEAD`. If it is a new file, it is deleted from disk and from the index. The tab, tree and badges refresh immediately.
  - Also works with unsaved changes: the Diff shows the live text of the tab, and discarding removes both the draft and the changes on disk.
- **Versions panel (`T-1.4.4`):**
  - **Versions** section of the side selector, also available with **`⌘⌥G`**.
  - **Save version:** summarizes pending changes, lets you write the summary, and signs the commit with the name and email configured in *Settings → Version author*.
  - **Current changes:** a readable list of *Edited*, *New*, *Deleted*, *Renamed* or *Conflict* files. Each row opens its Diff and offers discard or restore.
  - **Version history:** a timeline of commits with date and author. Expanding a version lets you inspect its files and restore any of them without leaving the editor.
  - **Parallel drafts:** a list of Git branches, creation of a new draft from the current version, and switching drafts with a safe reload of open tabs.
  - In folders without Git, the panel offers **Enable history** to create the repository and start saving versions.
  - Files deleted from disk now appear in *Current changes* with their restore action.
- **GitHub sync (`T-1.5.4`):**
  - **GitHub account in Settings:** the token is stored only in the **macOS Keychain**, never in `settings.json` or the project. Includes account verification, sign-out and a link to create a Personal Access Token.
  - **Publish to GitHub:** creates the remote repository (private or public) and uploads the current version. If a non-GitHub remote already existed, it adds a `github` remote without touching `origin`.
  - **Push and pull changes:** `push` and `pull --ff-only`, with the token in the Git process environment and not embedded in the remote URL. Pulling reloads open tabs safely.
  - **Propose changes to the team:** pushes the current draft and opens a Pull Request with title, description and base branch. The panel lists open Pull Requests and opens them in GitHub.
- **Professional editing with CodeMirror 6:**
  - Undo and redo per tab, find and replace in the file (`⌘F`), word wrap, optional line numbers, a native spellchecker, and colored syntax for Markdown/MDX and Fountain.
  - Bold (`⌘B`) and italic (`⌘I`) in Markdown/MDX, with the selection or cursor wrapped in markers.
- **Fountain 1.1 and PDF export (`T-1.2.3`):**
  - Distinct highlighting for scenes, sections, transitions, characters, dialogue, parentheticals and `[[...]]` notes.
  - **Export PDF (`⌘E`)** from the document header or the *File* menu. It produces a deterministic screenplay-formatted PDF (US Letter, Courier 12pt, 55 lines per page, `(MORE)` and `(CONT'D)` rules, and page numbering).
  - The PDF is saved in the project's `exports/` folder, keeping the script subfolder (`exports/guion/acto-1.pdf`), and opens automatically in the system viewer. It works offline.
  - **Paginated screenplay preview (`T-2.5.7`):** the Preview / Edit button renders the script as numbered paper pages (US Letter, Courier, scene headings, centered cues, dialogue and transitions) without opening the PDF.
- **Document header and reading preview (`T-1.2.1`):**
  - The header above the editor shows the active file's name and path, with **Copy**, **Preview / Edit** (Markdown and Fountain) and **PDF** (Fountain) actions.
  - Rendered and sanitized Markdown/MDX preview (`⌘⌥P`), with headings, lists, quotes, code, tables and links. The reading view is monochrome so the document reads like a manuscript; links keep an underline and only use the accent color on hover.
  - External links open in the browser. Relative project links open directly in the editor.
- **Application settings (`⌘,`, `T-2.4.4`):** a window with a search field and categories on the left (General, Appearance, Editor, Files & search, Terminal, Git, GitHub, AI & models). Includes language, light/dark/system mode, color themes (Bradbit, Nord, Solarized, Gruvbox) with light and dark variants, font size (`12`–`24` px), word wrap, line numbers, configuration files, the default terminal command, the Git author, the GitHub account and model management.

## Installation (alpha)

**Requirements**
- macOS. The alpha has only been tested on macOS.
- **No separate OpenCode install is required** for the chat: the macOS app bundles the `bradbit` runtime as a sidecar. For source builds, download it with `npm run fetch:bradbit`. An `opencode` binary on `PATH` remains as an optional fallback.
- Git (optional): needed for the Versions panel and GitHub sync.
- GitHub token (optional): only needed to publish and sync repositories.

**Option A: installer**
1. Download `Bradbit Editor_0.1.0-alpha.2_<architecture>.dmg` from the releases page.
2. Drag the app into *Applications*.
3. The alpha is not signed. On first launch, right-click the app, choose **Open** and confirm.

**Option B: build from source**

```bash
npm install
npm run fetch:bradbit   # downloads the pinned bradbit-cli sidecar
npm run tauri build
# The installer is written to src-tauri/target/release/bundle/dmg/
```

The sidecar version and asset names are pinned in `bradbit-cli.json`. The
downloaded binaries live in `src-tauri/binaries/` and are not committed.

## Known limitations (alpha)

The full list is in [`CHANGELOG.md`](CHANGELOG.md#known-limitations). Summary:
- Creating a project by chatting with the agent from the welcome screen is still planned (`T-2.5.10`).
- Only the Guionista kit is bundled. Additional kits and extensions are planned for Phase 4.
- The app is not signed or notarized, and only macOS has been tested.

## Development and tests

```bash
# Install frontend dependencies
npm install

# Full verification (frontend + Rust)
npm run typecheck
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings

# Run in native desktop mode (Tauri); fetch the sidecar first on a fresh checkout
npm run fetch:bradbit
npm run tauri dev

# Build the macOS installer (fetches the sidecar in the release workflow)
npm run tauri build
```
