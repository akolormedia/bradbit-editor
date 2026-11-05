import { describe, expect, it } from "vitest";
import { extractOutline } from "./outline";

describe("Markdown/MDX outline extraction (T-1.2.2)", () => {
  it("extracts heading levels, titles and 1-based line numbers", () => {
    const outline = extractOutline(
      "biblia/premisa.md",
      "# Premisa\n\nTexto\n\n## Personajes\n\n### Elena\n",
    );
    expect(outline).not.toBeNull();
    expect(outline?.items).toEqual([
      { level: 1, title: "Premisa", line: 1, kind: "heading" },
      { level: 2, title: "Personajes", line: 5, kind: "heading" },
      { level: 3, title: "Elena", line: 7, kind: "heading" },
    ]);
    expect(outline?.pageCount).toBeNull();
  });

  it("ignores headings inside fenced code blocks", () => {
    const outline = extractOutline(
      "notas/ideas.mdx",
      "# Real\n\n```md\n# No es un encabezado\n```\n\n## También real\n",
    );
    expect(outline?.items.map((item) => item.title)).toEqual(["Real", "También real"]);
  });

  it("cleans inline Markdown and closing hashes from titles", () => {
    const outline = extractOutline(
      "README.md",
      "# **Título** con [enlace](https://example.com)\n\n## Acto ##\n\n# C#\n",
    );
    expect(outline?.items.map((item) => item.title)).toEqual([
      "Título con enlace",
      "Acto",
      "C#",
    ]);
  });

  it("returns an empty outline when there are no headings", () => {
    const outline = extractOutline("notas/nota.md", "Solo texto sin encabezados.");
    expect(outline?.items).toEqual([]);
  });

  it("returns null for unsupported file types", () => {
    expect(extractOutline("notas/nota.txt", "# Título")).toBeNull();
  });
});

describe("Fountain outline extraction (T-1.2.2)", () => {
  it("extracts sections and scenes with hierarchy and line numbers", () => {
    const outline = extractOutline(
      "guion/acto-1.fountain",
      [
        "Title: Mi guion",
        "",
        "## Acto 1",
        "",
        "INT. CASA - DÍA",
        "",
        "ANA",
        "Hola.",
        "",
        "EXT. CALLE - NOCHE",
      ].join("\n"),
    );

    expect(outline?.items).toEqual([
      { level: 2, title: "Acto 1", line: 3, kind: "section" },
      { level: 3, title: "INT. CASA - DÍA", line: 5, kind: "scene" },
      { level: 3, title: "EXT. CALLE - NOCHE", line: 10, kind: "scene" },
    ]);
    expect(outline?.pageCount).toBe(1);
  });

  it("keeps scenes at level 1 before the first section and strips forced-scene dots", () => {
    const outline = extractOutline("guion/escena.fountain", ".CASA DE ANA\n\n# Acto 1");
    expect(outline?.items).toEqual([
      { level: 1, title: "CASA DE ANA", line: 1, kind: "scene" },
      { level: 1, title: "Acto 1", line: 3, kind: "section" },
    ]);
  });

  it("estimates pages from the Fountain line count", () => {
    const long = Array.from({ length: 56 }, (_, index) =>
      index === 0 ? "INT. CASA - DÍA" : "Acción.",
    ).join("\n");
    expect(extractOutline("guion/largo.fountain", long)?.pageCount).toBe(2);
    expect(extractOutline("guion/vacio.fountain", "")?.pageCount).toBe(0);
  });

  it("ignores notes and character cues in the outline", () => {
    const outline = extractOutline(
      "guion/notas.fountain",
      "[[NOTA IMPORTANTE]]\n\nANA\n\nHola.\n\nINT. CASA - DÍA",
    );
    expect(outline?.items).toEqual([
      { level: 1, title: "INT. CASA - DÍA", line: 7, kind: "scene" },
    ]);
  });
});
