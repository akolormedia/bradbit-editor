import { entryKind } from "../git/versions";
import { GitFileChange, GitStatusEntry, Language } from "../types";
import { createIcon } from "../ui/icons";
import { createIconButton } from "../ui/iconButton";
import {
  formatVersionCount,
  isEntryStaged,
  versionFileDir,
  versionFileName,
  versionTotals,
} from "./versionChanges";
import { parseVersionDiff, VersionDiffLine } from "./versionDiff";
import {
  createVersionStatus,
  versionChangeLabel,
} from "./versionStatus";
import { versionTerm } from "./versionTerms";

export type VersionDiffState =
  | { status: "loading" }
  | { status: "ready"; patch: string }
  | { status: "error"; message: string };

export interface VersionChangesViewState {
  language: Language;
  developerTerms: boolean;
  entries: GitStatusEntry[];
  stats: Record<string, GitFileChange>;
  diffs: Record<string, VersionDiffState | undefined>;
  expanded: Set<string>;
  selectedPath: string | null;
  busy: boolean;
}

export interface VersionChangesViewHandlers {
  onToggleFile: (path: string) => void;
  onSelectFile: (path: string) => void;
  onFileContextMenu: (path: string, event: MouseEvent) => void;
  onToggleStage: (path: string) => void;
  onStageSelected: () => void;
  onUnstageSelected: () => void;
  onStageAll: () => void;
  onOpenFile: (path: string) => void;
  onUnstageFile: (path: string) => void;
  onDiscardFile: (path: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onFocusComposer: () => void;
}

const MAX_DIFF_LINES = 3000;

export function createVersionChangesView(
  state: VersionChangesViewState,
  handlers: VersionChangesViewHandlers,
): HTMLElement {
  const root = document.createElement("div");
  root.className = "version-changes-view";
  root.dataset.testid = "version-changes-view";

  root.append(renderToolbar(state, handlers), renderFiles(state, handlers));
  return root;
}

function renderToolbar(
  state: VersionChangesViewState,
  handlers: VersionChangesViewHandlers,
): HTMLElement {
  const toolbar = document.createElement("div");
  toolbar.className = "version-changes-toolbar";

  const layouts = document.createElement("div");
  layouts.className = "version-changes-tools";
  layouts.append(
    createIconButton({
      icon: "chevron-down",
      label: versionTerm(state.language, state.developerTerms, "versionExpandAll"),
      title: versionTerm(state.language, state.developerTerms, "versionExpandAll"),
      className: "version-tool-btn",
      onClick: () => handlers.onExpandAll(),
    }),
    createIconButton({
      icon: "chevron-up",
      label: versionTerm(state.language, state.developerTerms, "versionCollapseAll"),
      title: versionTerm(state.language, state.developerTerms, "versionCollapseAll"),
      className: "version-tool-btn",
      onClick: () => handlers.onCollapseAll(),
    }),
  );

  const totals = versionTotals(state.entries, state.stats);
  const stats = document.createElement("span");
  stats.className = "version-total-stats";
  stats.append(
    statSpan("added", `+${formatVersionCount(totals.added)}`),
    statSpan(
      "removed",
      `-${formatVersionCount(totals.removed)}`,
    ),
  );

  const actions = document.createElement("div");
  actions.className = "version-changes-actions";
  const selected = state.selectedPath;
  const selectedEntry = state.entries.find((entry) => entry.path === selected);
  const selectedStaged = selectedEntry ? isEntryStaged(selectedEntry) : false;

  const stage = document.createElement("button");
  stage.type = "button";
  stage.className = "version-stage-btn";
  stage.dataset.testid = "version-stage-selected";
  stage.textContent = versionTerm(state.language, state.developerTerms, "versionStageAction");
  stage.title = versionTerm(state.language, state.developerTerms, "versionStageTooltip");
  stage.disabled = state.busy || !selectedEntry || selectedStaged;
  stage.onclick = () => handlers.onStageSelected();

  const unstage = document.createElement("button");
  unstage.type = "button";
  unstage.className = "version-stage-btn";
  unstage.dataset.testid = "version-unstage-selected";
  unstage.textContent = versionTerm(state.language, state.developerTerms, "versionUnstageAction");
  unstage.title = versionTerm(state.language, state.developerTerms, "versionUnstageTooltip");
  unstage.disabled = state.busy || !selectedEntry || !selectedStaged;
  unstage.onclick = () => handlers.onUnstageSelected();

  const stageAll = document.createElement("button");
  stageAll.type = "button";
  stageAll.className = "version-stage-btn";
  stageAll.dataset.testid = "version-stage-all-view";
  stageAll.textContent = versionTerm(state.language, state.developerTerms, "versionStageAll");
  stageAll.disabled = state.busy || state.entries.length === 0;
  stageAll.onclick = () => handlers.onStageAll();

  const save = document.createElement("button");
  save.type = "button";
  save.className = "version-save-view-btn";
  save.dataset.testid = "version-focus-composer";
  save.textContent = versionTerm(state.language, state.developerTerms, "versionsSave");
  save.disabled = state.busy;
  save.onclick = () => handlers.onFocusComposer();

  actions.append(stage, unstage, stageAll, save);
  toolbar.append(layouts, stats, actions);
  return toolbar;
}

function renderFiles(
  state: VersionChangesViewState,
  handlers: VersionChangesViewHandlers,
): HTMLElement {
  const list = document.createElement("div");
  list.className = "version-file-list";

  if (state.entries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "version-changes-empty";
    empty.appendChild(createIcon("check", 24));
    const text = document.createElement("p");
    text.textContent = versionTerm(state.language, state.developerTerms, "versionsNoChanges");
    empty.appendChild(text);
    list.appendChild(empty);
    return list;
  }

  for (const entry of state.entries) {
    list.appendChild(renderFileCard(state, handlers, entry));
  }
  return list;
}

function renderFileCard(
  state: VersionChangesViewState,
  handlers: VersionChangesViewHandlers,
  entry: GitStatusEntry,
): HTMLElement {
  const kind = entryKind(entry);
  const expanded = state.expanded.has(entry.path);
  const staged = isEntryStaged(entry);
  const card = document.createElement("section");
  card.className = "version-file-card";
  card.classList.toggle("expanded", expanded);
  card.classList.toggle("selected", state.selectedPath === entry.path);
  card.dataset.versionFile = entry.path;

  const header = document.createElement("div");
  header.className = "version-file-header";
  header.tabIndex = 0;
  header.onclick = () => handlers.onSelectFile(entry.path);
  header.onkeydown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handlers.onSelectFile(entry.path);
    }
  };
  header.oncontextmenu = (event) => {
    event.preventDefault();
    handlers.onFileContextMenu(entry.path, event);
  };

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "version-file-toggle";
  toggle.dataset.testid = `version-toggle-${entry.path}`;
  toggle.setAttribute("aria-expanded", String(expanded));
  toggle.appendChild(createIcon(expanded ? "chevron-down" : "chevron-right", 14));
  toggle.onclick = (event) => {
    event.stopPropagation();
    handlers.onToggleFile(entry.path);
  };

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "version-checkbox";
  checkbox.checked = staged;
  checkbox.disabled = state.busy;
  checkbox.title = staged
    ? versionTerm(state.language, state.developerTerms, "versionUnstageTooltip")
    : versionTerm(state.language, state.developerTerms, "versionStageTooltip");
  checkbox.setAttribute(
    "aria-label",
    staged
      ? versionTerm(state.language, state.developerTerms, "versionUnstageAction")
      : versionTerm(state.language, state.developerTerms, "versionStageAction"),
  );
  checkbox.onclick = (event) => event.stopPropagation();
  checkbox.onchange = () => handlers.onToggleStage(entry.path);

  const badge = createVersionStatus(
    kind,
    state.language,
    state.developerTerms,
  );

  const name = document.createElement("span");
  name.className = "version-file-name";
  name.textContent = versionFileName(entry.path);
  name.title = entry.path;

  const dir = document.createElement("span");
  dir.className = "version-file-dir";
  dir.textContent = versionFileDir(entry.path);

  const label = document.createElement("span");
  label.className = "version-file-label";
  label.textContent = versionChangeLabel(
    kind,
    state.language,
    state.developerTerms,
  );

  const stat = state.stats[entry.path];
  const stats = document.createElement("span");
  stats.className = "version-file-stats";
  if (stat) {
    stats.append(
      statSpan("added", `+${formatVersionCount(stat.added)}`),
      statSpan(
        "removed",
        `-${formatVersionCount(stat.removed)}`,
      ),
    );
  }

  const open = document.createElement("button");
  open.type = "button";
  open.className = "version-open-file";
  open.dataset.testid = `version-open-${entry.path}`;
  open.title = versionTerm(state.language, state.developerTerms, "versionOpenFile");
  const openLabel = document.createElement("span");
  openLabel.className = "version-open-label";
  openLabel.textContent = versionTerm(
    state.language,
    state.developerTerms,
    "versionOpenFile",
  );
  open.append(createIcon("external-link", 11), openLabel);
  open.onclick = (event) => {
    event.stopPropagation();
    handlers.onOpenFile(entry.path);
  };

  header.append(toggle, badge, name, dir, label, stats, checkbox, open);
  if (kind === "deleted") {
    open.classList.add("hidden");
    open.tabIndex = -1;
    open.setAttribute("aria-hidden", "true");
  }
  card.appendChild(header);

  if (expanded) {
    const staged = isEntryStaged(entry);
    const worktreeChanged =
      entry.worktree !== "unmodified" || entry.index === "untracked";
    const actions = { unstage: staged, discard: worktreeChanged };
    const actionsBar = renderDiffActions(
      entry,
      handlers,
      actions,
      state.language,
      state.developerTerms,
    );
    if (actionsBar) card.appendChild(actionsBar);
    card.appendChild(renderDiff(state, entry));
  }
  return card;
}

interface DiffLineActions {
  unstage: boolean;
  discard: boolean;
}

function renderDiff(
  state: VersionChangesViewState,
  entry: GitStatusEntry,
): HTMLElement {
  const container = document.createElement("div");
  container.className = "version-diff";

  const diff = state.diffs[entry.path];
  if (!diff || diff.status === "loading") {
    const loading = document.createElement("div");
    loading.className = "version-diff-note";
    loading.textContent = versionTerm(state.language, state.developerTerms, "versionDiffLoading");
    container.appendChild(loading);
    return container;
  }

  if (diff.status === "error") {
    const error = document.createElement("div");
    error.className = "version-diff-note error";
    error.textContent = diff.message;
    container.appendChild(error);
    return container;
  }

  const parsed = parseVersionDiff(diff.patch);
  if (parsed.binary) {
    const note = document.createElement("div");
    note.className = "version-diff-note";
    note.textContent = versionTerm(state.language, state.developerTerms, "versionDiffBinary");
    container.appendChild(note);
    return container;
  }

  if (parsed.empty || parsed.hunks.length === 0) {
    const note = document.createElement("div");
    note.className = "version-diff-note";
    note.textContent = versionTerm(state.language, state.developerTerms, "versionDiffEmpty");
    container.appendChild(note);
    return container;
  }

  let rendered = 0;
  for (const hunk of parsed.hunks) {
    const symbol = document.createElement("div");
    symbol.className = "version-diff-hunk-header";
    symbol.title = hunk.header;
    symbol.setAttribute("aria-label", hunk.header);
    container.appendChild(symbol);

    for (const line of hunk.lines) {
      if (rendered >= MAX_DIFF_LINES) {
        const note = document.createElement("div");
        note.className = "version-diff-note";
        note.textContent = versionTerm(
          state.language,
          state.developerTerms,
          "versionDiffTruncated",
          { count: String(MAX_DIFF_LINES) },
        );
        container.appendChild(note);
        return container;
      }
      container.appendChild(renderDiffLine(line));
      rendered += 1;
    }
  }
  return container;
}

function renderDiffLine(line: VersionDiffLine): HTMLElement {
  const row = document.createElement("div");
  row.className = `version-diff-line version-diff-${line.kind}`;
  if (line.kind === "meta") {
    row.textContent = line.text;
    return row;
  }

  const oldNumber = document.createElement("span");
  oldNumber.className = "version-diff-number";
  oldNumber.textContent = line.oldLine === null ? "" : String(line.oldLine);

  const newNumber = document.createElement("span");
  newNumber.className = "version-diff-number";
  newNumber.textContent = line.newLine === null ? "" : String(line.newLine);

  const marker = document.createElement("span");
  marker.className = "version-diff-marker";
  marker.textContent =
    line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " ";

  const text = document.createElement("span");
  text.className = "version-diff-text";
  text.textContent = line.text.length > 0 ? line.text : " ";

  row.append(oldNumber, newNumber, marker, text);
  return row;
}

function renderDiffActions(
  entry: GitStatusEntry,
  handlers: VersionChangesViewHandlers,
  actions: DiffLineActions,
  language: Language,
  developerTerms: boolean,
): HTMLElement | null {
  if (!actions.unstage && !actions.discard) return null;
  const bar = document.createElement("div");
  bar.className = "version-diff-actions-bar";

  if (actions.unstage) {
    bar.appendChild(
      diffActionButton(
        "x",
        versionTerm(language, developerTerms, "versionUnstageAction"),
        versionTerm(language, developerTerms, "versionUnstageFileTooltip"),
        () => handlers.onUnstageFile(entry.path),
      ),
    );
  }
  if (actions.discard) {
    bar.appendChild(
      diffActionButton(
        "rotate-ccw",
        versionTerm(language, developerTerms, "versionDiscardFile"),
        versionTerm(language, developerTerms, "versionDiscardFileTooltip"),
        () => handlers.onDiscardFile(entry.path),
      ),
    );
  }
  return bar;
}

function diffActionButton(
  icon: "x" | "rotate-ccw",
  label: string,
  title: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "version-diff-action-btn";
  button.title = title;
  button.setAttribute("aria-label", title);
  button.append(createIcon(icon, 11), document.createTextNode(label));
  button.onclick = (event) => {
    event.stopPropagation();
    onClick();
  };
  return button;
}

function statSpan(kind: "added" | "removed", text: string): HTMLElement {
  const span = document.createElement("span");
  span.className = `version-stat version-stat-${kind}`;
  span.textContent = text;
  return span;
}
