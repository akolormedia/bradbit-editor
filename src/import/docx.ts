import DOMPurify from "dompurify";
import { countWordsAndChars } from "../workspace/state";

export type DocxImportWarning =
  | "images"
  | "tables"
  | "styles"
  | "comments"
  | "trackedChanges";

export interface DocxImportResult {
  markdown: string;
  warnings: DocxImportWarning[];
  images: number;
  tables: number;
  headings: number;
  words: number;
}

/**
 * Word styles that have an unambiguous Markdown equivalent. Everything else
 * becomes a normal paragraph; the import modal warns that advanced styling is
 * not preserved.
 */
const STYLE_MAP = [
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Subtitle'] => p:fresh",
  "p[style-name='Heading 1'] => h1:fresh",
  "p[style-name='Heading 2'] => h2:fresh",
  "p[style-name='Heading 3'] => h3:fresh",
  "p[style-name='Heading 4'] => h4:fresh",
  "p[style-name='Heading 5'] => h5:fresh",
  "p[style-name='Heading 6'] => h6:fresh",
  "p[style-name='Quote'] => blockquote:fresh",
  "p[style-name='Intense Quote'] => blockquote:fresh",
];

/**
 * Converts a Word document into a single Markdown manuscript.
 *
 * Narrative-only import: headings, paragraphs, bold and italic are kept.
 * Images and tables are removed and counted; comments and tracked changes are
 * not represented and are reported as warnings. The caller decides whether to
 * write the result into the project.
 */
export async function convertDocxToMarkdown(
  arrayBuffer: ArrayBuffer,
): Promise<DocxImportResult> {
  // DOCX import is occasional: load the Word and Markdown converters only
  // when the user actually imports a file, instead of growing the initial
  // editor bundle by ~1 MB.
  const mammoth = await import("mammoth/mammoth.browser.js");
  const { default: TurndownService } = await import("turndown");

  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    { styleMap: STYLE_MAP, includeDefaultStyleMap: true },
  );

  const parsed = new DOMParser().parseFromString(result.value, "text/html");
  const images = parsed.querySelectorAll("img").length;
  const tables = parsed.querySelectorAll("table").length;

  // Narrative import is text-only. Removing these before Turndown prevents
  // image data URIs and flattened table cells from leaking into the manuscript.
  parsed
    .querySelectorAll("img, table, script, style, iframe, object, embed")
    .forEach((element) => element.remove());

  const sanitized = DOMPurify.sanitize(parsed.body.innerHTML, {
    USE_PROFILES: { html: true },
  });

  const turndown = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    strongDelimiter: "**",
  });
  turndown.addRule("dropImages", {
    filter: "img",
    replacement: () => "",
  });

  let markdown = turndown.turndown(sanitized);
  markdown = markdown
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  if (markdown) markdown += "\n";

  const warnings: DocxImportWarning[] = [];
  if (images > 0) warnings.push("images");
  if (tables > 0) warnings.push("tables");
  if (result.messages.length > 0) warnings.push("styles");
  // Mammoth does not surface Word comments or revision marks in the HTML.
  warnings.push("comments", "trackedChanges");

  const headings = (markdown.match(/^#{1,6} /gm) ?? []).length;
  const words = countWordsAndChars(markdown).words;

  return { markdown, warnings, images, tables, headings, words };
}
