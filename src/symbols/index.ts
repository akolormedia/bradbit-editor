import { FileTreeNode } from "../types";
import {
  matchesGlob,
  SymbolSourceContribution,
} from "../contributions/manifest";

export interface SymbolEntry {
  name: string;
  aliases: string[];
  sourceId: string;
}

export type SymbolIndex = Map<string, SymbolEntry[]>;

function uniqueNames(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const name = value.trim();
    if (!name || name.includes("<") || name.includes(">")) continue;
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result;
}

function parseScalar(value: string): string | string[] {
  const trimmed = value.trim().replace(/^["']|["']$/g, "");
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((item) => item.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  return trimmed;
}

function parseFrontmatter(markdown: string): Map<string, string | string[]> {
  const values = new Map<string, string | string[]>();
  const lines = markdown.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return values;
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (end < 0) return values;

  let currentKey = "";
  for (const line of lines.slice(1, end)) {
    const keyValue = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (keyValue) {
      currentKey = keyValue[1];
      const parsed = parseScalar(keyValue[2]);
      if (parsed === "") {
        values.set(currentKey, []);
      } else {
        values.set(currentKey, parsed);
      }
      continue;
    }
    const item = line.match(/^\s*-\s+(.+)$/);
    if (item && currentKey) {
      const previous = values.get(currentKey);
      const list = Array.isArray(previous)
        ? previous
        : typeof previous === "string" && previous
          ? [previous]
          : [];
      list.push(item[1].trim().replace(/^["']|["']$/g, ""));
      values.set(currentKey, list);
    }
  }
  return values;
}

function firstHeading(markdown: string): string {
  const line = markdown
    .split(/\r?\n/)
    .find((candidate) => /^#\s+/.test(candidate.trim()));
  return line ? line.trim().replace(/^#\s+/, "").trim() : "";
}

function filenameName(path: string): string {
  const file = path.split("/").pop() ?? "";
  const stem = file
    .replace(/\.(md|markdown|mdx)$/i, "")
    .replace(/[-_]+/g, " ")
    .trim();
  return stem ? stem[0].toUpperCase() + stem.slice(1) : "";
}

function valueFromSelector(
  selector: string,
  frontmatter: Map<string, string | string[]>,
  markdown: string,
  path: string,
): string[] {
  if (selector === "heading") return [firstHeading(markdown)];
  if (selector === "filename") return [filenameName(path)];
  if (selector.startsWith("frontmatter.")) {
    const value = frontmatter.get(selector.slice("frontmatter.".length));
    if (Array.isArray(value)) return value;
    return value ? [value] : [];
  }
  return [];
}

/**
 * Reads a bible/document entry using the selectors declared by the symbol
 * source. No project folder names are hardcoded here.
 */
export function parseSymbolDocument(
  markdown: string,
  source: SymbolSourceContribution,
  path: string,
): SymbolEntry | null {
  const frontmatter = parseFrontmatter(markdown);
  const selectors = [
    ...(source.name ? [source.name] : []),
    "frontmatter.name",
    ...(source.fallback ? [source.fallback] : []),
    "heading",
    "filename",
  ];

  let names: string[] = [];
  for (const selector of selectors) {
    names = valueFromSelector(selector, frontmatter, markdown, path);
    if (uniqueNames(names).length > 0) break;
  }

  const aliases = (source.aliases ?? []).flatMap((selector) =>
    valueFromSelector(selector, frontmatter, markdown, path),
  );
  const all = uniqueNames([...names, ...aliases]);
  if (all.length === 0) return null;
  return {
    name: all[0],
    aliases: all.slice(1),
    sourceId: source.id,
  };
}

export function collectSourceFilePaths(
  tree: FileTreeNode[],
  source: SymbolSourceContribution,
): string[] {
  const paths: string[] = [];
  const visit = (nodes: FileTreeNode[]): void => {
    for (const node of nodes) {
      if (node.isDir) {
        visit(node.children ?? []);
        continue;
      }
      if (node.name.startsWith("_")) continue;
      if (!source.include.some((pattern) => matchesGlob(node.path, pattern))) {
        continue;
      }
      paths.push(node.path);
    }
  };
  visit(tree);
  return paths.sort((left, right) => left.localeCompare(right));
}

export async function loadSymbolIndex(
  tree: FileTreeNode[],
  sources: SymbolSourceContribution[],
  readFile: (path: string) => Promise<string>,
  limitPerSource = 300,
): Promise<SymbolIndex> {
  const index: SymbolIndex = new Map();
  const seen = new Map<string, Map<string, SymbolEntry>>();

  for (const source of sources) {
    const paths = collectSourceFilePaths(tree, source).slice(0, limitPerSource);
    for (const path of paths) {
      let markdown: string;
      try {
        markdown = await readFile(path);
      } catch (error) {
        console.error(`Could not read symbol source ${path}`, error);
        continue;
      }
      const entry = parseSymbolDocument(markdown, source, path);
      if (!entry) continue;

      const key = entry.name.toLocaleLowerCase();
      const byName = seen.get(source.kind) ?? new Map<string, SymbolEntry>();
      const existing = byName.get(key);
      if (existing) {
        existing.aliases = uniqueNames([...existing.aliases, ...entry.aliases]);
      } else {
        byName.set(key, entry);
      }
      seen.set(source.kind, byName);
    }
  }

  for (const [kind, entries] of seen) {
    const values = [...entries.values()];
    for (const entry of values) {
      entry.aliases.sort((left, right) => left.localeCompare(right));
    }
    index.set(
      kind,
      values.sort((left, right) => left.name.localeCompare(right.name)),
    );
  }
  return index;
}

export function symbolNames(index: SymbolIndex, kind: string): string[] {
  return uniqueNames(
    (index.get(kind) ?? []).flatMap((entry) => [
      entry.name,
      ...entry.aliases,
    ]),
  );
}
