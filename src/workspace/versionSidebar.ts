import {
  changeBadge,
  changeLabel,
  entryKind,
} from "../git/versions";
import { t } from "../i18n";
import {
  GitBranch,
  GitCommit,
  GitCommitFile,
  GitFileChange,
  GitHubPullRequest,
  GitStatusEntry,
  Language,
} from "../types";
import { openContextMenu } from "../ui/contextMenu";
import { createIcon } from "../ui/icons";
import { createIconButton } from "../ui/iconButton";
import { createVersionHistoryPanel } from "./versionHistoryPanel";
import {
  filterVersionEntries,
  formatVersionCount,
  groupVersionEntries,
  isEntryStaged,
  VersionFilter,
  versionFileDir,
  versionFileName,
  versionTotals,
} from "./versionChanges";

export type VersionSidebarView = "changes" | "history";

export interface VersionSidebarState {
  language: Language;
  view: VersionSidebarView;
  filter: VersionFilter;
  isRepository: boolean;
  branch: string | null;
  ahead: number;
  behind: number;
  entries: GitStatusEntry[];
  stats: Record<string, GitFileChange>;
  selectedPath: string | null;
  history: GitCommit[];
  branches: GitBranch[];
  historyLoading: boolean;
  expandedCommitId: string | null;
  commitFiles: Record<string, GitCommitFile[] | undefined>;
  commitMessage: string;
  authorReady: boolean;
  busy: boolean;
  error: string;
  githubTokenPresent: boolean;
  githubAccount: string | null;
  hasRemote: boolean;
  githubRepo: string | null;
  githubPullRequests: GitHubPullRequest[];
  githubPrLoading: boolean;
  generatingMessage: boolean;
}

export interface VersionSidebarHandlers {
  onInit: () => void;
  onViewChange: (view: VersionSidebarView) => void;
  onFilterChange: (filter: VersionFilter) => void;
  onSelectChange: (path: string) => void;
  onOpenChanges: () => void;
  onToggleStage: (path: string) => void;
  onStagePaths: (paths: string[]) => void;
  onUnstagePaths: (paths: string[]) => void;
  onStageAll: () => void;
  onUnstageAll: () => void;
  onDiscardChange: (path: string) => void;
  onCommitMessageChange: (value: string) => void;
  onSaveVersion: (stageAll: boolean) => void;
  onGenerateMessage: () => void;
  onToggleCommit: (id: string) => void;
  onRestoreFile: (commitId: string, path: string) => void;
  onCreateBranch: () => void;
  onCheckoutBranch: (name: string) => void;
  onOpenSettings: () => void;
  onBranchMenu: (event: MouseEvent) => void;
  onPush: () => void;
  onPublish: () => void;
  onConnectGitHub: () => void;
  onOpenGitHubUrl: (url: string) => void;
  onRefreshPullRequests: () => void;
  onOpenPullRequest: (url: string) => void;
}

function changeClass(kind: ReturnType<typeof entryKind>): string {
  return kind === "copied" ? "renamed" : kind;
}

/**
 * Left rail of the versioning workspace: Changes/History, file staging with
 * line counts, branch sync and the pinned version composer.
 */
export function createVersionSidebar(
  state: VersionSidebarState,
  handlers: VersionSidebarHandlers,
): HTMLElement {
  const root = document.createElement("div");
  root.className = "version-sidebar";
  root.dataset.testid = "version-sidebar";

  if (!state.isRepository) {
    root.appendChild(renderEnableState(state, handlers));
    return root;
  }

  root.append(
    renderViewTabs(state, handlers),
    renderBody(state, handlers),
    renderFooter(state, handlers),
  );
  return root;
}

function renderEnableState(
  state: VersionSidebarState,
  handlers: VersionSidebarHandlers,
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

function renderViewTabs(
  state: VersionSidebarState,
  handlers: VersionSidebarHandlers,
): HTMLElement {
  const tabs = document.createElement("div");
  tabs.className = "version-view-tabs";
  tabs.setAttribute("role", "tablist");

  const counts = state.entries.length;
  const items: Array<{ id: VersionSidebarView; label: string }> = [
    {
      id: "changes",
      label: `${t(state.language, "versionChangesTab")} (${counts})`,
    },
    { id: "history", label: t(state.language, "versionHistoryTab") },
  ];

  for (const item of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "tab");
    button.className = "version-view-tab";
    button.dataset.versionView = item.id;
    button.textContent = item.label;
    button.setAttribute("aria-selected", String(state.view === item.id));
    button.classList.toggle("active", state.view === item.id);
    button.onclick = () => handlers.onViewChange(item.id);
    tabs.appendChild(button);
  }
  return tabs;
}

function renderBody(
  state: VersionSidebarState,
  handlers: VersionSidebarHandlers,
): HTMLElement {
  const body = document.createElement("div");
  body.className = "version-sidebar-body";

  if (state.error) {
    const error = document.createElement("div");
    error.className = "versions-error";
    error.textContent = state.error;
    body.appendChild(error);
  }

  if (state.view === "history") {
    body.appendChild(createVersionHistoryPanel(state, handlers));
    return body;
  }

  body.append(
    renderChangesHeader(state, handlers),
    renderChangeGroups(state, handlers),
  );
  return body;
}

function renderChangesHeader(
  state: VersionSidebarState,
  handlers: VersionSidebarHandlers,
): HTMLElement {
  const header = document.createElement("div");
  header.className = "version-changes-header";

  const filter = document.createElement("select");
  filter.className = "version-filter";
  filter.dataset.testid = "version-filter";
  filter.setAttribute("aria-label", t(state.language, "versionFilterLabel"));
  const options: Array<{ value: VersionFilter; label: string }> = [
    { value: "all", label: t(state.language, "versionFilterAll") },
    { value: "staged", label: t(state.language, "versionFilterStaged") },
    { value: "unstaged", label: t(state.language, "versionFilterUnstaged") },
  ];
  for (const option of options) {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = option.label;
    element.selected = state.filter === option.value;
    filter.appendChild(element);
  }
  filter.onchange = () =>
    handlers.onFilterChange(filter.value as VersionFilter);

  const totals = versionTotals(state.entries, state.stats);
  const view = document.createElement("button");
  view.type = "button";
  view.className = "version-link-btn";
  view.dataset.testid = "version-view-diff";
  view.textContent = t(state.language, "versionViewDiff");
  view.onclick = () => handlers.onOpenChanges();
  view.title = t(state.language, "versionViewDiff");

  const stats = document.createElement("span");
  stats.className = "version-total-stats";
  stats.append(
    statSpan("added", `+${formatVersionCount(totals.added)}`),
    statSpan(
      "removed",
      `-${formatVersionCount(totals.removed)}`,
    ),
  );
  view.appendChild(stats);
  header.append(filter, view);

  const actions = document.createElement("div");
  actions.className = "version-stage-actions";
  const stageAll = document.createElement("button");
  stageAll.type = "button";
  stageAll.className = "version-stage-btn";
  stageAll.dataset.testid = "version-stage-all";
  stageAll.textContent = t(state.language, "versionStageAll");
  stageAll.title = t(state.language, "versionStageTooltip");
  stageAll.disabled = state.busy || state.entries.length === 0;
  stageAll.onclick = () => handlers.onStageAll();

  const stagedCount = state.entries.filter(isEntryStaged).length;
  const unstageAll = document.createElement("button");
  unstageAll.type = "button";
  unstageAll.className = "version-stage-btn";
  unstageAll.dataset.testid = "version-unstage-all";
  unstageAll.textContent = t(state.language, "versionUnstageAll");
  unstageAll.title = t(state.language, "versionUnstageTooltip");
  unstageAll.disabled = state.busy || stagedCount === 0;
  unstageAll.onclick = () => handlers.onUnstageAll();

  actions.append(stageAll, unstageAll);
  header.appendChild(actions);
  return header;
}

function renderChangeGroups(
  state: VersionSidebarState,
  handlers: VersionSidebarHandlers,
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const filtered = filterVersionEntries(state.entries, state.filter);
  const groups = groupVersionEntries(filtered);

  if (filtered.length === 0) {
    const empty = document.createElement("p");
    empty.className = "versions-muted version-empty";
    empty.textContent = t(state.language, "versionsNoChanges");
    fragment.appendChild(empty);
    return fragment;
  }

  if (groups.tracked.length > 0) {
    fragment.appendChild(
      renderGroup(
        state,
        handlers,
        t(state.language, "versionTrackedGroup"),
        groups.tracked,
        "tracked",
      ),
    );
  }
  if (groups.untracked.length > 0) {
    fragment.appendChild(
      renderGroup(
        state,
        handlers,
        t(state.language, "versionUntrackedGroup"),
        groups.untracked,
        "untracked",
      ),
    );
  }
  return fragment;
}

function renderGroup(
  state: VersionSidebarState,
  handlers: VersionSidebarHandlers,
  title: string,
  entries: GitStatusEntry[],
  group: "tracked" | "untracked",
): HTMLElement {
  const section = document.createElement("section");
  section.className = "version-group";
  section.dataset.versionGroup = group;

  const header = document.createElement("div");
  header.className = "version-group-header";
  const label = document.createElement("span");
  label.className = "version-group-title";
  label.textContent = title;
  const count = document.createElement("span");
  count.className = "version-group-count";
  count.textContent = String(entries.length);

  const staged = entries.filter(isEntryStaged);
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "version-checkbox";
  checkbox.checked = staged.length === entries.length && entries.length > 0;
  checkbox.indeterminate = staged.length > 0 && staged.length < entries.length;
  checkbox.disabled = state.busy;
  checkbox.setAttribute(
    "aria-label",
    staged.length === entries.length
      ? t(state.language, "versionUnstageAll")
      : t(state.language, "versionStageAll"),
  );
  checkbox.onclick = (event) => event.stopPropagation();
  checkbox.onchange = () => {
    if (checkbox.checked) {
      handlers.onStagePaths(entries.map((entry) => entry.path));
    } else {
      handlers.onUnstagePaths(entries.map((entry) => entry.path));
    }
  };
  header.append(label, count, checkbox);
  section.appendChild(header);

  for (const entry of entries) {
    section.appendChild(renderChangeRow(state, handlers, entry));
  }
  return section;
}

function renderChangeRow(
  state: VersionSidebarState,
  handlers: VersionSidebarHandlers,
  entry: GitStatusEntry,
): HTMLElement {
  const kind = entryKind(entry);
  const row = document.createElement("div");
  row.className = "version-change-row";
  row.dataset.changePath = entry.path;
  row.classList.toggle("selected", state.selectedPath === entry.path);
  row.tabIndex = 0;
  row.title = entry.path;

  const badge = document.createElement("span");
  badge.className = `tree-git-badge git-badge-${changeClass(kind)}`;
  badge.textContent = changeBadge(kind);
  badge.title = changeLabel(kind, state.language);

  const name = document.createElement("span");
  name.className = "version-change-name";
  name.textContent = versionFileName(entry.path);

  const dir = document.createElement("span");
  dir.className = "version-change-dir";
  dir.textContent = versionFileDir(entry.path);

  const label = document.createElement("span");
  label.className = "version-change-label";
  label.textContent = changeLabel(kind, state.language);

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

  const staged = isEntryStaged(entry);
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "version-checkbox";
  checkbox.checked = staged;
  checkbox.disabled = state.busy;
  checkbox.dataset.stagePath = entry.path;
  checkbox.title = staged
    ? t(state.language, "versionUnstageTooltip")
    : t(state.language, "versionStageTooltip");
  checkbox.setAttribute(
    "aria-label",
    staged
      ? t(state.language, "versionUnstageAction")
      : t(state.language, "versionStageAction"),
  );
  checkbox.onclick = (event) => event.stopPropagation();
  checkbox.onchange = () => handlers.onToggleStage(entry.path);

  const discard = createIconButton({
    icon: "rotate-ccw",
    label: t(state.language, "discardChangesTitle"),
    className: "tree-mini-btn version-row-btn",
    onClick: (event) => {
      event.stopPropagation();
      handlers.onDiscardChange(entry.path);
    },
  });

  row.append(badge, name, dir, label, stats, checkbox, discard);
  row.onclick = () => handlers.onSelectChange(entry.path);
  row.onkeydown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handlers.onSelectChange(entry.path);
    }
  };
  return row;
}

function renderFooter(
  state: VersionSidebarState,
  handlers: VersionSidebarHandlers,
): HTMLElement {
  const footer = document.createElement("div");
  footer.className = "version-sidebar-footer";
  footer.append(renderBranchRow(state, handlers), renderComposer(state, handlers));
  return footer;
}

function renderBranchRow(
  state: VersionSidebarState,
  handlers: VersionSidebarHandlers,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "version-branch-bar";

  const branch = document.createElement("span");
  branch.className = "version-branch-name";
  branch.title = state.branch ?? t(state.language, "gitNoBranch");
  branch.append(createIcon("git-branch", 13), document.createTextNode(state.branch ?? t(state.language, "gitNoBranch")));

  const counters = document.createElement("span");
  counters.className = "version-branch-counters";
  if (state.ahead > 0) {
    counters.appendChild(
      spanWith(
        "version-ahead",
        t(state.language, "versionAhead", { count: String(state.ahead) }),
      ),
    );
  }
  if (state.behind > 0) {
    counters.appendChild(
      spanWith(
        "version-behind",
        t(state.language, "versionBehind", { count: String(state.behind) }),
      ),
    );
  }

  const actions = document.createElement("div");
  actions.className = "version-publish";
  const primary = document.createElement("button");
  primary.type = "button";
  primary.className = "version-publish-primary";
  primary.dataset.testid = "version-publish";
  primary.textContent = state.hasRemote
    ? t(state.language, "versionPush")
    : t(state.language, "versionPublish");
  primary.title = state.hasRemote ? "git push" : t(state.language, "versionPublish");
  primary.disabled = state.busy;
  primary.onclick = () => {
    if (state.hasRemote) handlers.onPush();
    else handlers.onPublish();
  };
  primary.appendChild(createIcon("arrow-up", 13));

  const more = document.createElement("button");
  more.type = "button";
  more.className = "version-publish-more";
  more.dataset.testid = "version-branch-menu";
  more.setAttribute("aria-label", t(state.language, "versionBranchMenu"));
  more.title = t(state.language, "versionBranchMenu");
  more.disabled = state.busy;
  more.appendChild(createIcon("chevron-down", 12));
  more.onclick = (event) => handlers.onBranchMenu(event);

  actions.append(primary, more);
  row.append(branch, counters, actions);
  return row;
}

function renderComposer(
  state: VersionSidebarState,
  handlers: VersionSidebarHandlers,
): HTMLElement {
  const composer = document.createElement("div");
  composer.className = "version-composer";

  const header = document.createElement("div");
  header.className = "version-composer-header";
  const label = document.createElement("span");
  label.className = "version-composer-label";
  label.textContent = t(state.language, "versionComposerTitle");

  const expand = createIconButton({
    icon: "maximize-2",
    label: t(state.language, "versionExpandAll"),
    className: "tree-mini-btn",
    onClick: () => composer.classList.toggle("expanded"),
  });

  const sparkles = createIconButton({
    icon: "sparkles",
    label: t(state.language, "versionGenerateMessage"),
    className: "tree-mini-btn version-ai-btn",
    testId: "version-generate-message",
    disabled: state.busy || state.generatingMessage,
    onClick: () => handlers.onGenerateMessage(),
  });
  header.append(label, sparkles, expand);
  composer.appendChild(header);

  let save: HTMLButtonElement | null = null;
  const refreshSaveState = () => {
    if (!save) return;
    save.disabled =
      state.busy ||
      state.generatingMessage ||
      !state.authorReady ||
      !input.value.trim() ||
      state.entries.filter(isEntryStaged).length === 0;
  };

  const input = document.createElement("textarea");
  input.className = "version-composer-input";
  input.dataset.testid = "version-message";
  input.rows = 3;
  input.value = state.commitMessage;
  input.placeholder = t(state.language, "versionComposerPlaceholder");
  input.disabled = state.busy || state.generatingMessage;
  input.oninput = () => {
    handlers.onCommitMessageChange(input.value);
    refreshSaveState();
  };
  composer.appendChild(input);

  if (!state.authorReady) {
    const author = document.createElement("p");
    author.className = "versions-author-hint";
    author.textContent = t(state.language, "versionsAuthorMissing");
    const settings = document.createElement("button");
    settings.type = "button";
    settings.className = "versions-link-btn";
    settings.dataset.testid = "versions-open-settings";
    settings.textContent = t(state.language, "versionsOpenSettings");
    settings.onclick = () => handlers.onOpenSettings();
    author.appendChild(settings);
    composer.appendChild(author);
  }

  const stagedCount = state.entries.filter(isEntryStaged).length;
  const meta = document.createElement("div");
  meta.className = "version-composer-meta";
  const summary = document.createElement("span");
  summary.className = stagedCount > 0 ? "version-staged-count" : "versions-muted";
  summary.textContent = state.generatingMessage
    ? t(state.language, "versionGeneratingMessage")
    : stagedCount > 0
      ? t(state.language, "versionStagedSummary", {
          count: String(stagedCount),
          total: String(state.entries.length),
        })
      : t(state.language, "versionNothingStaged");
  meta.appendChild(summary);

  const actions = document.createElement("div");
  actions.className = "version-composer-actions";
  save = document.createElement("button");
  save.type = "button";
  save.className = "version-commit-btn";
  save.dataset.testid = "save-version-btn";
  save.title = t(state.language, "versionCommitTooltip");
  save.disabled =
    state.busy ||
    state.generatingMessage ||
    stagedCount === 0 ||
    !state.commitMessage.trim() ||
    !state.authorReady;
  save.textContent = state.busy
    ? t(state.language, "versionsSaving")
    : t(state.language, "versionsSave");
  save.onclick = () => handlers.onSaveVersion(false);

  const more = document.createElement("button");
  more.type = "button";
  more.className = "version-commit-more";
  more.dataset.testid = "save-version-more";
  more.setAttribute("aria-label", t(state.language, "versionCommitAll"));
  more.disabled = state.busy || state.generatingMessage;
  more.appendChild(createIcon("chevron-up", 12));
  more.onclick = () => {
    const rect = more.getBoundingClientRect();
    openContextMenu({
      x: rect.left,
      y: rect.top - 4,
      label: t(state.language, "versionComposerTitle"),
      items: [
        {
          id: "commit-staged",
          label: t(state.language, "versionsSave"),
          icon: "check",
          disabled: stagedCount === 0 || !state.commitMessage.trim(),
          action: () => handlers.onSaveVersion(false),
        },
        {
          id: "commit-all",
          label: t(state.language, "versionCommitAll"),
          icon: "git-commit",
          disabled: !state.commitMessage.trim(),
          action: () => handlers.onSaveVersion(true),
        },
      ],
    });
  };

  actions.append(save, more);
  meta.appendChild(actions);
  composer.appendChild(meta);
  return composer;
}

function statSpan(kind: "added" | "removed", text: string): HTMLElement {
  const span = document.createElement("span");
  span.className = `version-stat version-stat-${kind}`;
  span.textContent = text;
  return span;
}

function spanWith(className: string, text: string): HTMLElement {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = text;
  return span;
}
