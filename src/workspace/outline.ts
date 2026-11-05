import {
  classifyFountainLine,
  createFountainState,
  estimateFountainPages,
} from "../editor/fountain";

export type OutlineKind = "heading" | "section" | "scene";

export interface OutlineItem {
  level: number;
  title: string;
  /** 1-based line number in the document. */
  line: number;
  kind: OutlineKind;
}

export interface DocumentOutline {
  items: OutlineItem[];
  pageCount: number | null;
}

export function extractOutline(path: string, content: string): DocumentOutline | null {
  const lower = path.toLowerCase();
  if (/\.(md|mdx|markdown)$/.test(lower)) {
    return extractMarkdownOutline(content);
  }
  if (/\.(fountain|spmd)$/.test(lower)) {
    return extractFountainOutline(content);
  }
  return null;
}

function extractMarkdownOutline(content: string): DocumentOutline {
  const items: OutlineItem[] = [];
  const lines = content.split(/\r?\n/);
  let inFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = /^\s{0,3}(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/.exec(line);
    if (!match) continue;
    const title = cleanInlineMarkdown(match[2]);
    if (title.length === 0) continue;
    items.push({
      level: match[1].length,
      title,
      line: index + 1,
      kind: "heading",
    });
  }

  return { items, pageCount: null };
}

function extractFountainOutline(content: string): DocumentOutline {
  const items: OutlineItem[] = [];
  const lines = content.split(/\r?\n/);
  let state = createFountainState();
  let sectionLevel = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const classified = classifyFountainLine(line, state);
    state = classified.state;

    if (classified.type === "section") {
      const hashes = /^#+/.exec(line.trim())?.[0].length ?? 1;
      const title = line.trim().replace(/^#+\s*/, "");
      if (title.length > 0) {
        sectionLevel = hashes;
        items.push({
          level: Math.min(hashes, 6),
          title,
          line: index + 1,
          kind: "section",
        });
      }
    } else if (classified.type === "scene") {
      const title = line.trim().replace(/^\./, "");
      if (title.length > 0) {
        items.push({
          level: sectionLevel > 0 ? Math.min(6, sectionLevel + 1) : 1,
          title,
          line: index + 1,
          kind: "scene",
        });
      }
    }
  }

  return { items, pageCount: estimateFountainPages(content) };
}

function cleanInlineMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~]{1,3}/g, "")
    .replace(/<[^>]+>/g, "")
    .trim();
}
