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

describe("licenses and third-party notices (T-3.6.3)", () => {
  it("ships an MIT LICENSE and a product README with a License section", () => {
    const license = read("LICENSE");
    const readme = read("README.md");

    expect(license).toContain("MIT License");
    expect(license).toContain("Copyright (c) 2026 Akolormedia / Rafael Olivares");
    expect(readme).toContain("## License");
    expect(readme).toContain("MIT licensed");
    expect(readme).toContain("[`LICENSE`](LICENSE)");
    expect(readme).toContain("[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)");
    expect(readme).toContain("docs/FEATURES.md");
    expect(readme).toContain("docs/INSTALL.es.md");
  });

  it("documents libgit2, MPL-2.0 and the LGPL sidecar components", () => {
    const notices = read("THIRD_PARTY_NOTICES.md");

    expect(notices).toContain("libgit2 1.9.7");
    expect(notices).toContain("GPLv2 with linking exception");
    expect(notices).toContain("https://github.com/libgit2/libgit2");
    expect(notices).toContain("MPL-2.0");
    expect(notices).toContain("DOMPurify");
    expect(notices).toContain("OpenTUI 0.8.1");
    expect(notices).toContain("FFmpeg 9.0.2");
    expect(notices).toContain("LGPL-2.1-or-later");
    expect(notices).toContain("https://github.com/akolormedia/bradbit-cli");
    expect(notices).toContain("https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz");
  });

  it("keeps all referenced license texts and bundles them in the app", () => {
    for (const file of [
      "licenses/libgit2-COPYING",
      "licenses/MPL-2.0.txt",
      "licenses/LGPL-2.1.txt",
      "licenses/Apache-2.0.txt",
      "licenses/DOMPurify-LICENSE",
      "licenses/jumpcut-LICENSE",
      "licenses/docx-rs-LICENSE",
      "licenses/pulldown-cmark-LICENSE",
      "licenses/mammoth-LICENSE",
      "licenses/turndown-LICENSE",
      "licenses/opentui/LICENSE",
      "licenses/opentui/LICENSE-FFMPEG",
      "licenses/opentui/FFMPEG-SOURCE.md",
      "licenses/opentui/LICENSE-LIBWEBP",
      "licenses/opentui/LICENSE-LCMS2",
      "licenses/opentui/LICENSE-GHOSTTY",
      "licenses/opentui/LICENSE-ZLIB",
      "licenses/opentui/LICENSE-STB",
      "licenses/opentui/LICENSE-WUFFS",
      "licenses/sidecar/OPENCODE-LICENSE",
      "licenses/sidecar/OPENCODE-NOTICE",
      "licenses/sidecar/README.md",
      "licenses/README.md",
    ]) {
      expect(existsSync(path.join(root, file)), `missing ${file}`).toBe(true);
      expect(read(file).trim().length, `empty ${file}`).toBeGreaterThan(0);
    }

    expect(read("licenses/opentui/FFMPEG-SOURCE.md")).toContain("ffmpeg-9.0.2");
    expect(read("licenses/opentui/LICENSE-FFMPEG")).toContain("GNU LESSER GENERAL PUBLIC LICENSE");
    expect(read("licenses/sidecar/OPENCODE-LICENSE")).toContain("MIT License");

    const tauri = JSON.parse(read("src-tauri/tauri.conf.json")) as {
      bundle?: {
        license?: string;
        licenseFile?: string;
        resources?: Record<string, string>;
      };
    };
    expect(tauri.bundle?.license).toBe("MIT");
    expect(tauri.bundle?.licenseFile).toBe("../LICENSE");
    expect(tauri.bundle?.resources).toMatchObject({
      "../LICENSE": "LICENSE",
      "../THIRD_PARTY_NOTICES.md": "THIRD_PARTY_NOTICES.md",
      "../licenses/": "licenses/",
    });
  });

  it("bundles the MIT license and README in every writing kit template", () => {
    for (const kit of ["guionista-kit", "libro-kit", "campaign-kit"]) {
      const base = `src-tauri/resources/templates/${kit}`;
      expect(existsSync(path.join(root, base, "LICENSE")), `${kit} LICENSE`).toBe(true);
      expect(read(`${base}/LICENSE`)).toContain("MIT License");
      expect(read(`${base}/README.md`)).toContain("## License");
      expect(read(`${base}/README.md`)).toContain("MIT");
      const manifest = JSON.parse(read(`${base}/bradbit-kit.json`)) as {
        license?: string;
        contents?: string[];
      };
      expect(manifest.license).toBe("MIT");
      expect(manifest.contents).toEqual(
        expect.arrayContaining(["README.md", "LICENSE"]),
      );
    }
  });

  it("does not contain broken local links in the license docs", () => {
    for (const file of [
      "README.md",
      "THIRD_PARTY_NOTICES.md",
      "licenses/README.md",
      "licenses/sidecar/README.md",
    ]) {
      const markdown = read(file);
      for (const link of localLinks(markdown)) {
        const target = path.resolve(path.dirname(path.join(root, file)), link);
        expect(existsSync(target), `${file}: missing ${link}`).toBe(true);
      }
    }
  });
});
