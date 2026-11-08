use super::{DiffScope, GitError, OpOptions, Repository, WorktreeStatus};
use std::fs;
use std::path::Path;
use std::process::Command;
use tempfile::tempdir;

fn options() -> OpOptions {
    OpOptions::default()
}

fn initialized_repo() -> (tempfile::TempDir, Repository) {
    let dir = tempdir().unwrap();
    let repo = Repository::init_with_branch(dir.path(), "main", options()).unwrap();
    (dir, repo)
}

fn git(dir: &Path, args: &[&str]) {
    let output = Command::new("git")
        .args(args)
        .current_dir(dir)
        .output()
        .expect("run git");
    assert!(
        output.status.success(),
        "git {:?} failed: {}",
        args,
        String::from_utf8_lossy(&output.stderr)
    );
}

fn init_bare_remote(dir: &Path) {
    git(dir, &["init", "--bare"]);
    git(dir, &["symbolic-ref", "HEAD", "refs/heads/main"]);
}

fn clone_repo(remote: &str, dest: &Path) {
    let output = Command::new("git")
        .args(["clone", remote, dest.to_str().unwrap()])
        .output()
        .expect("clone remote");
    assert!(
        output.status.success(),
        "git clone failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

#[test]
fn status_reports_modified_untracked_and_deleted_files() {
    let (dir, repo) = initialized_repo();
    fs::write(dir.path().join("a.md"), "one").unwrap();
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
    fs::write(dir.path().join("a.md"), "one").unwrap();
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
    assert_eq!(fs::read_to_string(dir.path().join("a.md")).unwrap(), "one");
    assert!(restored.entries.iter().any(|entry| entry.path == "a.md"));
}

#[test]
fn history_is_empty_before_the_first_version_and_saving_needs_changes() {
    let (dir, _repo) = initialized_repo();
    let root = dir.path().to_str().unwrap();
    assert!(super::api::history(root, 10).unwrap().is_empty());

    let error =
        super::api::save_version(root, "sin cambios", "Ana", "ana@example.com").unwrap_err();
    assert!(error.contains("There are no changes"));
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

#[test]
fn remotes_push_pull_and_token_hygiene_with_a_local_bare_remote() {
    let (dir, repo) = initialized_repo();
    fs::write(dir.path().join("a.md"), "base").unwrap();
    repo.stage_all(options()).unwrap();
    repo.commit("base", "Ana", "ana@example.com", options())
        .unwrap();

    let remote = tempdir().unwrap();
    init_bare_remote(remote.path());
    let remote_path = remote.path().to_str().unwrap();

    repo.add_remote("origin", remote_path, options()).unwrap();
    assert_eq!(
        repo.remotes(options()).unwrap(),
        vec![("origin".to_string(), remote_path.to_string())]
    );
    repo.push("origin", "main", options()).unwrap();

    // Token-authenticated push against a local remote: the token must never
    // reach argv or `.git/config`.
    repo.push_with_token("origin", "main", "ghp_local_token", options())
        .unwrap();
    let config = fs::read_to_string(dir.path().join(".git/config")).unwrap();
    assert!(!config.contains("ghp_local_token"), "{config}");
    assert!(!config.contains("BRADBIT_GITHUB_TOKEN"), "{config}");

    let clone = tempdir().unwrap();
    clone_repo(remote_path, clone.path());
    git(clone.path(), &["config", "user.name", "Otra"]);
    git(clone.path(), &["config", "user.email", "otra@example.com"]);
    fs::write(clone.path().join("b.md"), "desde el clon").unwrap();
    git(clone.path(), &["add", "-A"]);
    git(clone.path(), &["commit", "-m", "desde el clon"]);
    git(clone.path(), &["push", "origin", "main"]);

    repo.fetch("origin", options()).unwrap();
    repo.pull_with_token("origin", "main", "ghp_local_token", options())
        .unwrap();
    assert_eq!(
        fs::read_to_string(dir.path().join("b.md")).unwrap(),
        "desde el clon"
    );

    fs::write(clone.path().join("c.md"), "segunda traída").unwrap();
    git(clone.path(), &["add", "-A"]);
    git(clone.path(), &["commit", "-m", "segunda"]);
    git(clone.path(), &["push", "origin", "main"]);
    repo.pull("origin", "main", options()).unwrap();
    assert_eq!(
        fs::read_to_string(dir.path().join("c.md")).unwrap(),
        "segunda traída"
    );
}

#[test]
fn add_remote_rejects_credentials_and_remotes_are_redacted() {
    let (dir, repo) = initialized_repo();
    let error = repo
        .add_remote(
            "malo",
            "https://user:secret@example.com/repo.git",
            options(),
        )
        .unwrap_err();
    assert!(matches!(error, GitError::InvalidInput(_)), "{error:?}");

    git(
        dir.path(),
        &[
            "remote",
            "add",
            "creds",
            "https://user:secret@example.com/repo.git",
        ],
    );
    let url = repo
        .remotes(options())
        .unwrap()
        .into_iter()
        .find(|(name, _)| name == "creds")
        .map(|(_, url)| url)
        .expect("remote");
    assert_eq!(url, "https://***@example.com/repo.git");
    assert!(!url.contains("secret"), "{url}");
}

#[test]
fn remotes_report_the_configured_url_not_the_insteadof_expansion() {
    let (dir, repo) = initialized_repo();
    let bare = tempdir().unwrap();
    init_bare_remote(bare.path());
    git(
        dir.path(),
        &[
            "remote",
            "add",
            "origin",
            "https://github.com/rafael/demo.git",
        ],
    );
    let key = format!("url.{}.insteadOf", bare.path().display());
    git(
        dir.path(),
        &["config", &key, "https://github.com/rafael/demo.git"],
    );

    let remotes = repo.remotes(options()).unwrap();
    assert_eq!(
        remotes,
        vec![(
            "origin".to_string(),
            "https://github.com/rafael/demo.git".to_string()
        )]
    );
}

#[test]
fn api_remotes_push_and_pull_with_a_local_bare_remote() {
    let (dir, _repo) = initialized_repo();
    let root = dir.path().to_str().unwrap();
    fs::write(dir.path().join("a.md"), "base").unwrap();
    super::api::save_version(root, "base", "Ana", "ana@example.com").unwrap();

    let remote = tempdir().unwrap();
    init_bare_remote(remote.path());
    let remote_path = remote.path().to_str().unwrap();
    let remotes = super::api::add_remote(root, "origin", remote_path).unwrap();
    assert_eq!(remotes.len(), 1);
    assert_eq!(remotes[0].name, "origin");

    let pushed = super::api::push(root, "origin", "main", None).unwrap();
    assert_eq!(pushed.branch.as_deref(), Some("main"));

    let clone = tempdir().unwrap();
    clone_repo(remote_path, clone.path());
    git(clone.path(), &["config", "user.name", "Otra"]);
    git(clone.path(), &["config", "user.email", "otra@example.com"]);
    fs::write(clone.path().join("b.md"), "remoto").unwrap();
    git(clone.path(), &["add", "-A"]);
    git(clone.path(), &["commit", "-m", "remoto"]);
    git(clone.path(), &["push", "origin", "main"]);

    let fetched = super::api::fetch(root, "origin").unwrap();
    assert!(fetched.is_repository);
    let pulled = super::api::pull(root, "origin", "main", None).unwrap();
    assert!(pulled.is_repository);
    assert_eq!(
        fs::read_to_string(dir.path().join("b.md")).unwrap(),
        "remoto"
    );
    assert_eq!(super::api::remotes(root).unwrap().len(), 1);
}
