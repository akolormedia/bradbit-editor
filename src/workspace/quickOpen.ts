import { FileTreeNode } from "../types";

export interface QuickOpenFile {
  path: string;
  name: string;
}

export function flattenFileTree(nodes: FileTreeNode[]): QuickOpenFile[] {
  const files: QuickOpenFile[] = [];
  const walk = (items: FileTreeNode[]) => {
    for (const node of items) {
      if (node.isDir) {
        if (node.children) walk(node.children);
      } else {
        files.push({ path: node.path, name: node.name });
      }
    }
  };
  walk(nodes);
  return files.sort((a, b) => compare(a.path, b.path));
}

/**
 * Ranks files for the quick-open palette: exact name, name prefix, name
 * substring, then any path substring. Ties prefer shorter names and paths.
 */
export function filterQuickOpenFiles(
  files: QuickOpenFile[],
  query: string,
  limit = 50,
): QuickOpenFile[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) {
    return files.slice(0, Math.max(0, limit));
  }

  const scored: Array<{ file: QuickOpenFile; score: number }> = [];
  for (const file of files) {
    const name = file.name.toLowerCase();
    const path = file.path.toLowerCase();
    let score: number | null = null;
    if (name === needle) score = 0;
    else if (name.startsWith(needle)) score = 1;
    else if (name.includes(needle)) score = 2;
    else if (path.includes(needle)) score = 3;
    if (score !== null) scored.push({ file, score });
  }

  scored.sort(
    (a, b) =>
      a.score - b.score ||
      a.file.name.length - b.file.name.length ||
      compare(a.file.path, b.file.path),
  );
  return scored.slice(0, Math.max(0, limit)).map((entry) => entry.file);
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
