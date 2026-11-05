use super::{DiffScope, OpOptions, Repository, WorktreeStatus};
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
