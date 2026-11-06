import { GitRemote } from "../types";

export interface GitHubRepoRef {
  owner: string;
  repo: string;
}

export interface FoundGitHubRemote {
  remote: GitRemote;
  ref: GitHubRepoRef;
}

const SLUG = /^[A-Za-z0-9._-]+$/;

/**
 * Extracts `{ owner, repo }` from GitHub HTTPS/SSH remotes. Only github.com
 * is accepted because the REST client targets the public API.
 */
export function parseGitHubRemote(url: string): GitHubRepoRef | null {
  const trimmed = url.trim();
  let owner = "";
  let repo = "";

  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const parsed = new URL(trimmed);
      if (parsed.hostname.toLowerCase() !== "github.com") return null;
      const parts = parsed.pathname.replace(/^\/+|\/+$/g, "").split("/");
      if (parts.length !== 2) return null;
      [owner, repo] = parts;
    } else if (/^ssh:\/\//i.test(trimmed)) {
      const parsed = new URL(trimmed);
      if (parsed.hostname.toLowerCase() !== "github.com") return null;
      const parts = parsed.pathname.replace(/^\/+|\/+$/g, "").split("/");
      if (parts.length !== 2) return null;
      [owner, repo] = parts;
    } else {
      const match = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?\/?$/i.exec(trimmed);
      if (!match) return null;
      owner = match[1];
      repo = match[2];
    }
  } catch {
    return null;
  }

  repo = repo.replace(/\.git$/i, "").replace(/\/+$/g, "");
  if (!SLUG.test(owner) || !SLUG.test(repo)) return null;
  return { owner, repo };
}

export function githubRepoUrl(ref: GitHubRepoRef): string {
  return `https://github.com/${ref.owner}/${ref.repo}`;
}

/** Prefers `origin`, then the first remote that points to github.com. */
export function findGitHubRemote(remotes: GitRemote[]): FoundGitHubRemote | null {
  const ordered = [...remotes].sort((a, b) => {
    if (a.name === "origin" && b.name !== "origin") return -1;
    if (b.name === "origin" && a.name !== "origin") return 1;
    return 0;
  });
  for (const remote of ordered) {
    const ref = parseGitHubRemote(remote.url);
    if (ref) return { remote, ref };
  }
  return null;
}

/** Turns a folder name into a valid, readable GitHub repository name. */
export function sanitizeRepoName(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "")
    .slice(0, 100);
  return cleaned || "mi-proyecto";
}

export function isDefaultBranchName(name: string | null | undefined): boolean {
  return name === "main" || name === "master";
}

/** Picks the repository's default branch from the branch list. */
export function defaultBaseBranch(
  branches: string[],
  preferred = "main",
): string {
  if (branches.includes(preferred)) return preferred;
  if (branches.includes("main")) return "main";
  if (branches.includes("master")) return "master";
  return branches[0] ?? preferred;
}

/** Avoids overwriting an existing remote when publishing a new GitHub one. */
export function uniqueRemoteName(
  remotes: GitRemote[],
  base = "github",
): string {
  const names = new Set(remotes.map((remote) => remote.name));
  if (!names.has(base)) return base;
  let index = 2;
  while (names.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}
