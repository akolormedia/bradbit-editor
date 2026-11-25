import { ChangeKind, changeLabel } from "../git/versions";
import { Language } from "../types";
import { createIcon, IconName } from "../ui/icons";

const DEVELOPER_LABELS: Record<ChangeKind, string> = {
  added: "Added",
  deleted: "Deleted",
  modified: "Modified",
  renamed: "Renamed",
  copied: "Copied",
  conflicted: "Conflict",
  unknown: "Change",
};

const STATUS_ICONS: Record<ChangeKind, IconName> = {
  added: "plus",
  deleted: "trash",
  modified: "pencil",
  renamed: "arrow-up-right",
  copied: "copy",
  conflicted: "triangle-alert",
  unknown: "circle",
};

/**
 * Small outlined status mark used by the versioning workspace. The border and
 * glyph share the change color so added/modified/deleted read at a glance
 * without the heavy filled badges used by the file tree.
 */
export function versionChangeLabel(
  kind: ChangeKind,
  language: Language,
  developerTerms: boolean,
): string {
  return developerTerms ? DEVELOPER_LABELS[kind] : changeLabel(kind, language);
}

export function createVersionStatus(
  kind: ChangeKind,
  language: Language,
  developerTerms = false,
): HTMLElement {
  const status = document.createElement("span");
  const label = versionChangeLabel(kind, language, developerTerms);
  status.className = `version-status version-status-${kind}`;
  status.title = label;
  status.setAttribute("aria-label", label);
  status.appendChild(createIcon(STATUS_ICONS[kind], 10));
  return status;
}
