import { changeBadge, changeLabel, ChangeKind, commitFileKind, entryKind, formatVersionDate } from "../git/versions";
import { t } from "../i18n";
import {
  GitBranch,
  GitCommit,
  GitCommitFile,
  GitStatusEntry,
  Language,
} from "../types";

export interface VersionsPanelState {
  language: Language;
  isRepository: boolean;
  branch: string | null;
  entries: GitStatusEntry[];
  history: GitCommit[];
  branches: GitBranch[];
  commitMessage: string;
  authorReady: boolean;
  busy: boolean;
  historyLoading: boolean;
  expandedCommitId: string | null;
  commitFiles: Record<string, GitCommitFile[] | undefined>;
  error: string;
}

export interface VersionsPanelHandlers {
  onInit: () => void;
  onCommitMessageChange: (value: string) => void;
  onSaveVersion: () => void;
  onOpenChange: (path: string) => void;
  onDiscardChange: (path: string) => void;
  onToggleCommit: (id: string) => void;
  onRestoreFile: (commitId: string, path: string) => void;
  onCreateBranch: () => void;
  onCheckoutBranch: (name: string) => void;
  onOpenSettings: () => void;
}

function changeClass(kind: ChangeKind): string {
  return kind === "copied" ? "renamed" : kind;
}

/**
 * Sidebar panel with the writer-facing Git vocabulary: versions, history and
 * parallel drafts. Pure DOM construction so it can be tested with jsdom.
 */
export function createVersionsPanel(
  state: VersionsPanelState,
  handlers: VersionsPanelHandlers,
): HTMLElement {
  const root = document.createElement("div");
  root.className = "versions-panel";
  root.dataset.testid = "versions-panel";

  if (!state.isRepository) {
    root.appendChild(renderEnableState(state, handlers));
    return root;
  }

  if (state.error) {
    const error = document.createElement("div");
    error.className = "versions-error";
    error.textContent = state.error;
    root.appendChild(error);
  }

  root.appendChild(renderSaveSection(state, handlers));
  root.appendChild(renderChangesSection(state, handlers));
  root.appendChild(renderHistorySection(state, handlers));
  root.appendChild(renderBranchesSection(state, handlers));
  return root;
}

function renderEnableState(
  state: VersionsPanelState,
  handlers: VersionsPanelHandlers,
): HTMLElement {
  const section = document.createElement("section");
  section.className = "versions-enable";

  const title = document.createElement("h4");
  title.textContent = t(state.language, "versionsEnableTitle");
  const hint = document.createElement("p");
  hint.textContent = t(state.language, "versionsEnableHint");
  const button = document.createElement("button");
  button.className = "toolbar-btn primary";
  button.dataset.testid = "enable-versions-btn";
  button.textContent = t(state.language, "versionsEnableAction");
  button.disabled = state.busy;
  button.onclick = () => handlers.onInit();

  section.append(title, hint, button);
  return section;
}

function renderSaveSection(
  state: VersionsPanelState,
  handlers: VersionsPanelHandlers,
): HTMLElement {
  const section = document.createElement("section");
  section.className = "versions-section versions-save";

  const heading = document.createElement("div");
  heading.className = "versions-heading";
  const branch = document.createElement("span");
  branch.className = "versions-branch";
  branch.textContent = `⑂ ${state.branch ?? t(state.language, "gitNoBranch")}`;
  const pending = document.createElement("span");
  pending.className = "versions-pending";
  pending.textContent = t(state.language, "versionsPendingChanges", {
    count: String(state.entries.length),
  });
  heading.append(branch, pending);
  section.appendChild(heading);

  if (state.entries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "versions-muted";
    empty.textContent = t(state.language, "versionsNoChanges");
    section.appendChild(empty);
    return section;
  }

  if (!state.authorReady) {
    const hint = document.createElement("p");
    hint.className = "versions-author-hint";
    hint.textContent = t(state.language, "versionsAuthorMissing");
    const settingsBtn = document.createElement("button");
    settingsBtn.className = "versions-link-btn";
    settingsBtn.dataset.testid = "versions-open-settings";
    settingsBtn.textContent = t(state.language, "versionsOpenSettings");
    settingsBtn.onclick = () => handlers.onOpenSettings();
    const hintRow = document.createElement("div");
    hintRow.className = "versions-author-row";
    hintRow.append(hint, settingsBtn);
    section.appendChild(hintRow);
  }

  const label = document.createElement("label");
  label.className = "versions-label";
  label.textContent = t(state.language, "versionsSummaryLabel");
  const input = document.createElement("input");
  input.className = "text-input versions-message-input";
  input.dataset.testid = "version-message";
  input.placeholder = t(state.language, "versionsSummaryPlaceholder");
  input.value = state.commitMessage;
  input.oninput = () => handlers.onCommitMessageChange(input.value);

  const save = document.createElement("button");
  save.className = "toolbar-btn primary versions-save-btn";
  save.dataset.testid = "save-version-btn";
  save.disabled = state.busy;
  save.textContent = state.busy
    ? t(state.language, "versionsSaving")
    : t(state.language, "versionsSave");
  save.onclick = () => handlers.onSaveVersion();

  section.append(label, input, save);
  return section;
}

function renderChangesSection(
  state: VersionsPanelState,
  handlers: VersionsPanelHandlers,
): HTMLElement {
  const section = document.createElement("section");
  section.className = "versions-section";
  const title = document.createElement("h4");
  title.className = "versions-section-title";
  title.textContent = t(state.language, "versionsChangesTitle");
  section.appendChild(title);

  for (const entry of state.entries) {
    const kind = entryKind(entry);
    const row = document.createElement("div");
    row.className = "version-change-row";
    row.dataset.changePath = entry.path;

    const badge = document.createElement("span");
    badge.className = `tree-git-badge git-badge-${changeClass(kind)}`;
    badge.textContent = changeBadge(kind);

    const name = document.createElement("span");
    name.className = "version-change-path";
    name.textContent = entry.path;
    name.title = entry.path;

    const label = document.createElement("span");
    label.className = "version-change-label";
    label.textContent = changeLabel(kind, state.language);

    const discard = document.createElement("button");
    discard.className = "tree-mini-btn version-row-btn";
    discard.title = t(state.language, "discardChangesTitle");
    discard.textContent = "↺";
    discard.onclick = (event) => {
      event.stopPropagation();
      handlers.onDiscardChange(entry.path);
    };

    row.append(badge, name, label, discard);

    if (kind !== "deleted") {
      row.title = t(state.language, "versionsOpenDiff");
      row.tabIndex = 0;
      row.onclick = () => handlers.onOpenChange(entry.path);
      row.onkeydown = (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handlers.onOpenChange(entry.path);
        }
      };
    }

    section.appendChild(row);
  }

  return section;
}

function renderHistorySection(
  state: VersionsPanelState,
  handlers: VersionsPanelHandlers,
): HTMLElement {
  const section = document.createElement("section");
  section.className = "versions-section";
  const title = document.createElement("h4");
  title.className = "versions-section-title";
  title.textContent = t(state.language, "versionsHistory");
  section.appendChild(title);

  if (state.history.length === 0) {
    const empty = document.createElement("p");
    empty.className = "versions-muted";
    empty.textContent = state.historyLoading
      ? t(state.language, "versionsHistoryLoading")
      : t(state.language, "versionsNoHistory");
    section.appendChild(empty);
    return section;
  }

  for (const commit of state.history) {
    const expanded = state.expandedCommitId === commit.id;
    const item = document.createElement("div");
    item.className = "version-commit";
    item.classList.toggle("expanded", expanded);

    const head = document.createElement("button");
    head.className = "version-commit-head";
    head.dataset.commitId = commit.id;
    head.setAttribute("aria-expanded", String(expanded));

    const subject = document.createElement("span");
    subject.className = "version-commit-subject";
    subject.textContent = commit.subject;

    const meta = document.createElement("span");
    meta.className = "version-commit-meta";
    meta.textContent = `${formatVersionDate(commit.date, state.language)} · ${commit.author}`;

    head.append(subject, meta);
    head.onclick = () => handlers.onToggleCommit(commit.id);
    item.appendChild(head);

    if (expanded) {
      const files = state.commitFiles[commit.id];
      if (!files) {
        const loading = document.createElement("p");
        loading.className = "versions-muted version-files-loading";
        loading.textContent = t(state.language, "versionsHistoryLoading");
        item.appendChild(loading);
      } else if (files.length === 0) {
        const empty = document.createElement("p");
        empty.className = "versions-muted version-files-loading";
        empty.textContent = t(state.language, "versionsNoCommitFiles");
        item.appendChild(empty);
      } else {
        const fileTitle = document.createElement("div");
        fileTitle.className = "version-files-title";
        fileTitle.textContent = t(state.language, "versionsCommitFiles", {
          count: String(files.length),
        });
        item.appendChild(fileTitle);

        for (const file of files) {
          item.appendChild(renderCommitFile(state, handlers, commit, file));
        }
      }
    }

    section.appendChild(item);
  }

  return section;
}

function renderCommitFile(
  state: VersionsPanelState,
  handlers: VersionsPanelHandlers,
  commit: GitCommit,
  file: GitCommitFile,
): HTMLElement {
  const kind = commitFileKind(file);
  const row = document.createElement("div");
  row.className = "version-file-row";

  const badge = document.createElement("span");
  badge.className = `tree-git-badge git-badge-${changeClass(kind)}`;
  badge.textContent = changeBadge(kind);

  const name = document.createElement("span");
  name.className = "version-file-path";
  name.textContent = file.path;
  name.title = file.oldPath ? `${file.oldPath} → ${file.path}` : file.path;

  const restore = document.createElement("button");
  restore.className = "tree-mini-btn version-row-btn";
  restore.dataset.restorePath = file.path;
  restore.title = `${t(state.language, "versionsRestore")} · ${commit.subject}`;
  restore.textContent = "↺";
  restore.onclick = (event) => {
    event.stopPropagation();
    handlers.onRestoreFile(commit.id, file.path);
  };

  row.append(badge, name, restore);
  if (kind !== "deleted") {
    row.classList.add("clickable");
    row.onclick = () => handlers.onOpenChange(file.path);
  }
  return row;
}

function renderBranchesSection(
  state: VersionsPanelState,
  handlers: VersionsPanelHandlers,
): HTMLElement {
  const section = document.createElement("section");
  section.className = "versions-section";

  const header = document.createElement("div");
  header.className = "versions-section-header";
  const title = document.createElement("h4");
  title.className = "versions-section-title";
  title.textContent = t(state.language, "versionsBranches");
  const add = document.createElement("button");
  add.className = "tree-mini-btn";
  add.dataset.testid = "new-branch-btn";
  add.title = t(state.language, "versionsNewBranch");
  add.textContent = "＋";
  add.disabled = state.busy;
  add.onclick = () => handlers.onCreateBranch();
  header.append(title, add);
  section.appendChild(header);

  if (state.branches.length === 0) {
    const empty = document.createElement("p");
    empty.className = "versions-muted";
    empty.textContent = state.historyLoading
      ? t(state.language, "versionsHistoryLoading")
      : t(state.language, "versionsNoBranches");
    section.appendChild(empty);
    return section;
  }

  for (const branch of state.branches) {
    const row = document.createElement("div");
    row.className = "version-branch-row";
    row.classList.toggle("current", branch.current);

    const name = document.createElement("span");
    name.className = "version-branch-name";
    name.textContent = branch.name;

    row.appendChild(name);

    if (branch.current) {
      const current = document.createElement("span");
      current.className = "version-branch-current";
      current.textContent = t(state.language, "versionsCurrentDraft");
      row.appendChild(current);
    } else {
      const switchBtn = document.createElement("button");
      switchBtn.className = "versions-link-btn";
      switchBtn.dataset.branchName = branch.name;
      switchBtn.textContent = t(state.language, "versionsSwitch");
      switchBtn.disabled = state.busy;
      switchBtn.onclick = () => handlers.onCheckoutBranch(branch.name);
      row.appendChild(switchBtn);
    }

    section.appendChild(row);
  }

  return section;
}
