import { FileTreeNode } from "../types";

export function normalizeTreeFilter(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Filters a project tree by file/folder name or relative path.
 *
 * - Matching files stay in the tree.
 * - Parent folders are kept when any descendant matches.
 * - A matching folder keeps all of its children visible.
 * - Matching is case- and accent-insensitive.
 */
export function filterTreeByQuery(
  nodes: FileTreeNode[],
  query: string,
): FileTreeNode[] {
  const normalized = normalizeTreeFilter(query);
  if (!normalized) return nodes;

  const result: FileTreeNode[] = [];
  for (const node of nodes) {
    const nodeMatches =
      normalizeTreeFilter(node.name).includes(normalized) ||
      normalizeTreeFilter(node.path).includes(normalized);

    if (node.isDir) {
      if (nodeMatches) {
        result.push(node);
        continue;
      }
      const children = node.children
        ? filterTreeByQuery(node.children, query)
        : [];
      if (children.length > 0) {
        result.push({ ...node, children });
      }
    } else if (nodeMatches) {
      result.push(node);
    }
  }
  return result;
}
