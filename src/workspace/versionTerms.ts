import { t, TranslationKey } from "../i18n";
import { Language } from "../types";

/**
 * Optional Git vocabulary for the versioning workspace. The default UI uses
 * writer-friendly words; developers can opt into Stage/Unstage/Commit terms
 * from Settings → Git while developer options are enabled.
 */
const DEVELOPER_TERMS: Partial<Record<TranslationKey, string>> = {
  versionChangesTab: "Changes",
  versionHistoryTab: "History",
  versionViewDiff: "View Diff",
  versionFilterLabel: "Filter changes",
  versionFilterAll: "All changes",
  versionFilterStaged: "Staged",
  versionFilterUnstaged: "Unstaged",
  versionStageAll: "Stage All",
  versionUnstageAll: "Unstage All",
  versionTrackedGroup: "Tracked",
  versionUntrackedGroup: "Untracked",
  versionStageAction: "Stage",
  versionUnstageAction: "Unstage",
  versionStageTooltip: "git add",
  versionUnstageTooltip: "git restore --staged",
  versionComposerTitle: "Commit message",
  versionComposerPlaceholder: "Describe the changes",
  versionCommitAll: "Stage All & Commit",
  versionCommitTooltip: "git commit",
  versionGenerateMessage: "Generate commit message",
  versionGenerateUnavailable: "Connect a model to generate a commit message",
  versionGeneratingMessage: "Generating commit message…",
  versionGenerateError: "Could not generate a commit message.",
  versionGenerateNoModel: "Open a session with a model to generate a commit message.",
  versionChangesTitle: "Uncommitted Changes",
  versionOpenFile: "Open File",
  versionExpandAll: "Expand All",
  versionCollapseAll: "Collapse All",
  versionUnstageFile: "Unstage",
  versionUnstageFileTooltip: "git restore --staged",
  versionDiscardFile: "Restore",
  versionDiscardFileTooltip: "git restore",
  versionDiffBinary: "Binary file",
  versionDiffEmpty: "No text changes",
  versionDiffLoading: "Loading changes…",
  versionDiffTruncated: "Diff truncated to {count} lines.",
  versionDiffWith: "Changes since HEAD",
  versionFetch: "Fetch",
  versionFetchFrom: "Fetch from",
  versionPull: "Pull",
  versionPush: "Push",
  versionPushTo: "Push to",
  versionPublish: "Publish",
  versionRefresh: "Refresh",
  versionBranchMenu: "Branch actions",
  versionAhead: "{count} to push",
  versionBehind: "{count} to pull",
  versionNoRemote: "No remote configured.",
  versionMessageRequired: "Write a commit message.",
  versionFetchDone: "Fetched",
  versionPullDone: "Pulled",
  versionPushDone: "Pushed",
  versionNoRepository: "No Git repository",
  versionsHistory: "Commit history",
  versionsBranches: "Branches",
  versionsCurrentDraft: "Current branch",
  versionsNewBranch: "New branch",
  versionsSwitch: "Switch",
  versionsRestore: "Restore",
  versionsSave: "Commit",
  versionsSaving: "Committing…",
  versionsSaved: "Version committed",
  versionsNoChanges: "No changes",
  versionsNoHistory: "No commits yet.",
  versionsHistoryLoading: "Loading history…",
  versionsCommitFiles: "Files ({count})",
  versionsNoCommitFiles: "No files in this commit.",
  versionsAuthorMissing: "Set your author name and email in Settings.",
  versionsOpenSettings: "Open Settings",
  versionsPendingChanges: "Pending changes ({count})",
  versionStagedSummary: "{count} of {total} staged",
  versionNothingStaged: "Stage at least one file to commit",
  versionsNoBranches: "No branches yet.",
  versionsRestoreTitle: "Restore file",
};

export function versionTerm(
  language: Language,
  developerTerms: boolean,
  key: TranslationKey,
  vars?: Record<string, string>,
): string {
  const template = developerTerms ? DEVELOPER_TERMS[key] : undefined;
  if (!template) return t(language, key, vars);
  if (!vars) return template;
  return Object.entries(vars).reduce(
    (text, [name, value]) => text.split(`{${name}}`).join(value),
    template,
  );
}
