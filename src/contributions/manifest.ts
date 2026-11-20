export interface SymbolSourceContribution {
  id: string;
  language: string;
  kind: string;
  include: string[];
  name?: string;
  aliases?: string[];
  fallback?: string;
}

export interface ContributionManifest {
  id?: string;
  name?: string;
  version?: string;
  contributes?: {
    symbolSources?: SymbolSourceContribution[];
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function parseSymbolSource(value: unknown): SymbolSourceContribution | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === "string" ? value.id.trim() : "";
  const language = typeof value.language === "string" ? value.language.trim() : "";
  const kind = typeof value.kind === "string" ? value.kind.trim() : "";
  const include = stringArray(value.include)
    .map((pattern) => pattern.trim())
    .filter(Boolean);
  if (!id || !language || !kind || include.length === 0) return null;

  return {
    id,
    language,
    kind,
    include,
    ...(typeof value.name === "string" ? { name: value.name } : {}),
    ...(Array.isArray(value.aliases)
      ? { aliases: stringArray(value.aliases) }
      : {}),
    ...(typeof value.fallback === "string"
      ? { fallback: value.fallback }
      : {}),
  };
}

/**
 * Parses the optional `bradbit-kit.json` / extension manifest. Invalid
 * contributions are ignored instead of breaking the editor or the project.
 */
export function parseContributionManifest(
  raw: string,
): ContributionManifest | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;

  const contributes = isRecord(parsed.contributes)
    ? parsed.contributes
    : undefined;
  const sources = Array.isArray(contributes?.symbolSources)
    ? contributes.symbolSources
        .map(parseSymbolSource)
        .filter((source): source is SymbolSourceContribution => source !== null)
    : [];

  return {
    ...(typeof parsed.id === "string" ? { id: parsed.id } : {}),
    ...(typeof parsed.name === "string" ? { name: parsed.name } : {}),
    ...(typeof parsed.version === "string" ? { version: parsed.version } : {}),
    ...(sources.length > 0
      ? { contributes: { symbolSources: sources } }
      : {}),
  };
}

export function symbolSourcesForLanguage(
  manifest: ContributionManifest | null,
  language: string,
): SymbolSourceContribution[] {
  return manifest?.contributes?.symbolSources?.filter(
    (source) => source.language === language,
  ) ?? [];
}

/** Small glob matcher for project-relative paths (`*`, `**` and `?`). */
export function globToRegExp(glob: string): RegExp {
  const normalized = glob.replaceAll("\\", "/");
  let pattern = "";
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === "*" && normalized[index + 1] === "*") {
      const slash = normalized[index + 2] === "/";
      pattern += slash ? "(?:.*/)?" : ".*";
      index += slash ? 2 : 1;
      continue;
    }
    if (character === "*") {
      pattern += "[^/]*";
      continue;
    }
    if (character === "?") {
      pattern += "[^/]";
      continue;
    }
    pattern += character.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${pattern}$`);
}

export function matchesGlob(path: string, glob: string): boolean {
  return globToRegExp(glob).test(path);
}

export function matchesAnySource(
  path: string,
  sources: SymbolSourceContribution[],
): boolean {
  return sources.some((source) =>
    source.include.some((pattern) => matchesGlob(path, pattern)),
  );
}
