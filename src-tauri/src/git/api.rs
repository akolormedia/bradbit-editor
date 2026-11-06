use super::{DiffScope, GitError, OpOptions, Repository, WorktreeStatus};
use crate::fs_ops;
use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusEntry {
    pub path: String,
    pub index: String,
    pub worktree: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub is_repository: bool,
    pub branch: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub entries: Vec<GitStatusEntry>,
}

impl GitStatus {
    fn empty() -> Self {
        Self {
            is_repository: false,
            branch: None,
            ahead: 0,
            behind: 0,
            entries: Vec::new(),
        }
    }
}

/// Returns the repository state for the explorer/tab badges. Plain folders
/// are reported as non-repositories instead of surfacing a Git error.
pub fn status(root: &str) -> Result<GitStatus, String> {
    let root_path = Path::new(root);
    if !root_path.join(".git").exists() {
        return Ok(GitStatus::empty());
    }
    let repo = Repository::open(root_path, OpOptions::default()).map_err(|e| e.to_string())?;
    let (branch, entries) = repo
        .status(OpOptions::default())
        .map_err(|e| e.to_string())?;
    Ok(GitStatus {
        is_repository: true,
        branch: branch.as_ref().and_then(|info| info.head.clone()),
        ahead: branch.as_ref().map(|info| info.ahead).unwrap_or(0),
        behind: branch.as_ref().map(|info| info.behind).unwrap_or(0),
        entries: entries
            .into_iter()
            .map(|entry| GitStatusEntry {
                path: entry.path,
                index: label(entry.index).to_string(),
                worktree: label(entry.worktree).to_string(),
            })
            .collect(),
    })
}

pub fn init(root: &str) -> Result<GitStatus, String> {
    let path = Path::new(root);
    if !path.is_dir() {
        return Err(format!("La ruta '{}' no es una carpeta", root));
    }
    Repository::init(path, OpOptions::default()).map_err(|e| e.to_string())?;
    status(root)
}

pub fn diff_file(root: &str, rel_path: &str) -> Result<String, String> {
    let repo =
        Repository::open(Path::new(root), OpOptions::default()).map_err(|e| e.to_string())?;
    repo.diff_path(DiffScope::WorktreeVsHead, rel_path, OpOptions::default())
        .map_err(|e| e.to_string())
}

pub fn restore_file(root: &str, rel_path: &str) -> Result<GitStatus, String> {
    let repo =
        Repository::open(Path::new(root), OpOptions::default()).map_err(|e| e.to_string())?;
    repo.restore_file(rel_path, OpOptions::default())
        .map_err(|e| e.to_string())?;
    status(root)
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiscardResult {
    pub deleted: bool,
    pub status: GitStatus,
}

/// Read a file's content from HEAD. `None` means the file has no committed
/// version yet (new or untracked file).
pub fn head_file(root: &str, rel_path: &str) -> Result<Option<String>, String> {
    if !Path::new(root).join(".git").exists() {
        return Ok(None);
    }
    let repo =
        Repository::open(Path::new(root), OpOptions::default()).map_err(|e| e.to_string())?;
    match repo.show_file("HEAD", rel_path, OpOptions::default()) {
        Ok(content) => Ok(Some(content)),
        Err(_) => Ok(None),
    }
}

/// Restore a tracked file to HEAD, or delete an untracked/new file. Staged
/// new files are removed from the index before the file is deleted.
pub fn discard_file(root: &str, rel_path: &str) -> Result<DiscardResult, String> {
    let root_path = fs::canonicalize(root)
        .map_err(|e| format!("No se pudo abrir la carpeta '{}': {}", root, e))?;
    let repo = Repository::open(&root_path, OpOptions::default()).map_err(|e| e.to_string())?;
    let has_head_version = repo
        .show_file("HEAD", rel_path, OpOptions::default())
        .is_ok();

    if has_head_version {
        repo.restore_file(rel_path, OpOptions::default())
            .map_err(|e| e.to_string())?;
        return Ok(DiscardResult {
            deleted: false,
            status: status(root)?,
        });
    }

    // New file: unstage it if needed and remove it from disk.
    let _ = repo.unstage_path(rel_path, OpOptions::default());
    let target = fs_ops::resolve_safe_relative(&root_path, rel_path)?;
    if target.exists() {
        if !target.is_file() {
            return Err("Solo se pueden descartar archivos, no carpetas".to_string());
        }
        fs::remove_file(&target)
            .map_err(|e| format!("No se pudo eliminar '{}': {}", rel_path, e))?;
    }
    Ok(DiscardResult {
        deleted: true,
        status: status(root)?,
    })
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitCommit {
    pub id: String,
    pub author: String,
    pub email: String,
    pub date: String,
    pub subject: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitFile {
    pub path: String,
    pub old_path: Option<String>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitBranch {
    pub name: String,
    pub id: String,
    pub current: bool,
}

/// Stage every change and create a version signed by the configured author.
pub fn save_version(
    root: &str,
    message: &str,
    author_name: &str,
    author_email: &str,
) -> Result<GitStatus, String> {
    let name = author_name.trim();
    let email = author_email.trim();
    if name.is_empty() {
        return Err("Configura tu nombre de autor en Ajustes para guardar versiones".to_string());
    }
    if !email.contains('@') || email.starts_with('@') || email.ends_with('@') {
        return Err("Configura un correo de autor válido en Ajustes".to_string());
    }
    if message.trim().is_empty() {
        return Err("Escribe un resumen para la versión".to_string());
    }
    let repo =
        Repository::open(Path::new(root), OpOptions::default()).map_err(|e| e.to_string())?;
    let (_, entries) = repo
        .status(OpOptions::default())
        .map_err(|e| e.to_string())?;
    if entries.is_empty() {
        return Err("No hay cambios para guardar".to_string());
    }
    repo.stage_all(OpOptions::default())
        .map_err(|e| e.to_string())?;
    repo.commit(message.trim(), name, email, OpOptions::default())
        .map_err(|e| e.to_string())?;
    status(root)
}

/// Recent versions, newest first. A freshly initialized repository has no
/// commits yet, which is reported as an empty history instead of an error.
pub fn history(root: &str, limit: usize) -> Result<Vec<GitCommit>, String> {
    if !Path::new(root).join(".git").exists() {
        return Ok(Vec::new());
    }
    let repo =
        Repository::open(Path::new(root), OpOptions::default()).map_err(|e| e.to_string())?;
    match repo.log(limit, OpOptions::default()) {
        Ok(commits) => Ok(commits
            .into_iter()
            .map(|commit| GitCommit {
                id: commit.id,
                author: commit.author,
                email: commit.email,
                date: commit.date,
                subject: commit.subject,
            })
            .collect()),
        Err(GitError::CommandFailed { stderr, .. })
            if stderr.contains("does not have any commits yet")
                || stderr.contains("unknown revision") =>
        {
            Ok(Vec::new())
        }
        Err(err) => Err(err.to_string()),
    }
}

pub fn commit_files(root: &str, commit_id: &str) -> Result<Vec<GitCommitFile>, String> {
    let repo =
        Repository::open(Path::new(root), OpOptions::default()).map_err(|e| e.to_string())?;
    let files = repo
        .commit_files(commit_id, OpOptions::default())
        .map_err(|e| e.to_string())?;
    Ok(files
        .into_iter()
        .map(|file| GitCommitFile {
            path: file.path,
            old_path: file.old_path,
            status: file.status,
        })
        .collect())
}

/// Write a file from an older version back to the working tree. The change
/// stays uncommitted so the writer can compare it and save a new version.
pub fn restore_from_commit(
    root: &str,
    commit_id: &str,
    rel_path: &str,
) -> Result<GitStatus, String> {
    let root_path = fs::canonicalize(root)
        .map_err(|e| format!("No se pudo abrir la carpeta '{}': {}", root, e))?;
    let repo = Repository::open(&root_path, OpOptions::default()).map_err(|e| e.to_string())?;
    let content = repo
        .show_file(commit_id, rel_path, OpOptions::default())
        .map_err(|e| e.to_string())?;
    fs_ops::write_text_file(root, rel_path, &content)?;
    status(root)
}

pub fn branches(root: &str) -> Result<Vec<GitBranch>, String> {
    if !Path::new(root).join(".git").exists() {
        return Ok(Vec::new());
    }
    let repo =
        Repository::open(Path::new(root), OpOptions::default()).map_err(|e| e.to_string())?;
    let branches = repo
        .branches(OpOptions::default())
        .map_err(|e| e.to_string())?;
    Ok(branches
        .into_iter()
        .map(|branch| GitBranch {
            name: branch.name,
            id: branch.id,
            current: branch.current,
        })
        .collect())
}

/// Create a parallel draft from HEAD and switch to it.
pub fn create_branch(root: &str, name: &str) -> Result<GitStatus, String> {
    let repo =
        Repository::open(Path::new(root), OpOptions::default()).map_err(|e| e.to_string())?;
    repo.checkout_new(name.trim(), OpOptions::default())
        .map_err(|e| e.to_string())?;
    status(root)
}

pub fn checkout_branch(root: &str, name: &str) -> Result<GitStatus, String> {
    let repo =
        Repository::open(Path::new(root), OpOptions::default()).map_err(|e| e.to_string())?;
    repo.checkout(name.trim(), OpOptions::default())
        .map_err(|e| e.to_string())?;
    status(root)
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitRemote {
    pub name: String,
    pub url: String,
}

pub fn remotes(root: &str) -> Result<Vec<GitRemote>, String> {
    let repo =
        Repository::open(Path::new(root), OpOptions::default()).map_err(|e| e.to_string())?;
    let remotes = repo
        .remotes(OpOptions::default())
        .map_err(|e| e.to_string())?;
    Ok(remotes
        .into_iter()
        .map(|(name, url)| GitRemote { name, url })
        .collect())
}

pub fn add_remote(root: &str, name: &str, url: &str) -> Result<Vec<GitRemote>, String> {
    let repo =
        Repository::open(Path::new(root), OpOptions::default()).map_err(|e| e.to_string())?;
    repo.add_remote(name.trim(), url.trim(), OpOptions::default())
        .map_err(|e| e.to_string())?;
    remotes(root)
}

pub fn fetch(root: &str, remote: &str) -> Result<GitStatus, String> {
    let repo =
        Repository::open(Path::new(root), OpOptions::default()).map_err(|e| e.to_string())?;
    repo.fetch(remote.trim(), OpOptions::default())
        .map_err(|e| e.to_string())?;
    status(root)
}

/// Push `branch` to `remote`. When a token is present it travels only in the
/// child environment; it is never written to `.git/config` or argv.
pub fn push(
    root: &str,
    remote: &str,
    branch: &str,
    token: Option<&str>,
) -> Result<GitStatus, String> {
    let repo =
        Repository::open(Path::new(root), OpOptions::default()).map_err(|e| e.to_string())?;
    match token.filter(|value| !value.trim().is_empty()) {
        Some(token) => repo
            .push_with_token(remote.trim(), branch.trim(), token, OpOptions::default())
            .map_err(|e| e.to_string())?,
        None => repo
            .push(remote.trim(), branch.trim(), OpOptions::default())
            .map_err(|e| e.to_string())?,
    }
    status(root)
}

/// Fast-forward pull. Conflicts and divergent branches fail instead of
/// creating surprise merge commits.
pub fn pull(
    root: &str,
    remote: &str,
    branch: &str,
    token: Option<&str>,
) -> Result<GitStatus, String> {
    let repo =
        Repository::open(Path::new(root), OpOptions::default()).map_err(|e| e.to_string())?;
    match token.filter(|value| !value.trim().is_empty()) {
        Some(token) => repo
            .pull_with_token(remote.trim(), branch.trim(), token, OpOptions::default())
            .map_err(|e| e.to_string())?,
        None => repo
            .pull(remote.trim(), branch.trim(), OpOptions::default())
            .map_err(|e| e.to_string())?,
    }
    status(root)
}

fn label(status: WorktreeStatus) -> &'static str {
    match status {
        WorktreeStatus::Unmodified => "unmodified",
        WorktreeStatus::Modified => "modified",
        WorktreeStatus::Added => "added",
        WorktreeStatus::Deleted => "deleted",
        WorktreeStatus::Renamed => "renamed",
        WorktreeStatus::Copied => "copied",
        WorktreeStatus::Untracked => "untracked",
        WorktreeStatus::Conflicted => "conflicted",
        WorktreeStatus::Unknown => "unknown",
    }
}
