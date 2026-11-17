import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function localLinks(markdown: string): string[] {
  const links: string[] = [];
  const pattern = /\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of markdown.matchAll(pattern)) {
    const target = match[1].trim();
    if (
      target.startsWith("http://") ||
      target.startsWith("https://") ||
      target.startsWith("mailto:") ||
      target.startsWith("#")
    ) {
      continue;
    }
    links.push(target.split("#")[0]);
  }
  return links;
}

describe("macOS installation guide (T-3.5.7)", () => {
  it("covers requirements, universal DMG and Gatekeeper", () => {
    const english = read("docs/INSTALL.md");
    const spanish = read("docs/INSTALL.es.md");

    expect(english).toContain("macOS 13 Ventura or later");
    expect(english).toContain("_universal.dmg");
    expect(english).toContain("Open Anyway");
    expect(english).toContain("not notarized");
    expect(english).toContain("No Git");
    expect(english).toContain("Command Line Tools");
    expect(english).toContain("Keychain");
    expect(english).toContain("is damaged");
    expect(english).toContain("releases/latest");

    expect(spanish).toContain("macOS 13 Ventura o posterior");
    expect(spanish).toContain("_universal.dmg");
    expect(spanish).toContain("Abrir de todos modos");
    expect(spanish).toContain("no está notarizada");
    expect(spanish).toContain("Git");
    expect(spanish).toContain("Command Line Tools");
    expect(spanish).toContain("Keychain");
    expect(spanish).toContain("dañado");
    expect(spanish).toContain("releases/latest");
  });

  it("links the languages, README and changelog", () => {
    const english = read("docs/INSTALL.md");
    const spanish = read("docs/INSTALL.es.md");
    expect(english).toContain("[Español](INSTALL.es.md)");
    expect(spanish).toContain("[English](INSTALL.md)");
    expect(english).toContain("../README.md");
    expect(spanish).toContain("../README.md");
    expect(english).toContain("../CHANGELOG.md");
    expect(spanish).toContain("../CHANGELOG.md");
    expect(read("README.md")).toContain("docs/INSTALL.md");
    expect(read("README.md")).toContain("docs/INSTALL.es.md");
  });

  it("does not contain broken local links", () => {
    for (const file of [
      "README.md",
      "docs/INSTALL.md",
      "docs/INSTALL.es.md",
    ]) {
      const markdown = read(file);
      for (const link of localLinks(markdown)) {
        const target = path.resolve(path.dirname(path.join(root, file)), link);
        expect(existsSync(target), `${file}: missing ${link}`).toBe(true);
      }
    }
  });
});
