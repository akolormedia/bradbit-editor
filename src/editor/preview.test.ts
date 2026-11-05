// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderMarkdownPreview } from "./preview";

describe("Markdown reading preview (T-1.2.1)", () => {
  it("renders headings, emphasis, lists and blockquotes", () => {
    const html = renderMarkdownPreview(
      "# Premisa\n\nUna **idea** con *tono*.\n\n- Elena\n- Mateo\n\n> Nota del editor",
    );

    expect(html).toContain("<h1");
    expect(html).toContain("<strong>idea</strong>");
    expect(html).toContain("<em>tono</em>");
    expect(html).toContain("<li>Elena</li>");
    expect(html).toContain("<blockquote>");
  });

  it("renders a safe link and strips javascript URLs", () => {
    const safe = renderMarkdownPreview("[Referencia](https://example.com/nota)");
    expect(safe).toContain('href="https://example.com/nota"');

    const unsafe = renderMarkdownPreview("[Peligro](javascript:alert(1))");
    expect(unsafe).not.toContain("javascript:");
    expect(unsafe).not.toContain("alert(1)");
  });

  it("removes scripts and inline event handlers", () => {
    const html = renderMarkdownPreview(
      '# Hola\n\n<script>window.alert("xss")</script>\n\n<img src="x" onerror="alert(1)" />',
    );

    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("window.alert");
  });

  it("preserves readable MDX text while dropping JSX components", () => {
    const html = renderMarkdownPreview(
      "# Capítulo\n\n<Personaje nombre=\"Elena\" />\n\nTexto visible.",
    );

    expect(html).toContain("Capítulo");
    expect(html).toContain("Texto visible.");
    expect(html).not.toContain("<Personaje");
  });

  it("replaces project-relative images with a readable placeholder", () => {
    const local = renderMarkdownPreview("![Escena](imagenes/escena.png)");
    expect(local).toContain("preview-image-placeholder");
    expect(local).toContain("Escena");
    expect(local).not.toContain("<img");

    const remote = renderMarkdownPreview("![Foto](https://example.com/foto.png)");
    expect(remote).toContain("<img");
    expect(remote).toContain("https://example.com/foto.png");
  });

  it("returns an empty string for empty source", () => {
    expect(renderMarkdownPreview("")).toBe("");
  });
});
