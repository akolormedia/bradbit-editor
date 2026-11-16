# Third-party notices

Bradbit Editor is distributed under the MIT license (see `LICENSE` once added in `T-3.6.3`).

## libgit2

- **Component:** libgit2 1.9.7, statically linked through the `git2` Rust crate.
- **Copyright:** libgit2 contributors.
- **License:** GNU General Public License version 2, with the **libgit2 linking exception**. The linking exception permits linking libgit2 with programs under other licenses and distributing those combinations.
- **Source:** <https://github.com/libgit2/libgit2>
- **Full license text:** [`licenses/libgit2-COPYING`](licenses/libgit2-COPYING).

Bradbit does not modify libgit2. If Bradbit ever ships a modified libgit2, the modifications must be published under the same terms.

## git2 (Rust bindings)

- **Component:** `git2` 0.21.
- **License:** MIT OR Apache-2.0.
- **Source:** <https://github.com/rust-lang/git2-rs>

## OpenSSL

- **Component:** `openssl-sys`/vendored OpenSSL, used only to satisfy the `git2` HTTPS build on Unix.
- **License:** Apache-2.0.
- **Note:** On macOS, HTTPS uses the system **SecureTransport** backend; OpenSSL is not linked into the final app bundle.

## Other dependencies

The app also uses Tauri, CodeMirror 6, Rust crates and frontend packages. Their licenses are listed in the dependency manifests (`src-tauri/Cargo.lock`, `package-lock.json`) and will be consolidated in `T-3.6.3`.
