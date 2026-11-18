# License texts

This folder contains the license texts referenced by
[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md). It is bundled inside
`Bradbit Editor.app/Contents/Resources` so the notices travel with the app.

| Path | Component |
|---|---|
| `libgit2-COPYING` | libgit2, GPLv2 with linking exception. |
| `MPL-2.0.txt` | Mozilla Public License 2.0, used by the Tauri CSS stack and DOMPurify. |
| `LGPL-2.1.txt` | GNU Lesser General Public License 2.1, used by the FFmpeg build inside OpenTUI. |
| `Apache-2.0.txt` | Apache License 2.0, used by several Rust and npm packages. |
| `MIT.txt` | Generic MIT license text for the MIT-licensed components listed in the notices. |
| `DOMPurify-LICENSE` | DOMPurify (MPL-2.0 OR Apache-2.0). |
| `jumpcut-LICENSE` | JumpCut Final Draft converter (MIT). |
| `docx-rs-LICENSE` | docx-rs Word document writer (MIT). |
| `mammoth-LICENSE` | Mammoth DOCX parser (BSD-2-Clause). |
| `turndown-LICENSE` | Turndown HTML-to-Markdown converter (MIT). |
| `opentui/` | OpenTUI, FFmpeg, libwebp, LittleCMS, Ghostty, zlib, stb and Wuffs notices and source information. |
| `sidecar/` | OpenCode license and notice for the `bradbit` sidecar. |

## Source code

- libgit2: <https://github.com/libgit2/libgit2> (unmodified).
- OpenTUI: <https://github.com/sst/opentui>.
- FFmpeg: <https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz>. The exact build
  configuration and SHA-256 are in `opentui/FFMPEG-SOURCE.md`.
- Sidecar `bradbit`: <https://github.com/akolormedia/bradbit-cli>.
- Tauri: <https://github.com/tauri-apps/tauri>.
- CodeMirror: <https://github.com/codemirror/dev>.

If you need a copy of any source used to build this app, open an issue at
<https://github.com/akolormedia/bradbit-editor/issues> or use the links above.
