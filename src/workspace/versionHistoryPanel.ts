import { commitFileKind, formatVersionDate } from "../git/versions";
import { t } from "../i18n";
import {
  GitBranch,
  GitCommit,
  GitCommitFile,
  GitHubPullRequest,
  Language,
} from "../types";
import { createIconButton } from "../ui/iconButton";
import { createVersionStatus } from "./versionStatus";
import { versionTerm } from "./versionTerms";

export interface VersionHistoryState {
  language: Language;
  developerTerms: boolean;
  history: GitCommit[];
  branches: GitBranch[];
  historyLoading: boolean;
  expandedCommitId: string | null;
  commitFiles: Record<string, GitCommitFile[] | undefined>;
  busy: boolean;
  githubTokenPresent: boolean;
  githubAccount: string | null;
  hasRemote: boolean;
  githubRepo: string | null;
  githubPullRequests: GitHubPullRequest[];
  githubPrLoading: boolean;
}

export interface VersionHistoryHandlers {
  onToggleCommit: (id: string) => void;
  onRestoreFile: (commitId: string, path: string) => void;
  onCreateBranch: () => void;
  onCheckoutBranch: (name: string) => void;
  onConnectGitHub: () => void;
  onOpenGitHubUrl: (url: string) => void;
  onRefreshPullRequests: () => void;
  onOpenPullRequest: (url: string) => void;
}

/**
 * History, parallel drafts and GitHub status for the versioning sidebar.
 */
export function createVersionHistoryPanel(
  state: VersionHistoryState,
  handlers: VersionHistoryHandlers,
): HTMLElement {
  const root = document.createElement("div");
  root.className = "version-history-view";
  root.append(
    renderCommitList(state, handlers),
    renderBranches(state, handlers),
    renderGitHub(state, handlers),
  );
  return root;
}

function renderCommitList(
  state: VersionHistoryState,
  handlers: VersionHistoryHandlers,
): HTMLElement {
  const section = document.createElement("section");
  section.className = "version-history";
  const title = document.createElement("div");
  title.className = "version-section-label";
  title.textContent = versionTerm(state.language, state.developerTerms, "versionsHistory");
  section.appendChild(title);

  if (state.history.length === 0) {
    const empty = document.createElement("p");
    empty.className = "versions-muted";
    empty.textContent = state.historyLoading
      ? versionTerm(state.language, state.developerTerms, "versionsHistoryLoading")
      : versionTerm(state.language, state.developerTerms, "versionsNoHistory");
    section.appendChild(empty);
    return section;
  }

  for (const commit of state.history) {
    const expanded = state.expandedCommitId === commit.id;
    const item = document.createElement("div");
    item.className = "version-commit";
    item.classList.toggle("expanded", expanded);

    const head = document.createElement("button");
    head.type = "button";
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
        loading.textContent = versionTerm(state.language, state.developerTerms, "versionsHistoryLoading");
        item.appendChild(loading);
      } else if (files.length === 0) {
        const empty = document.createElement("p");
        empty.className = "versions-muted version-files-loading";
        empty.textContent = versionTerm(state.language, state.developerTerms, "versionsNoCommitFiles");
        item.appendChild(empty);
      } else {
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
  state: VersionHistoryState,
  handlers: VersionHistoryHandlers,
  commit: GitCommit,
  file: GitCommitFile,
): HTMLElement {
  const kind = commitFileKind(file);
  const row = document.createElement("div");
  row.className = "version-file-row";

  const badge = createVersionStatus(
    kind,
    state.language,
    state.developerTerms,
  );

  const name = document.createElement("span");
  name.className = "version-file-path";
  name.textContent = file.path;
  name.title = file.oldPath ? `${file.oldPath} → ${file.path}` : file.path;

  const restore = createIconButton({
    icon: "rotate-ccw",
    label: versionTerm(state.language, state.developerTerms, "versionsRestore"),
    title: `${versionTerm(state.language, state.developerTerms, "versionsRestore")} · ${commit.subject}`,
    className: "tree-mini-btn version-row-btn",
    onClick: (event) => {
      event.stopPropagation();
      handlers.onRestoreFile(commit.id, file.path);
    },
  });
  restore.dataset.restorePath = file.path;

  row.append(badge, name, restore);
  return row;
}

function renderBranches(
  state: VersionHistoryState,
  handlers: VersionHistoryHandlers,
): HTMLElement {
  const section = document.createElement("section");
  section.className = "version-branches";
  const header = document.createElement("div");
  header.className = "version-section-header";
  const title = document.createElement("div");
  title.className = "version-section-label";
  title.textContent = versionTerm(state.language, state.developerTerms, "versionsBranches");
  const add = createIconButton({
    icon: "plus",
    label: versionTerm(state.language, state.developerTerms, "versionsNewBranch"),
    className: "tree-mini-btn",
    testId: "new-branch-btn",
    disabled: state.busy,
    onClick: () => handlers.onCreateBranch(),
  });
  header.append(title, add);
  section.appendChild(header);

  if (state.branches.length === 0) {
    const empty = document.createElement("p");
    empty.className = "versions-muted";
    empty.textContent = state.historyLoading
      ? versionTerm(state.language, state.developerTerms, "versionsHistoryLoading")
      : versionTerm(state.language, state.developerTerms, "versionsNoBranches");
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
      current.textContent = versionTerm(state.language, state.developerTerms, "versionsCurrentDraft");
      row.appendChild(current);
    } else {
      const switchBtn = document.createElement("button");
      switchBtn.type = "button";
      switchBtn.className = "versions-link-btn";
      switchBtn.dataset.branchName = branch.name;
      switchBtn.textContent = versionTerm(state.language, state.developerTerms, "versionsSwitch");
      switchBtn.disabled = state.busy;
      switchBtn.onclick = () => handlers.onCheckoutBranch(branch.name);
      row.appendChild(switchBtn);
    }
    section.appendChild(row);
  }
  return section;
}

function renderGitHub(
  state: VersionHistoryState,
  handlers: VersionHistoryHandlers,
): HTMLElement {
  const section = document.createElement("section");
  section.className = "version-github";
  const title = document.createElement("div");
  title.className = "version-section-label";
  title.textContent = t(state.language, "githubSectionTitle");
  section.appendChild(title);

  if (!state.githubTokenPresent) {
    const connect = document.createElement("button");
    connect.type = "button";
    connect.className = "version-stage-btn";
    connect.dataset.testid = "connect-github-btn";
    connect.textContent = t(state.language, "githubConnectAction");
    connect.onclick = () => handlers.onConnectGitHub();
    section.appendChild(connect);
    return section;
  }

  if (state.githubAccount) {
    const account = document.createElement("p");
    account.className = "versions-muted";
    account.textContent = t(state.language, "githubConnectedAs", {
      login: state.githubAccount,
    });
    section.appendChild(account);
  }

  if (state.githubRepo) {
    const repo = document.createElement("button");
    repo.type = "button";
    repo.className = "versions-link-btn";
    repo.dataset.testid = "github-repo-link";
    repo.textContent = state.githubRepo;
    repo.onclick = () =>
      handlers.onOpenGitHubUrl(`https://github.com/${state.githubRepo}`);
    section.appendChild(repo);

    const prHeader = document.createElement("div");
    prHeader.className = "version-section-header version-pr-header";
    const prTitle = document.createElement("span");
    prTitle.className = "version-section-label";
    prTitle.textContent = t(state.language, "githubPrOpenList");
    const refresh = createIconButton({
      icon: "refresh-cw",
      label: t(state.language, "githubPrRefresh"),
      className: "tree-mini-btn",
      testId: "github-pr-refresh",
      disabled: state.githubPrLoading,
      onClick: () => handlers.onRefreshPullRequests(),
    });
    prHeader.append(prTitle, refresh);
    section.appendChild(prHeader);

    if (state.githubPrLoading) {
      const loading = document.createElement("p");
      loading.className = "versions-muted";
      loading.textContent = t(state.language, "githubPrLoading");
      section.appendChild(loading);
    } else if (state.githubPullRequests.length === 0) {
      const empty = document.createElement("p");
      empty.className = "versions-muted";
      empty.textContent = t(state.language, "githubPrNone");
      section.appendChild(empty);
    } else {
      for (const pr of state.githubPullRequests) {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "github-pr-row";
        row.dataset.testid = `github-pr-${pr.number}`;
        row.title = t(state.language, "githubOpenInBrowser");
        const label = document.createElement("span");
        label.className = "github-pr-title";
        label.textContent = `#${pr.number} ${pr.title}`;
        const meta = document.createElement("span");
        meta.className = "github-pr-meta";
        meta.textContent = `${pr.headRef} → ${pr.baseRef}`;
        row.append(label, meta);
        row.onclick = () => handlers.onOpenPullRequest(pr.htmlUrl);
        section.appendChild(row);
      }
    }
  } else {
    const hint = document.createElement("p");
    hint.className = "versions-muted";
    hint.textContent = state.hasRemote
      ? t(state.language, "githubRemoteNotGitHub")
      : t(state.language, "githubNoRemote");
    section.appendChild(hint);
  }
  return section;
}

