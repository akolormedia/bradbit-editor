#!/usr/bin/env node
/**
 * Downloads the pinned bradbit-cli release as a Tauri sidecar.
 *
 * Tauri expects `src-tauri/binaries/bradbit-<target-triple>` for each target.
 * The binaries are large, so they are not committed.
 *
 * Usage:
 *   npm run fetch:bradbit            # current macOS architecture
 *   npm run fetch:bradbit -- --all   # both arm64 and x64
 *   npm run fetch:bradbit -- --force # redownload even if the version matches
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const config = JSON.parse(readFileSync(path.join(root, "bradbit-cli.json"), "utf8"))
const binariesDir = path.join(root, "src-tauri", "binaries")
const stampPath = path.join(binariesDir, ".bradbit-version")
const args = new Set(process.argv.slice(2))
const force = args.has("--force")
const all = args.has("--all")

function hostTriple() {
  if (process.platform !== "darwin") {
    throw new Error("bradbit sidecars are currently distributed for macOS only")
  }
  if (process.arch === "arm64") return "aarch64-apple-darwin"
  if (process.arch === "x64") return "x86_64-apple-darwin"
  throw new Error(`Unsupported macOS architecture: ${process.arch}`)
}

const targets = all ? Object.keys(config.assets) : [hostTriple()]
for (const target of targets) {
  if (!config.assets[target]) throw new Error(`No asset configured for ${target}`)
}

mkdirSync(binariesDir, { recursive: true })
const stamp = existsSync(stampPath) ? readFileSync(stampPath, "utf8").trim() : ""
const upToDate = !force && stamp === config.version && targets.every((target) => existsSync(path.join(binariesDir, `bradbit-${target}`)))
if (upToDate) {
  console.log(`bradbit ${config.version} sidecar already present`)
  process.exit(0)
}

for (const target of targets) {
  const asset = config.assets[target]
  const url = `https://github.com/${config.repository}/releases/download/${config.version}/${asset}`
  const output = path.join(binariesDir, `bradbit-${target}`)
  process.stdout.write(`Downloading ${asset} (${target})... `)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`\nCould not download ${url}: HTTP ${response.status}`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length < 10_000_000) {
    throw new Error(`\nDownloaded ${asset} is unexpectedly small (${buffer.length} bytes)`)
  }
  const magic = buffer.readUInt32BE(0)
  // Mach-O 64/32 and universal binaries, in either byte order.
  if (![0xfeedfacf, 0xcffaedfe, 0xfeedface, 0xcefaedfe, 0xcafebabe, 0xbebafeca].includes(magic)) {
    throw new Error(`\nDownloaded ${asset} is not a Mach-O binary`)
  }
  writeFileSync(output, buffer)
  chmodSync(output, 0o755)
  console.log(`${(buffer.length / 1024 / 1024).toFixed(1)} MB`)
}

writeFileSync(stampPath, `${config.version}\n`)
console.log(`bradbit ${config.version} sidecar ready in src-tauri/binaries`)
