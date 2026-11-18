import { FileTreeNode } from "../types";
import { classifyFountainLine, createFountainState } from "./fountain";

export interface FountainSymbols {
  characters: string[];
  locations: string[];
}

export const EMPTY_FOUNTAIN_SYMBOLS: FountainSymbols = {
  characters: [],
  locations: [],
};

const SCENE_PREFIX =
  /^(?:INT\.\/EXT\.|INT\/EXT\.|EXT\/INT\.|I\/E\.|INT\.|EXT\.|EST\.)\s*/i;

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

/** Character cues already used in the current screenplay. */
export function extractFountainCharacters(source: string): string[] {
  const characters: string[] = [];
  let state = createFountainState();
  for (const line of source.split(/\r?\n/)) {
    const classified = classifyFountainLine(line, state);
    state = classified.state;
    if (classified.type !== "character") continue;
    characters.push(line.trim().replace(/^@/, ""));
  }
  return uniqueNames(characters);
}

/** Scene locations already used in the current screenplay. */
export function extractFountainLocations(source: string): string[] {
  const locations: string[] = [];
  let state = createFountainState();
  for (const line of source.split(/\r?\n/)) {
    const classified = classifyFountainLine(line, state);
    state = classified.state;
    if (classified.type !== "scene") continue;
    let text = line.trim();
    if (text.startsWith(".") && !SCENE_PREFIX.test(text)) {
      text = text.replace(/^\.+/, "");
    }
    text = text.replace(SCENE_PREFIX, "");
    const location = text.split(/\s+-\s+/)[0]?.trim() ?? "";
    if (location) locations.push(location);
  }
  return uniqueNames(locations);
}

/**
 * Reads a bible Markdown file and returns its display name and aliases.
 * Frontmatter (`name`, `aliases`) wins; otherwise the first `# Heading` is used.
 */
export function parseBibleEntry(markdown: string): string[] {
  const lines = markdown.replace(/^\uFEFF/, "").split(/\r?\n/);
  const names: string[] = [];
  let aliasBlock = false;

  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex(
      (line, index) => index > 0 && line.trim() === "---",
    );
    if (end > 0) {
      for (const line of lines.slice(1, end)) {
        const nameMatch = line.match(/^name\s*:\s*(.+)$/i);
        if (nameMatch) {
          names.push(nameMatch[1].trim().replace(/^["']|["']$/g, ""));
          aliasBlock = false;
          continue;
        }

        const aliasMatch = line.match(/^aliases?\s*:\s*(.*)$/i);
        if (aliasMatch) {
          const value = aliasMatch[1].trim();
          if (value.startsWith("[") && value.endsWith("]")) {
            names.push(
              ...value
                .slice(1, -1)
                .split(",")
                .map((alias) => alias.trim().replace(/^["']|["']$/g, "")),
            );
          } else if (value.length > 0) {
            names.push(
              ...value
                .split(",")
                .map((alias) => alias.trim().replace(/^["']|["']$/g, "")),
            );
          } else {
            aliasBlock = true;
          }
          continue;
        }

        if (aliasBlock) {
          const item = line.match(/^\s*-\s+(.+)$/);
          if (item) {
            names.push(item[1].trim().replace(/^["']|["']$/g, ""));
            continue;
          }
          if (line.trim().length > 0 && !line.startsWith(" ")) {
            aliasBlock = false;
          }
        }
      }
    }
  }

  if (names.length === 0) {
    const heading = lines.find((line) => /^#\s+/.test(line.trim()));
    if (heading) {
      names.push(heading.trim().replace(/^#\s+/, "").trim());
    }
  }

  return uniqueNames(names);
}

/** Project bible files under the supported character/location folders. */
export function collectBibleFilePaths(
  tree: FileTreeNode[],
  folderNames: string[],
): string[] {
  const prefixes = folderNames.map((folder) => `${folder}/`);
  const paths: string[] = [];

  const visit = (nodes: FileTreeNode[]): void => {
    for (const node of nodes) {
      if (node.isDir) {
        visit(node.children ?? []);
        continue;
      }
      if (!prefixes.some((prefix) => node.path.startsWith(prefix))) continue;
      if (node.name.startsWith("_")) continue;
      if (!/\.(md|markdown|mdx)$/i.test(node.name)) continue;
      paths.push(node.path);
    }
  };

  visit(tree);
  return paths;
}

export function collectFountainSymbols(
  source: string,
  bibleCharacters: string[] = [],
  bibleLocations: string[] = [],
): FountainSymbols {
  return {
    characters: uniqueNames([
      ...bibleCharacters,
      ...extractFountainCharacters(source),
    ]),
    locations: uniqueNames([
      ...bibleLocations,
      ...extractFountainLocations(source),
    ]),
  };
}
