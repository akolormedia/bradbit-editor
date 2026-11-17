#!/usr/bin/env node
/**
 * Builds the universal macOS sidecar expected by
 * `tauri build --target universal-apple-darwin`.
 *
 * Tauri looks for `binaries/bradbit-universal-apple-darwin` when bundling the
 * universal app. The CLI release publishes separate arm64 and x64 binaries, so
 * we combine them with Apple's `lipo`.
 *
 * Usage:
 *   npm run sidecar:universal   # downloads both and creates the universal file
 */

import { execFileSync } from "node:child_process"
import { chmodSync, existsSync, mkdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

if (process.platform !== "darwin") {
  console.error("The universal sidecar can only be built on macOS.")
  process.exit(1)
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const binariesDir = path.join(root, "src-tauri", "binaries")
const arm64 = path.join(binariesDir, "bradbit-aarch64-apple-darwin")
const x64 = path.join(binariesDir, "bradbit-x86_64-apple-darwin")
const universal = path.join(binariesDir, "bradbit-universal-apple-darwin")

for (const [label, file] of [
  ["arm64", arm64],
  ["x64", x64],
]) {
  if (!existsSync(file)) {
    console.error(
      `Missing ${label} sidecar at ${file}.\nRun: npm run fetch:bradbit -- --all`,
    )
    process.exit(1)
  }
}

mkdirSync(binariesDir, { recursive: true })
execFileSync("lipo", ["-create", arm64, x64, "-output", universal], {
  stdio: "inherit",
})
chmodSync(universal, 0o755)

const archs = execFileSync("lipo", ["-archs", universal], {
  encoding: "utf8",
}).trim()
if (!archs.includes("arm64") || !archs.includes("x86_64")) {
  console.error(`Universal sidecar is missing an architecture: ${archs}`)
  process.exit(1)
}
console.log(`Universal sidecar ready (${archs}): ${universal}`)
