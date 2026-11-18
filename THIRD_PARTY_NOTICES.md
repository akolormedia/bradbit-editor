# Third-party notices

**Bradbit Editor** is distributed under the **MIT license** (see [`LICENSE`](LICENSE)). This file lists the third-party components included in the app, the sidecar and the installer, and the licenses that apply to them.

The full license texts referenced here are in [`licenses/`](licenses/). They are copied into the macOS app bundle (`Contents/Resources`) so the notices travel with the binary.

## libgit2 — GPLv2 with linking exception

- **Component:** libgit2 1.9.7, statically linked through the `git2` Rust crate (0.21).
- **Copyright:** libgit2 contributors.
- **License:** GNU General Public License version 2, with the **libgit2 linking exception**. The exception permits linking libgit2 with programs under other licenses and distributing those combinations.
- **Source:** <https://github.com/libgit2/libgit2>
- **Full license text:** [`licenses/libgit2-COPYING`](licenses/libgit2-COPYING).

Bradbit does **not** modify libgit2. If Bradbit ever ships a modified libgit2, those modifications will be published under the same terms. The source is available at the URL above for the lifetime of the distributed binary.

## Mozilla Public License 2.0 components

The following components are licensed under the **Mozilla Public License 2.0** (MPL-2.0):

| Component | Version | Use |
|---|---:|---|
| `cssparser` | 0.37.0 | CSS parsing in the Tauri/webview stack. |
| `cssparser-macros` | 0.7.1 | Procedural macros for `cssparser`. |
| `dtoa-short` | 0.3.5 | Number formatting in the CSS stack. |
| `option-ext` | 0.2.0 | Option helpers used by the CSS stack. |
| `selectors` | 0.38.0 | CSS selector matching in the Tauri/webview stack. |

- Full license text: [`licenses/MPL-2.0.txt`](licenses/MPL-2.0.txt).
- These crates are used **unmodified**. If Bradbit modifies any MPL-2.0 file, the modified source will be published under MPL-2.0.

**DOMPurify** (3.4.17) is dual-licensed under **MPL-2.0 OR Apache-2.0**. Bradbit distributes it under the **Apache-2.0** option. Its license text is in [`licenses/DOMPurify-LICENSE`](licenses/DOMPurify-LICENSE).

## Sidecar `bradbit` — OpenCode fork (MIT)

The editor bundles a separate `bradbit` executable built from [`bradbit-cli`](https://github.com/akolormedia/bradbit-cli), a fork of [OpenCode](https://github.com/anomalyco/opencode).

- **Upstream copyright:** 2025 opencode and contributors.
- **Bradbit changes:** copyright 2026 Akolormedia / Rafael Olivares.
- **License:** MIT. Full text: [`licenses/sidecar/OPENCODE-LICENSE`](licenses/sidecar/OPENCODE-LICENSE).
- **Attribution:** [`licenses/sidecar/OPENCODE-NOTICE`](licenses/sidecar/OPENCODE-NOTICE).
- **Source:** <https://github.com/akolormedia/bradbit-cli>.
- **Pinned version:** `v0.1.0-alpha.3` in [`bradbit-cli.json`](bradbit-cli.json).

The sidecar is a separate program. Its licenses do not change the MIT license of the editor.

### OpenTUI and FFmpeg (LGPL-2.1-or-later)

The sidecar includes **OpenTUI 0.8.1** (MIT) and a minimal, decode-only **FFmpeg 9.0.2** build under **LGPL-2.1-or-later**. FFmpeg is integrated through OpenTUI; GPL and nonfree components are disabled.

- **OpenTUI license:** [`licenses/opentui/LICENSE`](licenses/opentui/LICENSE) (MIT).
- **FFmpeg license:** [`licenses/LGPL-2.1.txt`](licenses/LGPL-2.1.txt).
- **FFmpeg source and build details:** [`licenses/opentui/FFMPEG-SOURCE.md`](licenses/opentui/FFMPEG-SOURCE.md).
- **OpenTUI source:** <https://github.com/sst/opentui>.
- **FFmpeg source:** <https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz>.

FFmpeg is **unmodified**. The OpenTUI source, its build script and the pinned FFmpeg source provide everything needed to rebuild and relink `libopentui` with a modified FFmpeg. The sidecar is a separate executable; you can replace it with a compatible build without modifying the editor.

The OpenTUI distribution also includes the following components; their notices are in `licenses/opentui/`:

| Component | License | Notice |
|---|---|---|
| libwebp | BSD-3-Clause | `LICENSE-LIBWEBP`, `AUTHORS-LIBWEBP`, `PATENTS-LIBWEBP` |
| LittleCMS (lcms2) | MIT | `LICENSE-LCMS2` |
| Ghostty | MIT | `LICENSE-GHOSTTY` |
| zlib | Zlib | `LICENSE-ZLIB` |
| stb | MIT | `LICENSE-STB` |
| Wuffs | Apache-2.0 | `LICENSE-WUFFS` |
| Bun runtime | MIT | <https://github.com/oven-sh/bun/blob/main/LICENSE.md> |

## Editor dependencies

### Rust

- **Tauri** 2.x: MIT OR Apache-2.0.
- **git2** 0.21: MIT OR Apache-2.0.
- **jumpcut** 2.1: MIT. Used only for Final Draft (FDX) import; license text in [`licenses/jumpcut-LICENSE`](licenses/jumpcut-LICENSE).
- **docx-rs** 0.4.22: MIT. Used only for Markdown → DOCX export; license text in [`licenses/docx-rs-LICENSE`](licenses/docx-rs-LICENSE).
- **OpenSSL / `openssl-sys`:** Apache-2.0. Used only to satisfy the `git2` HTTPS build; on macOS the final app uses **SecureTransport** and does not link OpenSSL.
- The remaining crates are MIT, Apache-2.0, BSD, ISC, Zlib, Unicode-3.0 or compatible dual licenses. The full resolved set is in [`src-tauri/Cargo.lock`](src-tauri/Cargo.lock); there are **no GPL, AGPL or SSPL components** other than libgit2.
- `r-efi` declares `MIT OR Apache-2.0 OR LGPL-2.1-or-later`; Bradbit uses the MIT/Apache option.

### JavaScript / npm

- **CodeMirror 6:** MIT.
- **Tauri API and plugins:** MIT OR Apache-2.0.
- **Lucide:** ISC.
- **DOMPurify:** MPL-2.0 OR Apache-2.0 (distributed under Apache-2.0).
- **Mammoth:** BSD-2-Clause. Used only for DOCX import; license text in [`licenses/mammoth-LICENSE`](licenses/mammoth-LICENSE).
- **Turndown:** MIT. Used only for DOCX import; license text in [`licenses/turndown-LICENSE`](licenses/turndown-LICENSE).
- The full production dependency set is in [`package-lock.json`](package-lock.json); there are **no GPL or LGPL production dependencies**.

## Source code and relinking

The app is distributed as an ad-hoc signed, non-notarized macOS bundle. The source code for Bradbit Editor is available at <https://github.com/akolormedia/bradbit-editor>. The source for the sidecar is available at <https://github.com/akolormedia/bradbit-cli>.

For libgit2, OpenTUI and FFmpeg, use the source links above. If you need help obtaining the exact source corresponding to a released binary, open an issue at <https://github.com/akolormedia/bradbit-editor/issues>.

## No warranty

The third-party components are provided under their respective licenses, without warranty. Bradbit's MIT license applies only to Bradbit's original code; it does not override the terms of the third-party licenses listed here.
