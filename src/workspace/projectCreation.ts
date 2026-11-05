export type ProjectDraftError = "template" | "name" | "nameInvalid" | "destination";

export function parentDirectory(path: string): string {
  if (!path) return "";
  if (/^\/+$/.test(path)) return "/";
  const trimmed = path.replace(/\/+$/, "");
  if (!trimmed) return "";
  const index = trimmed.lastIndexOf("/");
  if (index <= 0) return index === 0 ? "/" : "";
  return trimmed.slice(0, index);
}

export function projectPathPreview(destination: string, name: string): string {
  const folder = destination.trim().replace(/\/+$/, "");
  const projectName = name.trim();
  if (!folder || !projectName) return "";
  return `${folder}/${projectName}`;
}

export function defaultProjectDestination(currentRootPath: string | null): string {
  return currentRootPath ? parentDirectory(currentRootPath) : "";
}

export function validateProjectDraft(params: {
  templateId: string;
  name: string;
  destination: string;
}): ProjectDraftError | null {
  if (!params.templateId.trim()) return "template";

  const name = params.name.trim();
  if (!name) return "name";
  if (name === "." || name === ".." || name.startsWith(".")) return "nameInvalid";
  if (
    name.length > 120 ||
    /[/\\:\0]/.test(name) ||
    [...name].some((character) => character.charCodeAt(0) < 32)
  ) {
    return "nameInvalid";
  }

  if (!params.destination.trim()) return "destination";
  return null;
}
