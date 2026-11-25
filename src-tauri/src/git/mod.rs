//! Local Git integration backed by libgit2 (`git2`).
//!
//! The editor no longer shells out to a system `git` executable: opening,
//! status, diffs, history, versions, branches, remotes and network operations
//! all run through the bundled libgit2. This keeps Bradbit usable on a clean
//! Mac without Git or Command Line Tools.
//!
//! Security and robustness rules:
//! - errors are actionable and pass through [`redact_secrets`];
//! - credentials are supplied through callbacks, never argv, `.git/config`
//!   or logs;
//! - network operations have bounded connect/server timeouts and accept
//!   cancellation tokens;
//! - local operations stay on the caller's worker thread.

mod redact;
#[cfg(test)]
mod tests;

pub mod api;

pub use crate::cancel::CancellationToken;
pub use redact::redact_secrets;

use git2::build::{CheckoutBuilder, RepoBuilder};
use git2::{
    BranchType, Cred, CredentialType, Delta, Diff, DiffFindOptions, DiffFormat, DiffOptions,
    ErrorCode, FetchOptions, IndexAddOption, ObjectType, PushOptions, RemoteCallbacks,
    Repository as GitRepository, RepositoryInitOptions, RepositoryState, ResetType, Signature,
    Sort, Status, StatusOptions, Tree,
};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::Duration;
use thiserror::Error;

/// Minimum bundled libgit2 version expected by the editor.
pub const MIN_LIBGIT2_VERSION: (u32, u32, u32) = (1, 9, 0);

/// Result of probing the bundled Git engine.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitVersion {
    pub major: u32,
    pub minor: u32,
    pub patch: u32,
    /// Raw engine version string, already safe to display.
    pub raw: String,
}

impl GitVersion {
    pub fn is_supported(&self) -> bool {
        (self.major, self.minor, self.patch) >= MIN_LIBGIT2_VERSION
    }
}

/// Version of the bundled libgit2 engine.
pub fn detect(_options: OpOptions) -> Result<GitVersion, GitError> {
    let version = git2::Version::get();
    let (major, minor, patch) = version.libgit2_version();
    Ok(GitVersion {
        major,
        minor,
        patch,
        raw: format!("libgit2 {major}.{minor}.{patch}"),
    })
}

/// Serializable health information for the bundled Git engine.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitEngineStatus {
    pub major: u32,
    pub minor: u32,
    pub patch: u32,
    pub raw: String,
    pub supported: bool,
}

/// Health snapshot used by the first-run screen.
pub fn engine_status() -> Result<GitEngineStatus, GitError> {
    let version = detect(OpOptions::default())?;
    let supported = version.is_supported();
    Ok(GitEngineStatus {
        major: version.major,
        minor: version.minor,
        patch: version.patch,
        raw: version.raw,
        supported,
    })
}

/// Default bound for network operations (clone/fetch/pull/push): much more
/// generous than local ops, still bounded so a stalled network fails instead
/// of hanging a worker forever.
pub const NETWORK_TIMEOUT: Duration = Duration::from_secs(300);

/// Per-call options: timeout and optional cancellation.
#[derive(Debug, Clone)]
pub struct OpOptions {
    pub timeout: Duration,
    pub cancel: Option<CancellationToken>,
}

impl Default for OpOptions {
    fn default() -> Self {
        Self {
            timeout: NETWORK_TIMEOUT,
            cancel: None,
        }
    }
}

impl OpOptions {
    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    pub fn cancel(mut self, token: CancellationToken) -> Self {
        self.cancel = Some(token);
        self
    }
}

/// Errors from Git operations. Messages are already redacted.
#[derive(Debug, Error)]
pub enum GitError {
    /// The Git engine is not available. Kept for API compatibility; the
    /// bundled libgit2 is always present in the desktop app.
    #[error("git is not available on this system: {0}")]
    Unavailable(String),

    #[error("git {operation} timed out after {after:?}")]
    Timeout { operation: String, after: Duration },

    #[error("git {operation} was cancelled")]
    Cancelled { operation: String },

    /// The operation failed. `stderr` is redacted and trimmed; it is meant to
    /// be shown to the user as the actionable explanation.
    #[error("git {operation} failed (exit {code:?}): {stderr}")]
    CommandFailed {
        operation: String,
        code: Option<i32>,
        stderr: String,
    },

    /// Local input rejected before running Git.
    #[error("invalid input: {0}")]
    InvalidInput(&'static str),

    /// A path operation failed before any Git work ran.
    #[error("failed to access `{path}`: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
}

fn check_cancel(operation: &str, options: &OpOptions) -> Result<(), GitError> {
    if options
        .cancel
        .as_ref()
        .is_some_and(|token| token.is_cancelled())
    {
        return Err(GitError::Cancelled {
            operation: operation.to_string(),
        });
    }
    Ok(())
}

fn git_error(operation: &str, error: git2::Error) -> GitError {
    if error.code() == ErrorCode::Timeout {
        return GitError::Timeout {
            operation: operation.to_string(),
            after: NETWORK_TIMEOUT,
        };
    }
    GitError::CommandFailed {
        operation: operation.to_string(),
        code: Some(error.raw_code()),
        stderr: redact_secrets(error.message()),
    }
}

fn not_a_repository(root: &Path, error: git2::Error) -> GitError {
    GitError::CommandFailed {
        operation: format!("`{}` is not a Git repository", root.display()),
        code: Some(error.raw_code()),
        stderr: redact_secrets(error.message()),
    }
}

fn validate_relative_path(path: &str) -> Result<(), GitError> {
    if path.is_empty() || path.starts_with('/') || path.split('/').any(|part| part == "..") {
        return Err(GitError::InvalidInput(
            "path must be project-relative without traversal",
        ));
    }
    Ok(())
}

fn validate_commitish(commit: &str) -> Result<(), GitError> {
    if commit.is_empty()
        || commit.starts_with('-')
        || commit
            .chars()
            .any(|c| c.is_whitespace() || c == ':' || c == '\0')
    {
        return Err(GitError::InvalidInput("invalid Git commit id"));
    }
    Ok(())
}

pub fn validate_branch_name(name: &str) -> Result<(), GitError> {
    let invalid = |reason: &'static str| Err(GitError::InvalidInput(reason));
    if name.is_empty() {
        return invalid("branch name must not be empty");
    }
    if name.starts_with('-') || name.starts_with('/') || name.ends_with('/') {
        return invalid("branch name must not start with '-' or '/' or end with '/'");
    }
    if name.ends_with(".lock") || name.ends_with('.') {
        return invalid("branch name must not end with '.lock' or '.'");
    }
    if name.contains("..") || name.contains("@{") {
        return invalid("branch name must not contain '..' or '@{'");
    }
    if name.split('/').any(|component| {
        component.is_empty() || component.starts_with('.') || component.ends_with('.')
    }) {
        return invalid("branch name components must not be empty, start or end with '.'");
    }
    if name.chars().any(|c| {
        c.is_ascii_control() || matches!(c, ' ' | '~' | '^' | ':' | '?' | '*' | '[' | '\\' | '\x7f')
    }) {
        return invalid("branch name contains forbidden characters");
    }
    Ok(())
}

/// Remote names, local paths and URLs are all valid `remote` arguments to
/// fetch/pull/push. The only security requirement is that the value can never
/// be mistaken for a flag (`-x`) or break an argument (whitespace, control
/// characters); everything else is data.
fn validate_remote_name(name: &str) -> Result<(), GitError> {
    if name.trim().is_empty() {
        return Err(GitError::InvalidInput("remote must not be empty"));
    }
    if name.starts_with('-') {
        return Err(GitError::InvalidInput("remote must not start with '-'"));
    }
    if name
        .chars()
        .any(|c| c.is_ascii_control() || c.is_whitespace())
    {
        return Err(GitError::InvalidInput(
            "remote must not contain whitespace or control characters",
        ));
    }
    Ok(())
}

/// Branch/remote context from status.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct BranchInfo {
    pub oid: Option<String>,
    pub head: Option<String>,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
}

/// Working-tree state of a single path (both sides of `XY`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WorktreeStatus {
    Unmodified,
    Modified,
    Added,
    Deleted,
    Renamed,
    Copied,
    Untracked,
    Conflicted,
    Unknown,
}

impl WorktreeStatus {
    pub fn is_clean(self) -> bool {
        matches!(self, WorktreeStatus::Unmodified)
    }
}

/// One path from status.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StatusEntry {
    pub path: String,
    pub index: WorktreeStatus,
    pub worktree: WorktreeStatus,
}

impl StatusEntry {
    pub fn is_conflicted(&self) -> bool {
        self.index == WorktreeStatus::Conflicted || self.worktree == WorktreeStatus::Conflicted
    }
}

/// A parsed commit from the history.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Commit {
    pub id: String,
    pub author: String,
    pub email: String,
    /// RFC 3339 timestamp with the commit's original offset.
    pub date: String,
    pub subject: String,
}

/// A file touched by a commit.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommitFile {
    pub path: String,
    pub old_path: Option<String>,
    /// Git status code: `M`, `A`, `D`, `R100`, `C75`, `T`…
    pub status: String,
}

/// Git blame for one line of a file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BlameLine {
    /// 1-based line number in the working-tree file.
    pub line: u32,
    pub author: String,
    pub email: String,
    /// RFC 3339 timestamp with the commit's original offset.
    pub date: String,
    pub commit: String,
    pub summary: String,
}

/// Per-file insertions/deletions.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileChange {
    pub path: String,
    pub added: u32,
    pub removed: u32,
}

/// A local branch.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Branch {
    pub name: String,
    /// Full object id of the branch tip.
    pub id: String,
    /// True for the branch currently checked out.
    pub current: bool,
}

/// Result of [`Repository::merge`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MergeOutcome {
    /// The branch was already an ancestor; nothing changed.
    UpToDate,
    /// The merge was a fast-forward; HEAD moved to the merged tip, no merge
    /// commit was created.
    FastForward,
    /// A merge commit was created; carries its id.
    Merged { id: String },
    /// The merge stopped on conflicts. Nothing was committed: conflicted
    /// files carry conflict markers and can be resolved and committed, or
    /// discarded with [`Repository::abort_merge`].
    Conflicts { files: Vec<String> },
}

/// Which comparison a diff should compute.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiffScope {
    /// Unstaged changes (working tree vs index).
    Worktree,
    /// Staged changes (index vs HEAD).
    Staged,
    /// Everything, working tree vs HEAD.
    WorktreeVsHead,
}

/// A handle to a Git working tree on disk.
///
/// Cheap to construct; it validates existence on [`Repository::open`] /
/// [`Repository::init`] and trusts the path afterwards.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Repository {
    root: PathBuf,
}

impl Repository {
    /// Open an existing repository rooted at `root`.
    ///
    /// Fails with an actionable error when `root` is not inside a work tree.
    pub fn open(root: &Path, options: OpOptions) -> Result<Self, GitError> {
        check_cancel("open", &options)?;
        let repo = GitRepository::open(root).map_err(|error| not_a_repository(root, error))?;
        if repo.workdir().is_none() {
            return Err(not_a_repository(
                root,
                git2::Error::from_str("not a working tree"),
            ));
        }
        Ok(Self {
            root: root.to_path_buf(),
        })
    }

    /// Initialize a new repository at `root` (the directory must exist).
    ///
    /// New projects start on `main` for determinism across machines.
    pub fn init(root: &Path, options: OpOptions) -> Result<Self, GitError> {
        Self::init_with_branch(root, "main", options)
    }

    /// Like [`Repository::init`] but pins the initial branch name.
    pub fn init_with_branch(
        root: &Path,
        branch: &str,
        options: OpOptions,
    ) -> Result<Self, GitError> {
        validate_branch_name(branch)?;
        check_cancel("init", &options)?;
        let mut init = RepositoryInitOptions::new();
        init.initial_head(branch);
        GitRepository::init_opts(root, &init).map_err(|error| git_error("init", error))?;
        Ok(Self {
            root: root.to_path_buf(),
        })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    fn open_engine(&self, operation: &str) -> Result<GitRepository, GitError> {
        GitRepository::open(&self.root).map_err(|error| git_error(operation, error))
    }

    /// Status plus branch/upstream context.
    pub fn status(
        &self,
        options: OpOptions,
    ) -> Result<(Option<BranchInfo>, Vec<StatusEntry>), GitError> {
        check_cancel("status", &options)?;
        let repo = self.open_engine("status")?;
        let branch = branch_info(&repo).map_err(|error| git_error("status", error))?;
        let mut status_options = StatusOptions::new();
        status_options
            .include_untracked(true)
            .recurse_untracked_dirs(true)
            .include_ignored(false)
            .renames_head_to_index(true)
            .renames_index_to_workdir(true);
        let statuses = repo
            .statuses(Some(&mut status_options))
            .map_err(|error| git_error("status", error))?;
        let entries = statuses
            .iter()
            .filter_map(|entry| {
                let path = status_path(&entry)?;
                let (index, worktree) = map_status(entry.status());
                Some(StatusEntry {
                    path,
                    index,
                    worktree,
                })
            })
            .collect();
        let has_branch = branch.oid.is_some() || branch.head.is_some();
        Ok((has_branch.then_some(branch), entries))
    }

    /// Last `limit` commits (newest first), at most 1000.
    pub fn log(&self, limit: usize, options: OpOptions) -> Result<Vec<Commit>, GitError> {
        check_cancel("log", &options)?;
        let limit = limit.clamp(1, 1000);
        let repo = self.open_engine("log")?;
        let mut walk = repo.revwalk().map_err(|error| git_error("log", error))?;
        if walk.push_head().is_err() {
            return Ok(Vec::new());
        }
        walk.set_sorting(Sort::TIME)
            .map_err(|error| git_error("log", error))?;
        let mut commits = Vec::new();
        for oid in walk.take(limit) {
            let oid = oid.map_err(|error| git_error("log", error))?;
            let commit = repo
                .find_commit(oid)
                .map_err(|error| git_error("log", error))?;
            let author = commit.author();
            commits.push(Commit {
                id: oid.to_string(),
                author: author.name().unwrap_or_default().to_string(),
                email: author.email().unwrap_or_default().to_string(),
                date: format_commit_date(commit.time()),
                subject: commit
                    .summary()
                    .ok()
                    .flatten()
                    .unwrap_or_default()
                    .to_string(),
            });
        }
        Ok(commits)
    }

    /// Files changed by a commit, including rename detection.
    pub fn commit_files(
        &self,
        commit: &str,
        options: OpOptions,
    ) -> Result<Vec<CommitFile>, GitError> {
        check_cancel("show", &options)?;
        validate_commitish(commit)?;
        let repo = self.open_engine("show")?;
        let object = repo
            .revparse_single(commit)
            .map_err(|error| git_error("show", error))?;
        let commit = object
            .peel_to_commit()
            .map_err(|error| git_error("show", error))?;
        let tree = commit.tree().map_err(|error| git_error("show", error))?;
        let parent_tree = if commit.parent_count() > 0 {
            Some(
                commit
                    .parent(0)
                    .and_then(|parent| parent.tree())
                    .map_err(|error| git_error("show", error))?,
            )
        } else {
            None
        };
        let mut diff = repo
            .diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), None)
            .map_err(|error| git_error("show", error))?;
        diff.find_similar(Some(&mut DiffFindOptions::new()))
            .map_err(|error| git_error("show", error))?;
        let mut files = Vec::new();
        diff.foreach(
            &mut |delta, _progress| {
                if let Some(path) = delta_path(&delta) {
                    let old_path = matches!(delta.status(), Delta::Renamed | Delta::Copied)
                        .then(|| {
                            delta
                                .old_file()
                                .path()
                                .map(|path| path.to_string_lossy().into_owned())
                        })
                        .flatten();
                    files.push(CommitFile {
                        path,
                        old_path,
                        status: delta_status(delta.status()).to_string(),
                    });
                }
                true
            },
            None,
            None,
            None,
        )
        .map_err(|error| git_error("show", error))?;
        Ok(files)
    }

    /// Unified diff for the given scope. Empty string means "no changes".
    pub fn diff(&self, scope: DiffScope, options: OpOptions) -> Result<String, GitError> {
        check_cancel("diff", &options)?;
        let repo = self.open_engine("diff")?;
        let diff = build_diff(&repo, scope, None).map_err(|error| git_error("diff", error))?;
        diff_text(&diff).map_err(|error| git_error("diff", error))
    }

    /// Unified diff for one path.
    pub fn diff_path(
        &self,
        scope: DiffScope,
        path: &str,
        options: OpOptions,
    ) -> Result<String, GitError> {
        check_cancel("diff", &options)?;
        validate_relative_path(path)?;
        let repo = self.open_engine("diff")?;
        let diff =
            build_diff(&repo, scope, Some(path)).map_err(|error| git_error("diff", error))?;
        diff_text(&diff).map_err(|error| git_error("diff", error))
    }

    /// Blame the working-tree version of a file, one entry per line.
    pub fn blame(&self, path: &str, options: OpOptions) -> Result<Vec<BlameLine>, GitError> {
        check_cancel("blame", &options)?;
        validate_relative_path(path)?;
        let repo = self.open_engine("blame")?;
        let blame = repo
            .blame_file(Path::new(path), None)
            .map_err(|error| git_error("blame", error))?;
        let mut lines = Vec::new();
        for hunk in blame.iter() {
            let signature = hunk.final_signature().or_else(|| hunk.orig_signature());
            let author = signature
                .as_ref()
                .and_then(|signature| signature.name().ok())
                .unwrap_or_default()
                .to_string();
            let email = signature
                .as_ref()
                .and_then(|signature| signature.email().ok())
                .unwrap_or_default()
                .to_string();
            let date = signature
                .as_ref()
                .map(|signature| format_commit_date(signature.when()))
                .unwrap_or_default();
            let commit = hunk.final_commit_id();
            let commit_id = if commit.is_zero() {
                String::new()
            } else {
                commit.to_string()
            };
            let summary = if commit.is_zero() {
                String::new()
            } else {
                repo.find_commit(commit)
                    .ok()
                    .and_then(|commit| commit.summary().ok().flatten().map(str::to_string))
                    .unwrap_or_default()
            };
            for offset in 0..hunk.lines_in_hunk() {
                lines.push(BlameLine {
                    line: (hunk.final_start_line() + offset) as u32,
                    author: author.clone(),
                    email: email.clone(),
                    date: date.clone(),
                    commit: commit_id.clone(),
                    summary: summary.clone(),
                });
            }
        }
        Ok(lines)
    }

    /// Read a file's content at a commit without touching the working tree.
    pub fn show_file(
        &self,
        commit: &str,
        path: &str,
        options: OpOptions,
    ) -> Result<String, GitError> {
        check_cancel("show", &options)?;
        validate_commitish(commit)?;
        validate_relative_path(path)?;
        let repo = self.open_engine("show")?;
        let object = repo
            .revparse_single(&format!("{commit}:{path}"))
            .map_err(|error| git_error("show", error))?;
        let blob = object
            .peel_to_blob()
            .map_err(|error| git_error("show", error))?;
        Ok(String::from_utf8_lossy(blob.content()).into_owned())
    }

    /// Restore a tracked path to HEAD in both the index and the working tree.
    pub fn restore_file(&self, path: &str, options: OpOptions) -> Result<(), GitError> {
        check_cancel("restore", &options)?;
        validate_relative_path(path)?;
        let repo = self.open_engine("restore")?;
        let mut checkout = CheckoutBuilder::new();
        checkout.path(path).force();
        repo.checkout_head(Some(&mut checkout))
            .map_err(|error| git_error("restore", error))
    }

    /// Remove a path from the index without touching the working tree.
    pub fn unstage_path(&self, path: &str, options: OpOptions) -> Result<(), GitError> {
        check_cancel("reset", &options)?;
        validate_relative_path(path)?;
        let repo = self.open_engine("reset")?;
        // A path present in HEAD resets to its committed version; a new path
        // is simply removed from the index.
        let in_head = repo.revparse_single(&format!("HEAD:{path}")).is_ok();
        let tree = if in_head {
            head_tree(&repo).map_err(|error| git_error("reset", error))?
        } else {
            None
        };
        repo.reset_default(tree.as_ref().map(Tree::as_object), [path])
            .map_err(|error| git_error("reset", error))
    }

    /// Per-file insertion/deletion counts for the given scope.
    pub fn diff_stats(
        &self,
        scope: DiffScope,
        options: OpOptions,
    ) -> Result<Vec<FileChange>, GitError> {
        check_cancel("diff-stats", &options)?;
        let repo = self.open_engine("diff-stats")?;
        let diff =
            build_diff(&repo, scope, None).map_err(|error| git_error("diff-stats", error))?;
        let mut changes = Vec::new();
        for (index, delta) in diff.deltas().enumerate() {
            let Some(path) = delta_path(&delta) else {
                continue;
            };
            let (added, removed) = match git2::Patch::from_diff(&diff, index) {
                Ok(Some(patch)) => match patch.line_stats() {
                    Ok((_context, added, removed)) => (added as u32, removed as u32),
                    Err(_) => (0, 0),
                },
                _ => (0, 0),
            };
            changes.push(FileChange {
                path,
                added,
                removed,
            });
        }
        Ok(changes)
    }

    /// Stage paths.
    pub fn stage(&self, paths: &[&str], options: OpOptions) -> Result<(), GitError> {
        check_cancel("add", &options)?;
        if paths.is_empty() {
            return Err(GitError::InvalidInput("stage requires at least one path"));
        }
        for path in paths {
            validate_relative_path(path)?;
        }
        let repo = self.open_engine("add")?;
        stage_paths(&repo, paths.iter().copied()).map_err(|error| git_error("add", error))
    }

    /// Stage every tracked and untracked path, respecting `.gitignore`.
    pub fn stage_all(&self, options: OpOptions) -> Result<(), GitError> {
        check_cancel("add", &options)?;
        let repo = self.open_engine("add")?;
        stage_paths(&repo, ["*"]).map_err(|error| git_error("add", error))
    }

    /// Clear the index without touching the working tree.
    pub fn unstage_all(&self, options: OpOptions) -> Result<(), GitError> {
        check_cancel("reset", &options)?;
        let repo = self.open_engine("reset")?;
        let head = repo.head();
        match head {
            Ok(head) => {
                let object = head
                    .peel(ObjectType::Commit)
                    .map_err(|error| git_error("reset", error))?;
                repo.reset(&object, ResetType::Mixed, None)
                    .map_err(|error| git_error("reset", error))
            }
            Err(error) if error.code() == ErrorCode::UnbornBranch => {
                let mut index = repo.index().map_err(|error| git_error("reset", error))?;
                index.clear().map_err(|error| git_error("reset", error))?;
                index.write().map_err(|error| git_error("reset", error))
            }
            Err(error) => Err(git_error("reset", error)),
        }
    }

    /// Commit the staged index with an explicit message and identity.
    ///
    /// Identity is passed explicitly (never silently read from ambient
    /// configuration) so agent-attributed commits stay distinguishable from
    /// user commits later. Fails when nothing is staged.
    pub fn commit(
        &self,
        message: &str,
        author_name: &str,
        author_email: &str,
        options: OpOptions,
    ) -> Result<String, GitError> {
        check_cancel("commit", &options)?;
        if message.trim().is_empty() {
            return Err(GitError::InvalidInput("commit message must not be empty"));
        }
        let repo = self.open_engine("commit")?;
        let mut index = repo.index().map_err(|error| git_error("commit", error))?;
        let tree_id = index
            .write_tree()
            .map_err(|error| git_error("commit", error))?;
        let tree = repo
            .find_tree(tree_id)
            .map_err(|error| git_error("commit", error))?;
        let signature = Signature::now(author_name, author_email)
            .map_err(|error| git_error("commit", error))?;
        let parent = repo
            .head()
            .ok()
            .and_then(|head| head.target())
            .and_then(|oid| repo.find_commit(oid).ok());
        if let Some(parent) = parent.as_ref() {
            if parent.tree_id() == tree_id {
                return Err(GitError::CommandFailed {
                    operation: "commit".to_string(),
                    code: None,
                    stderr: "nothing to commit, working tree clean".to_string(),
                });
            }
        }
        let parents: Vec<&git2::Commit> = parent.iter().collect();
        let oid = repo
            .commit(
                Some("HEAD"),
                &signature,
                &signature,
                message,
                &tree,
                &parents,
            )
            .map_err(|error| git_error("commit", error))?;
        Ok(oid.to_string())
    }

    /// Current branch name, or `None` on a detached HEAD.
    pub fn current_branch(&self, options: OpOptions) -> Result<Option<String>, GitError> {
        check_cancel("branch", &options)?;
        let repo = self.open_engine("branch")?;
        if repo
            .head_detached()
            .map_err(|error| git_error("branch", error))?
        {
            return Ok(None);
        }
        let head = repo.head();
        match head {
            Ok(head) => Ok(head.shorthand().ok().map(str::to_string)),
            Err(error) if error.code() == ErrorCode::UnbornBranch => {
                Ok(head_symbolic_branch(&repo))
            }
            Err(error) => Err(git_error("branch", error)),
        }
    }

    /// All local branches, current one flagged.
    pub fn branches(&self, options: OpOptions) -> Result<Vec<Branch>, GitError> {
        check_cancel("branch", &options)?;
        let repo = self.open_engine("branch")?;
        let mut branches = Vec::new();
        for item in repo
            .branches(Some(BranchType::Local))
            .map_err(|error| git_error("branch", error))?
        {
            let (branch, _) = item.map_err(|error| git_error("branch", error))?;
            let Some(name) = branch.name().ok().flatten() else {
                continue;
            };
            let Some(id) = branch.get().target() else {
                continue;
            };
            branches.push(Branch {
                name: name.to_string(),
                id: id.to_string(),
                current: branch.is_head(),
            });
        }
        Ok(branches)
    }

    /// Create `name` at the current HEAD without switching to it.
    pub fn create_branch(&self, name: &str, options: OpOptions) -> Result<(), GitError> {
        check_cancel("branch", &options)?;
        validate_branch_name(name)?;
        let repo = self.open_engine("branch")?;
        let head = repo
            .head()
            .map_err(|error| git_error("branch", error))?
            .peel_to_commit()
            .map_err(|error| git_error("branch", error))?;
        repo.branch(name, &head, false)
            .map_err(|error| git_error("branch", error))?;
        Ok(())
    }

    /// Switch to an existing branch. Refuses when local changes would be
    /// overwritten — no data is ever discarded here.
    pub fn checkout(&self, name: &str, options: OpOptions) -> Result<(), GitError> {
        check_cancel("checkout", &options)?;
        validate_branch_name(name)?;
        let repo = self.open_engine("checkout")?;
        checkout_branch(&repo, name).map_err(|error| git_error("checkout", error))
    }

    /// Create `name` at HEAD and switch to it in one step.
    pub fn checkout_new(&self, name: &str, options: OpOptions) -> Result<(), GitError> {
        check_cancel("checkout", &options)?;
        validate_branch_name(name)?;
        let repo = self.open_engine("checkout")?;
        let head = repo
            .head()
            .map_err(|error| git_error("checkout", error))?
            .peel_to_commit()
            .map_err(|error| git_error("checkout", error))?;
        repo.branch(name, &head, false)
            .map_err(|error| git_error("checkout", error))?;
        checkout_branch(&repo, name).map_err(|error| git_error("checkout", error))
    }

    /// Delete `name` with Git's *safe* rule: a branch that is not fully
    /// merged is refused instead of force-removed.
    pub fn delete_branch(&self, name: &str, options: OpOptions) -> Result<(), GitError> {
        check_cancel("branch -d", &options)?;
        validate_branch_name(name)?;
        let repo = self.open_engine("branch -d")?;
        let mut branch = repo
            .find_branch(name, BranchType::Local)
            .map_err(|error| git_error("branch -d", error))?;
        if branch.is_head() {
            return Err(GitError::CommandFailed {
                operation: "branch -d".to_string(),
                code: None,
                stderr: "cannot delete the branch that is currently checked out".to_string(),
            });
        }
        let target = branch
            .get()
            .target()
            .ok_or_else(|| GitError::CommandFailed {
                operation: "branch -d".to_string(),
                code: None,
                stderr: "branch has no commit".to_string(),
            })?;
        let head = repo
            .head()
            .map_err(|error| git_error("branch -d", error))?
            .target()
            .ok_or_else(|| GitError::CommandFailed {
                operation: "branch -d".to_string(),
                code: None,
                stderr: "HEAD has no commit".to_string(),
            })?;
        let merged = head == target
            || repo
                .graph_descendant_of(head, target)
                .map_err(|error| git_error("branch -d", error))?;
        if !merged {
            return Err(GitError::CommandFailed {
                operation: "branch -d".to_string(),
                code: None,
                stderr: "branch is not fully merged".to_string(),
            });
        }
        branch
            .delete()
            .map_err(|error| git_error("branch -d", error))
    }

    /// Merge `name` into the current branch without opening an editor.
    ///
    /// Conflicts are reported as [`MergeOutcome::Conflicts`] — never resolved
    /// automatically — and the repository is left in a merge state the user
    /// can complete (commit) or undo ([`Repository::abort_merge`]).
    pub fn merge(&self, name: &str, options: OpOptions) -> Result<MergeOutcome, GitError> {
        check_cancel("merge", &options)?;
        validate_branch_name(name)?;
        let repo = self.open_engine("merge")?;
        let head = repo.head().map_err(|error| git_error("merge", error))?;
        let head_commit = head
            .peel_to_commit()
            .map_err(|error| git_error("merge", error))?;
        let branch = repo
            .find_branch(name, BranchType::Local)
            .map_err(|error| git_error("merge", error))?;
        let reference = branch.into_reference();
        let annotated = repo
            .reference_to_annotated_commit(&reference)
            .map_err(|error| git_error("merge", error))?;
        let (analysis, _) = repo
            .merge_analysis(&[&annotated])
            .map_err(|error| git_error("merge", error))?;
        if analysis.contains(git2::MergeAnalysis::ANALYSIS_UP_TO_DATE) {
            return Ok(MergeOutcome::UpToDate);
        }
        if analysis.contains(git2::MergeAnalysis::ANALYSIS_FASTFORWARD) {
            let target = reference
                .peel_to_commit()
                .map_err(|error| git_error("merge", error))?;
            let mut checkout = CheckoutBuilder::new();
            checkout.safe();
            repo.checkout_tree(target.as_object(), Some(&mut checkout))
                .map_err(|error| git_error("merge", error))?;
            repo.reference(
                head.name().map_err(|error| git_error("merge", error))?,
                target.id(),
                true,
                "merge: fast-forward",
            )
            .map_err(|error| git_error("merge", error))?;
            return Ok(MergeOutcome::FastForward);
        }
        if !analysis.contains(git2::MergeAnalysis::ANALYSIS_NORMAL) {
            return Err(GitError::CommandFailed {
                operation: "merge".to_string(),
                code: None,
                stderr: "merge is not possible".to_string(),
            });
        }

        repo.merge(&[&annotated], None, None)
            .map_err(|error| git_error("merge", error))?;
        let mut index = repo.index().map_err(|error| git_error("merge", error))?;
        if index.has_conflicts() {
            let (_, entries) = self.status(OpOptions::default())?;
            let files = entries
                .into_iter()
                .filter(|entry| entry.is_conflicted())
                .map(|entry| entry.path)
                .collect();
            return Ok(MergeOutcome::Conflicts { files });
        }
        let tree_id = index
            .write_tree()
            .map_err(|error| git_error("merge", error))?;
        let tree = repo
            .find_tree(tree_id)
            .map_err(|error| git_error("merge", error))?;
        let signature = repo
            .signature()
            .or_else(|_| Signature::now("Bradbit Writer", "writer@bradbit.local"))
            .map_err(|error| git_error("merge", error))?;
        let message = format!("Merge branch '{name}'");
        let their_commit = repo
            .find_commit(annotated.id())
            .map_err(|error| git_error("merge", error))?;
        let oid = repo
            .commit(
                Some("HEAD"),
                &signature,
                &signature,
                &message,
                &tree,
                &[&head_commit, &their_commit],
            )
            .map_err(|error| git_error("merge", error))?;
        repo.cleanup_state()
            .map_err(|error| git_error("merge", error))?;
        Ok(MergeOutcome::Merged {
            id: oid.to_string(),
        })
    }

    /// Abort an in-progress merge, restoring the pre-merge state.
    pub fn abort_merge(&self, options: OpOptions) -> Result<(), GitError> {
        check_cancel("merge --abort", &options)?;
        let repo = self.open_engine("merge --abort")?;
        if repo.state() != RepositoryState::Merge {
            return Err(GitError::CommandFailed {
                operation: "merge --abort".to_string(),
                code: None,
                stderr: "there is no merge to abort".to_string(),
            });
        }
        let head = repo
            .head()
            .map_err(|error| git_error("merge --abort", error))?
            .peel(ObjectType::Commit)
            .map_err(|error| git_error("merge --abort", error))?;
        repo.reset(&head, ResetType::Hard, None)
            .map_err(|error| git_error("merge --abort", error))?;
        repo.cleanup_state()
            .map_err(|error| git_error("merge --abort", error))
    }

    /// True while a conflicted merge is unresolved.
    pub fn is_merging(&self, options: OpOptions) -> Result<bool, GitError> {
        check_cancel("merge", &options)?;
        let repo = self.open_engine("merge")?;
        Ok(repo.state() == RepositoryState::Merge)
    }

    /// Configured remotes as `(name, fetch_url)` pairs. URLs are redacted.
    ///
    /// Reads `remote.<name>.url` from config rather than the expanded
    /// `insteadOf` form, so the URL shown is the one the user configured.
    pub fn remotes(&self, options: OpOptions) -> Result<Vec<(String, String)>, GitError> {
        check_cancel("remote", &options)?;
        let repo = self.open_engine("remote")?;
        let config = repo.config().map_err(|error| git_error("remote", error))?;
        let names = repo.remotes().map_err(|error| git_error("remote", error))?;
        let mut remotes = Vec::new();
        for item in names.iter() {
            let Ok(Some(name)) = item else {
                continue;
            };
            let key = format!("remote.{name}.url");
            let Ok(url) = config.get_string(&key) else {
                continue;
            };
            if !url.is_empty() {
                remotes.push((name.to_string(), redact_secrets(&url)));
            }
        }
        Ok(remotes)
    }

    /// Add a credential-free remote URL.
    ///
    /// Tokens must never be embedded in a remote URL; authenticated pushes
    /// use [`Repository::push_with_token`] instead.
    pub fn add_remote(&self, name: &str, url: &str, options: OpOptions) -> Result<(), GitError> {
        check_cancel("remote add", &options)?;
        validate_remote_name(name)?;
        if url.contains('@')
            || url.contains("://")
                && url
                    .split("://")
                    .nth(1)
                    .is_some_and(|rest| rest.contains('@'))
        {
            return Err(GitError::InvalidInput(
                "remote URLs must not contain credentials",
            ));
        }
        let repo = self.open_engine("remote add")?;
        repo.remote(name, url)
            .map_err(|error| git_error("remote add", error))?;
        Ok(())
    }

    /// Push with a GitHub token supplied through a credential callback. The
    /// token is never written to `.git/config`, argv or logs.
    pub fn push_with_token(
        &self,
        remote: &str,
        branch: &str,
        token: &str,
        options: OpOptions,
    ) -> Result<(), GitError> {
        if token.trim().is_empty() {
            return Err(GitError::InvalidInput("GitHub token must not be empty"));
        }
        self.push_remote(remote, branch, Some(token), options)
    }

    /// Fast-forward pull with the same credential callback.
    pub fn pull_with_token(
        &self,
        remote: &str,
        branch: &str,
        token: &str,
        options: OpOptions,
    ) -> Result<(), GitError> {
        if token.trim().is_empty() {
            return Err(GitError::InvalidInput("GitHub token must not be empty"));
        }
        self.pull_remote(remote, branch, Some(token), options)
    }

    /// Fetch from `remote` (no merge, no working-tree changes).
    pub fn fetch(&self, remote: &str, options: OpOptions) -> Result<(), GitError> {
        self.fetch_remote(remote, None, options)
    }

    /// Fetch with an in-memory token, for private HTTPS remotes.
    pub fn fetch_with_token(
        &self,
        remote: &str,
        token: &str,
        options: OpOptions,
    ) -> Result<(), GitError> {
        if token.trim().is_empty() {
            return Err(GitError::InvalidInput("GitHub token must not be empty"));
        }
        self.fetch_remote(remote, Some(token), options)
    }

    /// Fast-forward pull of `branch` from `remote`.
    ///
    /// Deliberately fast-forward only: a pull never creates surprise merge
    /// commits and never resolves conflicts implicitly — when it fails, the
    /// user brings the branches together with an explicit [`Repository::merge`].
    pub fn pull(&self, remote: &str, branch: &str, options: OpOptions) -> Result<(), GitError> {
        self.pull_remote(remote, branch, None, options)
    }

    /// Push `branch` to `remote`. Callers must have shown explicit user
    /// confirmation first (`AGENTS.md`: publication requires confirmation).
    pub fn push(&self, remote: &str, branch: &str, options: OpOptions) -> Result<(), GitError> {
        self.push_remote(remote, branch, None, options)
    }

    fn fetch_remote(
        &self,
        remote: &str,
        token: Option<&str>,
        options: OpOptions,
    ) -> Result<(), GitError> {
        check_cancel("fetch", &options)?;
        validate_remote_name(remote)?;
        ensure_network_timeouts(&options);
        let repo = self.open_engine("fetch")?;
        let mut git_remote = repo
            .find_remote(remote)
            .map_err(|error| git_error("fetch", error))?;
        let mut fetch_options = FetchOptions::new();
        fetch_options.remote_callbacks(remote_callbacks(&options, token));
        git_remote
            .fetch(&[] as &[&str], Some(&mut fetch_options), None)
            .map_err(|error| git_error("fetch", error))
    }

    fn push_remote(
        &self,
        remote: &str,
        branch: &str,
        token: Option<&str>,
        options: OpOptions,
    ) -> Result<(), GitError> {
        check_cancel("push", &options)?;
        validate_remote_name(remote)?;
        validate_branch_name(branch)?;
        ensure_network_timeouts(&options);
        let repo = self.open_engine("push")?;
        let mut git_remote = repo
            .find_remote(remote)
            .map_err(|error| git_error("push", error))?;
        let refspec = format!("refs/heads/{branch}:refs/heads/{branch}");
        let mut push_options = PushOptions::new();
        push_options.remote_callbacks(remote_callbacks(&options, token));
        git_remote
            .push(&[refspec.as_str()], Some(&mut push_options))
            .map_err(|error| git_error("push", error))
    }

    fn pull_remote(
        &self,
        remote: &str,
        branch: &str,
        token: Option<&str>,
        options: OpOptions,
    ) -> Result<(), GitError> {
        check_cancel("pull --ff-only", &options)?;
        validate_remote_name(remote)?;
        validate_branch_name(branch)?;
        ensure_network_timeouts(&options);
        let repo = self.open_engine("pull --ff-only")?;
        let mut git_remote = repo
            .find_remote(remote)
            .map_err(|error| git_error("pull --ff-only", error))?;
        let refspec = format!("refs/heads/{branch}:refs/remotes/{remote}/{branch}");
        let mut fetch_options = FetchOptions::new();
        fetch_options.remote_callbacks(remote_callbacks(&options, token));
        git_remote
            .fetch(&[refspec.as_str()], Some(&mut fetch_options), None)
            .map_err(|error| git_error("pull --ff-only", error))?;

        let tracking_ref = format!("refs/remotes/{remote}/{branch}");
        let remote_ref = repo
            .find_reference(&tracking_ref)
            .map_err(|error| git_error("pull --ff-only", error))?;
        let annotated = repo
            .reference_to_annotated_commit(&remote_ref)
            .map_err(|error| git_error("pull --ff-only", error))?;
        let (analysis, _) = repo
            .merge_analysis(&[&annotated])
            .map_err(|error| git_error("pull --ff-only", error))?;
        if analysis.contains(git2::MergeAnalysis::ANALYSIS_UP_TO_DATE) {
            return Ok(());
        }
        if analysis.contains(git2::MergeAnalysis::ANALYSIS_FASTFORWARD) {
            let target = remote_ref
                .peel_to_commit()
                .map_err(|error| git_error("pull --ff-only", error))?;
            let mut checkout = CheckoutBuilder::new();
            checkout.safe();
            repo.checkout_tree(target.as_object(), Some(&mut checkout))
                .map_err(|error| git_error("pull --ff-only", error))?;
            let head = repo
                .head()
                .map_err(|error| git_error("pull --ff-only", error))?;
            repo.reference(
                head.name()
                    .map_err(|error| git_error("pull --ff-only", error))?,
                target.id(),
                true,
                "pull: fast-forward",
            )
            .map_err(|error| git_error("pull --ff-only", error))?;
            return Ok(());
        }
        Err(GitError::CommandFailed {
            operation: "pull --ff-only".to_string(),
            code: None,
            stderr: "not possible to fast-forward; bring the branches together with a merge"
                .to_string(),
        })
    }
}

/// Clone `url` into `destination` (which must not exist yet) and return the
/// new repository. Credentials in `url` never appear in errors or messages.
pub fn clone(url: &str, destination: &Path, options: OpOptions) -> Result<Repository, GitError> {
    check_cancel("clone", &options)?;
    if url.trim().is_empty() {
        return Err(GitError::InvalidInput("clone URL must not be empty"));
    }
    ensure_network_timeouts(&options);
    RepoBuilder::new()
        .clone(url, destination)
        .map_err(|error| git_error("clone", error))?;
    Repository::open(destination, OpOptions::default())
}

fn ensure_network_timeouts(options: &OpOptions) {
    // libgit2 exposes these timeouts globally. Network operations are expected
    // to run one at a time from the editor, so applying the caller's bound
    // here is preferable to silently ignoring `OpOptions::timeout`.
    let millis = options.timeout.as_millis().clamp(1, i32::MAX as u128) as i32;
    unsafe {
        let _ = git2::opts::set_server_connect_timeout_in_milliseconds(millis);
        let _ = git2::opts::set_server_timeout_in_milliseconds(millis);
    }
}

fn remote_callbacks<'a>(options: &OpOptions, token: Option<&'a str>) -> RemoteCallbacks<'a> {
    let mut callbacks = RemoteCallbacks::new();
    if let Some(token) = token {
        callbacks.credentials(move |_url, _username, allowed| {
            if allowed.contains(CredentialType::USER_PASS_PLAINTEXT) {
                Cred::userpass_plaintext("x-access-token", token)
            } else if allowed.contains(CredentialType::USERNAME) {
                Cred::username("x-access-token")
            } else {
                Err(git2::Error::from_str(
                    "authentication method not supported by Bradbit",
                ))
            }
        });
    }
    if let Some(cancel) = options.cancel.clone() {
        callbacks.sideband_progress(move |_data| !cancel.is_cancelled());
    }
    if let Some(cancel) = options.cancel.clone() {
        callbacks.push_negotiation(move |_updates| {
            if cancel.is_cancelled() {
                Err(git2::Error::from_str("push cancelled"))
            } else {
                Ok(())
            }
        });
    }
    callbacks
}

fn branch_info(repo: &GitRepository) -> Result<BranchInfo, git2::Error> {
    let mut info = BranchInfo::default();
    match repo.head() {
        Ok(head) => {
            info.oid = head.target().map(|oid| oid.to_string());
            if repo.head_detached()? {
                info.head = None;
            } else if let Ok(name) = head.shorthand() {
                info.head = Some(name.to_string());
            }
            if let Some(name) = info.head.as_deref() {
                let refname = format!("refs/heads/{name}");
                if let Ok(upstream) = repo.branch_upstream_name(&refname) {
                    if let Ok(upstream) = upstream.as_str() {
                        info.upstream = Some(
                            upstream
                                .trim_start_matches("refs/remotes/")
                                .trim_start_matches("refs/heads/")
                                .to_string(),
                        );
                        if let (Some(local), Ok(upstream_ref)) =
                            (head.target(), repo.find_reference(upstream))
                        {
                            if let Some(remote) = upstream_ref.target() {
                                if let Ok((ahead, behind)) = repo.graph_ahead_behind(local, remote)
                                {
                                    info.ahead = ahead as u32;
                                    info.behind = behind as u32;
                                }
                            }
                        }
                    }
                }
            }
        }
        Err(error) if error.code() == ErrorCode::UnbornBranch => {
            info.head = head_symbolic_branch(repo);
        }
        Err(error) => return Err(error),
    }
    Ok(info)
}

fn head_symbolic_branch(repo: &GitRepository) -> Option<String> {
    repo.find_reference("HEAD")
        .ok()
        .and_then(|head| head.symbolic_target().ok().flatten().map(str::to_string))
        .map(|target| {
            target
                .trim_start_matches("refs/heads/")
                .trim_start_matches("refs/remotes/")
                .to_string()
        })
}

fn status_path(entry: &git2::StatusEntry) -> Option<String> {
    if let Some(delta) = entry.head_to_index() {
        if let Some(path) = delta_path(&delta) {
            return Some(path);
        }
    }
    if let Some(delta) = entry.index_to_workdir() {
        if let Some(path) = delta_path(&delta) {
            return Some(path);
        }
    }
    entry.path().ok().map(str::to_string)
}

fn delta_path(delta: &git2::DiffDelta) -> Option<String> {
    delta
        .new_file()
        .path()
        .or_else(|| delta.old_file().path())
        .map(|path| path.to_string_lossy().into_owned())
}

fn map_status(status: Status) -> (WorktreeStatus, WorktreeStatus) {
    if status.contains(Status::CONFLICTED) {
        return (WorktreeStatus::Conflicted, WorktreeStatus::Conflicted);
    }
    if status.contains(Status::WT_NEW) {
        return (WorktreeStatus::Untracked, WorktreeStatus::Untracked);
    }
    let index = if status.contains(Status::INDEX_RENAMED) {
        WorktreeStatus::Renamed
    } else if status.contains(Status::INDEX_NEW) {
        WorktreeStatus::Added
    } else if status.contains(Status::INDEX_MODIFIED) {
        WorktreeStatus::Modified
    } else if status.contains(Status::INDEX_DELETED) {
        WorktreeStatus::Deleted
    } else if status.contains(Status::INDEX_TYPECHANGE) {
        WorktreeStatus::Unknown
    } else {
        WorktreeStatus::Unmodified
    };
    let worktree = if status.contains(Status::WT_RENAMED) {
        WorktreeStatus::Renamed
    } else if status.contains(Status::WT_MODIFIED) {
        WorktreeStatus::Modified
    } else if status.contains(Status::WT_DELETED) {
        WorktreeStatus::Deleted
    } else if status.contains(Status::WT_TYPECHANGE) {
        WorktreeStatus::Unknown
    } else {
        WorktreeStatus::Unmodified
    };
    (index, worktree)
}

fn delta_status(delta: Delta) -> &'static str {
    match delta {
        Delta::Added => "A",
        Delta::Deleted => "D",
        Delta::Modified => "M",
        Delta::Renamed => "R100",
        Delta::Copied => "C100",
        Delta::Typechange => "T",
        _ => "M",
    }
}

fn head_tree<'repo>(repo: &'repo GitRepository) -> Result<Option<Tree<'repo>>, git2::Error> {
    match repo.head() {
        Ok(head) => Ok(Some(head.peel_to_tree()?)),
        Err(error) if error.code() == ErrorCode::UnbornBranch => Ok(None),
        Err(error) => Err(error),
    }
}

fn build_diff<'repo>(
    repo: &'repo GitRepository,
    scope: DiffScope,
    path: Option<&str>,
) -> Result<Diff<'repo>, git2::Error> {
    let tree = head_tree(repo)?;
    let mut opts = DiffOptions::new();
    opts.include_untracked(true);
    opts.recurse_untracked_dirs(true);
    opts.show_untracked_content(true);
    if let Some(path) = path {
        opts.pathspec(path);
    }
    match scope {
        DiffScope::Worktree => repo.diff_index_to_workdir(None, Some(&mut opts)),
        DiffScope::Staged => repo.diff_tree_to_index(tree.as_ref(), None, Some(&mut opts)),
        DiffScope::WorktreeVsHead => {
            repo.diff_tree_to_workdir_with_index(tree.as_ref(), Some(&mut opts))
        }
    }
}

fn diff_text(diff: &Diff<'_>) -> Result<String, git2::Error> {
    let mut text = String::new();
    diff.print(DiffFormat::Patch, |_delta, _hunk, line| {
        // libgit2 hands the line body without the unified-diff marker for
        // additions, deletions and context. Re-add it so the frontend can
        // parse `git_diff_file` as a regular patch.
        match line.origin() {
            '+' | '-' | ' ' => text.push(line.origin()),
            _ => {}
        }
        text.push_str(&String::from_utf8_lossy(line.content()));
        true
    })?;
    Ok(redact_secrets(&text))
}

fn stage_paths<'a, I>(repo: &GitRepository, paths: I) -> Result<(), git2::Error>
where
    I: IntoIterator<Item = &'a str> + Clone,
{
    let mut index = repo.index()?;
    index.add_all(paths.clone(), IndexAddOption::DEFAULT, None)?;
    index.update_all(paths, None)?;
    index.write()
}

fn checkout_branch(repo: &GitRepository, name: &str) -> Result<(), git2::Error> {
    let branch = repo.find_branch(name, BranchType::Local)?;
    let target = branch.into_reference().peel_to_commit()?;
    let mut checkout = CheckoutBuilder::new();
    checkout.safe();
    repo.checkout_tree(target.as_object(), Some(&mut checkout))?;
    repo.set_head(&format!("refs/heads/{name}"))
}

fn format_commit_date(time: git2::Time) -> String {
    use time::format_description::well_known::Rfc3339;
    let offset = time::UtcOffset::from_whole_seconds(time.offset_minutes() * 60)
        .unwrap_or(time::UtcOffset::UTC);
    time::OffsetDateTime::from_unix_timestamp(time.seconds())
        .ok()
        .and_then(|date| date.to_offset(offset).format(&Rfc3339).ok())
        .unwrap_or_default()
}
