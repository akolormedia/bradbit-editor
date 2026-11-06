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

#[test]
fn head_file_and_discard_handle_tracked_and_new_files() {
    let (dir, repo) = initialized_repo();
    let root = dir.path().to_str().unwrap();
    fs::write(dir.path().join("a.md"), "original").unwrap();
    repo.stage_all(options()).unwrap();
    repo.commit("inicial", "Test", "test@example.com", options())
        .unwrap();

    assert_eq!(
        super::api::head_file(root, "a.md").unwrap().as_deref(),
        Some("original")
    );
    assert_eq!(super::api::head_file(root, "nuevo.md").unwrap(), None);

    fs::write(dir.path().join("a.md"), "cambiado").unwrap();
    fs::write(dir.path().join("nuevo.md"), "nuevo").unwrap();

    let tracked = super::api::discard_file(root, "a.md").unwrap();
    assert!(!tracked.deleted);
    assert_eq!(
        fs::read_to_string(dir.path().join("a.md")).unwrap(),
        "original"
    );

    let untracked = super::api::discard_file(root, "nuevo.md").unwrap();
    assert!(untracked.deleted);
    assert!(!dir.path().join("nuevo.md").exists());

    fs::write(dir.path().join("staged.md"), "staged").unwrap();
    repo.stage(&["staged.md"], options()).unwrap();
    let staged = super::api::discard_file(root, "staged.md").unwrap();
    assert!(staged.deleted);
    assert!(!dir.path().join("staged.md").exists());
    assert!(!staged
        .status
        .entries
        .iter()
        .any(|entry| entry.path == "staged.md"));
}

#[test]
fn save_version_history_and_restore_work_on_a_real_repository() {
    let (dir, _repo) = initialized_repo();
    let root = dir.path().to_str().unwrap();
    fs::write(dir.path().join("a.md"), "uno").unwrap();
    fs::write(dir.path().join("b.md"), "dos").unwrap();
    let first =
        super::api::save_version(root, "primera version", "Ana", "ana@example.com").unwrap();
    assert!(first.is_repository);
    assert!(first.entries.is_empty());

    fs::write(dir.path().join("a.md"), "uno modificado").unwrap();
    fs::rename(dir.path().join("b.md"), dir.path().join("c.md")).unwrap();
    super::api::save_version(root, "segunda version", "Ana", "ana@example.com").unwrap();

    let history = super::api::history(root, 10).unwrap();
    assert_eq!(history.len(), 2);
    assert_eq!(history[0].subject, "segunda version");
    assert_eq!(history[1].subject, "primera version");
    assert_eq!(history[0].author, "Ana");
    assert_eq!(history[0].email, "ana@example.com");

    let changed = super::api::commit_files(root, &history[0].id).unwrap();
    assert!(changed.iter().any(|file| file.path == "a.md"));
    let renamed = changed
        .iter()
        .find(|file| file.status.starts_with('R'))
        .expect("rename detected");
    assert_eq!(renamed.path, "c.md");
    assert_eq!(renamed.old_path.as_deref(), Some("b.md"));

    fs::write(dir.path().join("a.md"), "borrador actual").unwrap();
    let restored = super::api::restore_from_commit(root, &history[1].id, "a.md").unwrap();
    assert_eq!(fs::read_to_string(dir.path().join("a.md")).unwrap(), "uno");
    assert!(restored.entries.iter().any(|entry| entry.path == "a.md"));
}

#[test]
fn history_is_empty_before_the_first_version_and_saving_needs_changes() {
    let (dir, _repo) = initialized_repo();
    let root = dir.path().to_str().unwrap();
    assert!(super::api::history(root, 10).unwrap().is_empty());

    let error =
        super::api::save_version(root, "sin cambios", "Ana", "ana@example.com").unwrap_err();
    assert!(error.contains("No hay cambios"));
}

#[test]
fn parallel_drafts_create_switch_and_list_branches() {
    let (dir, _repo) = initialized_repo();
    let root = dir.path().to_str().unwrap();
    fs::write(dir.path().join("a.md"), "base").unwrap();
    super::api::save_version(root, "base", "Ana", "ana@example.com").unwrap();

    let created = super::api::create_branch(root, "borrador-b").unwrap();
    assert_eq!(created.branch.as_deref(), Some("borrador-b"));

    fs::write(dir.path().join("a.md"), "version alternativa").unwrap();
    super::api::save_version(root, "alternativa", "Ana", "ana@example.com").unwrap();

    let branches = super::api::branches(root).unwrap();
    assert_eq!(branches.len(), 2);
    assert!(branches
        .iter()
        .any(|branch| branch.name == "borrador-b" && branch.current));
    assert!(branches
        .iter()
        .any(|branch| branch.name == "main" && !branch.current));

    let back = super::api::checkout_branch(root, "main").unwrap();
    assert_eq!(back.branch.as_deref(), Some("main"));
    assert_eq!(fs::read_to_string(dir.path().join("a.md")).unwrap(), "base");
}
