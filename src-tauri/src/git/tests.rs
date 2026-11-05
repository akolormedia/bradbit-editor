use super::{DiffScope, OpOptions, Repository, WorktreeStatus};
use std::fs;
use tempfile::tempdir;

fn options() -> OpOptions {
    OpOptions::default()
}

fn initialized_repo() -> (tempfile::TempDir, Repository) {
    let dir = tempdir().unwrap();
    let repo = Repository::init_with_branch(dir.path(), "main", options()).unwrap();
    (dir, repo)
}

#[test]
fn status_reports_modified_untracked_and_deleted_files() {
    let (dir, repo) = initialized_repo();
    fs::write(dir.path().join("a.md"), "uno").unwrap();
    fs::write(dir.path().join("b.md"), "dos").unwrap();
    repo.stage_all(options()).unwrap();
    repo.commit("inicial", "Test", "test@example.com", options())
        .unwrap();

    fs::write(dir.path().join("a.md"), "uno modificado").unwrap();
    fs::write(dir.path().join("nuevo.md"), "nuevo").unwrap();
    fs::remove_file(dir.path().join("b.md")).unwrap();

    let (_, entries) = repo.status(options()).unwrap();
    let find = |path: &str| entries.iter().find(|entry| entry.path == path).unwrap();
    assert_eq!(find("a.md").worktree, WorktreeStatus::Modified);
    assert_eq!(find("nuevo.md").index, WorktreeStatus::Untracked);
    assert_eq!(find("b.md").worktree, WorktreeStatus::Deleted);
}

#[test]
fn diff_and_restore_return_a_tracked_file_to_head() {
    let (dir, repo) = initialized_repo();
    fs::write(dir.path().join("a.md"), "original").unwrap();
    repo.stage_all(options()).unwrap();
    repo.commit("inicial", "Test", "test@example.com", options())
        .unwrap();

    fs::write(dir.path().join("a.md"), "cambiado").unwrap();
    let diff = repo
        .diff_path(DiffScope::WorktreeVsHead, "a.md", options())
        .unwrap();
    assert!(diff.contains("cambiado"));

    repo.restore_file("a.md", options()).unwrap();
    assert_eq!(
        fs::read_to_string(dir.path().join("a.md")).unwrap(),
        "original"
    );
}

#[test]
fn branches_log_and_checkout_work_on_a_real_repository() {
    let (_dir, repo) = initialized_repo();
    fs::write(repo.root().join("a.md"), "contenido").unwrap();
    repo.stage_all(options()).unwrap();
    repo.commit("primera version", "Test", "test@example.com", options())
        .unwrap();

    repo.create_branch("borrador", options()).unwrap();
    assert!(repo
        .branches(options())
        .unwrap()
        .iter()
        .any(|branch| branch.name == "borrador"));

    repo.checkout("borrador", options()).unwrap();
    assert_eq!(
        repo.current_branch(options()).unwrap().as_deref(),
        Some("borrador")
    );

    let commits = repo.log(10, options()).unwrap();
    assert_eq!(commits.len(), 1);
    assert_eq!(commits[0].subject, "primera version");
}

#[test]
fn api_status_and_init_handle_plain_folders() {
    let dir = tempdir().unwrap();
    let root = dir.path().to_str().unwrap();
    let before = super::api::status(root).unwrap();
    assert!(!before.is_repository);

    let after = super::api::init(root).unwrap();
    assert!(after.is_repository);
    assert!(dir.path().join(".git").is_dir());
}
