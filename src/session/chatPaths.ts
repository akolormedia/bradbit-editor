/**
 * Converts a path reported by an OpenCode tool into a project-relative path.
 * Returns null when the path is outside the opened project or tries to traverse
 * upwards, so chat cards can never open arbitrary files.
 */
export function projectRelativePath(
  root: string | null | undefined,
  raw: string,
): string | null {
  if (!raw) return null;
  let path = raw.trim().replace(/^["']|["']$/g, "").replace(/\\/g, "/");
  if (!path) return null;

  const normalizedRoot = root
    ?.trim()
    .replace(/\\/g, "/")
    .replace(/\/+$/, "");
  if (path.startsWith("/")) {
    if (!normalizedRoot) return null;
    if (!path.startsWith(`${normalizedRoot}/`)) return null;
    path = path.slice(normalizedRoot.length + 1);
  }

  const parts = path.split("/").filter((part) => part && part !== ".");
  if (parts.length === 0 || parts.includes("..")) return null;
  return parts.join("/");
}
