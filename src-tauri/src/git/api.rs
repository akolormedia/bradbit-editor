use super::{DiffScope, OpOptions, Repository, WorktreeStatus};
use serde::Serialize;
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
