# Installing Bradbit Editor on macOS

[Español](INSTALL.es.md) · [Back to README](../README.md)

Bradbit Editor is a desktop app for macOS, distributed as a **universal** build for **Apple Silicon and Intel**. It is ad-hoc signed but **not notarized**, so the first launch needs one extra confirmation from macOS.

## Requirements

- **macOS 13 Ventura or later**.
- An **Apple Silicon** or **Intel** Mac.
- About **1 GB** of free disk space.
- Internet for AI models and GitHub sync (optional while writing offline).
- **No Git, Node, Rust, Xcode, Command Line Tools or OpenCode installation is required.** History, versions and GitHub sync use the bundled libgit2 engine; the agent runtime is bundled as a sidecar.

## 1. Download

1. Open the official releases page: <https://github.com/akolormedia/bradbit-editor/releases/latest>.
2. Download the latest file ending in **`_universal.dmg`**, for example:
   `Bradbit Editor_0.1.0-alpha.5_universal.dmg`.
3. Download only from the official releases page. Do not use third-party mirrors.

> **Alpha/beta software:** keep backups of your projects. The app includes version history, but it is still early software.

## 2. Install

1. Double-click the `.dmg` to open it.
2. Drag **Bradbit Editor** into the **Applications** folder.
3. Eject the disk image.
4. Open **Bradbit Editor** from Applications (or Spotlight).

## 3. First launch: “Open Anyway”

Because the app is not notarized yet, macOS blocks the first launch with a message such as *“Apple could not verify that Bradbit Editor is free of malware.”* This is expected.

1. Try to open the app once and close the warning.
2. Open **System Settings → Privacy & Security**.
3. Scroll down to the **Security** section.
4. Click **Open Anyway** next to the Bradbit Editor message.
5. Enter your Mac password if asked, then click **Open**.

Later launches open normally.

On older macOS versions you can also **right-click the app → Open → Open**. If you do not see **Open Anyway**, try opening the app once more and return to **Privacy & Security**.

## 4. First steps

1. Open a folder or create a project from the welcome screen.
2. Check the **Getting started** card: the Bradbit engine, history, AI model and templates.
3. To use the chat, click **Connect model** and follow the guided setup. Keys are stored in the macOS **Keychain**, never in the project.
4. Use **Versions** to save a version, review changes, restore a file or create parallel drafts. No Git installation is needed.

## Troubleshooting

### “Apple could not verify…” keeps appearing

Use **System Settings → Privacy & Security → Open Anyway**. If the button is missing, try opening the app again, then return to that screen. On older systems, right-click the app and choose **Open**.

### “Bradbit Editor is damaged and can’t be opened”

This usually means the downloaded bundle is incomplete or an old alpha has an invalid signature.

1. Delete the app from Applications.
2. Download the latest `_universal.dmg` again from the official releases page.
3. Drag it to Applications and repeat the **Open Anyway** step.

Do not use an old alpha DMG. If the message persists with the latest release, open an issue and include your macOS version and the app version.

### The app opens but no window appears

1. Quit Bradbit Editor completely (`⌘Q`) and open it again.
2. Confirm that you are on macOS 13 or later.
3. If it still fails, open an issue with your macOS version, Mac model and app version.

### “The Bradbit agent runtime was not found”

The `bradbit` runtime is inside the app bundle. Reinstall the app from the DMG and do not move the executable out of `Bradbit Editor.app`. If you use a source build, run `npm run fetch:bradbit`.

### The model connection fails

Open the guided **Connect model** flow and use **Test connection**:

- A **401/403** response usually means the API key is wrong or expired.
- A **429** response means the provider is rate-limiting requests; wait and try again.
- If the provider does not expose a test endpoint, use **Save without testing** and verify it from the chat.

### GitHub sync fails

Create a GitHub token with repository permissions, paste it in **Settings → GitHub**, and verify the account. GitHub sync is optional; writing and local versions work without it.

### History does not work

History is built into the app and does not use system Git. Confirm that the folder is writable and reinstall the latest release if the problem continues; then open an issue.

## Security and privacy

- The app is **ad-hoc signed but not notarized** because there is no Apple Developer Program membership yet. This is why **Open Anyway** is required once.
- Bradbit does not require an account. Projects stay on your Mac.
- AI provider keys are stored in the **macOS Keychain** and are sent only to the provider you configure.
- Network access is used for AI requests and, if you choose, GitHub sync.
- The app does not auto-update yet. Download new versions from the official releases page.

## Uninstall

1. Quit Bradbit Editor.
2. Drag **Bradbit Editor** from Applications to the Trash.
3. Optional: remove settings and templates from `~/Library/Application Support/Bradbit`.
4. Optional: remove stored API keys from **Keychain Access** (search for `bradbit`).

## Help

- Issues: <https://github.com/akolormedia/bradbit-editor/issues>
- Changelog: [`CHANGELOG.md`](../CHANGELOG.md)
- Source builds: see the [README](../README.md#installation-alpha).

When reporting a problem, include your macOS version, Mac model (Apple Silicon or Intel), Bradbit version and the exact message.
