import DOMPurify from "dompurify";
import { marked } from "marked";

/**
 * Renders Markdown/MDX source as sanitized reading HTML.
 *
 * MDX is treated as Markdown for preview purposes: JSX components are removed
 * by the sanitizer while their readable text is preserved.
 */
export function renderMarkdownPreview(source: string): string {
  const html = marked.parse(source, {
    async: false,
    gfm: true,
    breaks: false,
  }) as string;

  const sanitized = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["target", "rel"],
  });

  // The webview cannot resolve project-relative image paths, so show a clear
  // placeholder instead of a broken image icon. Remote images keep working.
  const template = document.createElement("template");
  template.innerHTML = sanitized;
  for (const image of template.content.querySelectorAll("img")) {
    const src = image.getAttribute("src") ?? "";
    if (/^(https?:|data:)/i.test(src)) continue;
    const placeholder = document.createElement("span");
    placeholder.className = "preview-image-placeholder";
    placeholder.textContent = `🖼 ${image.getAttribute("alt") || src}`;
    image.replaceWith(placeholder);
  }
  return template.innerHTML;
}
