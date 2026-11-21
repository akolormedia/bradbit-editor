use super::{detect, DiffScope, GitError, MergeOutcome, OpOptions, Repository, WorktreeStatus};
use git2::{IndexAddOption, Repository as GitRepository, Signature};
use std::fs;
use std::path::Path;
use tempfile::tempdir;

fn options() -> OpOptions {
    OpOptions::default()
}

fn initialized_repo() -> (tempfile::TempDir, Repository) {
    let dir = tempdir().unwrap();
    let repo = Repository::init_with_branch(dir.path(), "main", options()).unwrap();
    (dir, repo)
}

fn file_url(path: &Path) -> String {
    format!("file://{}", path.display())
}

fn init_bare_remote(dir: &Path) {
    let mut options = git2::RepositoryInitOptions::new();
    options.bare(true).initial_head("main");
    GitRepository::init_opts(dir, &options).expect("init bare remote");
}

fn clone_repo(remote: &Path, dest: &Path) {
    GitRepository::clone(&file_url(remote), dest).expect("clone remote");
}

fn set_user(dir: &Path, name: &str, email: &str) {
    let repo = GitRepository::open(dir).expect("open repo");
    let mut config = repo.config().expect("config");
    config.set_str("user.name", name).expect("name");
    config.set_str("user.email", email).expect("email");
}

fn commit_all(dir: &Path, message: &str) {
    let repo = GitRepository::open(dir).expect("open repo");
    let mut index = repo.index().expect("index");
    index
        .add_all(["*"].iter(), IndexAddOption::DEFAULT, None)
        .expect("add all");
    index.update_all(["*"].iter(), None).expect("update all");
    index.write().expect("write index");
    let tree_id = index.write_tree().expect("write tree");
    let tree = repo.find_tree(tree_id).expect("tree");
    let signature = Signature::now("Otra", "otra@example.com").expect("signature");
    let parent = repo
        .head()
        .ok()
        .and_then(|head| head.target())
        .and_then(|oid| repo.find_commit(oid).ok());
    let parents: Vec<&git2::Commit> = parent.iter().collect();
    repo.commit(
        Some("HEAD"),
        &signature,
        &signature,
        message,
        &tree,
        &parents,
    )
    .expect("commit");
}

fn push_main(dir: &Path) {
    let repo = GitRepository::open(dir).expect("open repo");
    let mut remote = repo.find_remote("origin").expect("origin");
    remote
        .push(&["refs/heads/main:refs/heads/main"], None)
        .expect("push");
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
fn blame_reports_authors_for_working_tree_lines() {
    let (dir, repo) = initialized_repo();
    fs::write(dir.path().join("a.md"), "uno\ndos\n").unwrap();
    repo.stage_all(options()).unwrap();
    repo.commit("inicial", "Ana", "ana@example.com", options())
        .unwrap();

    let lines = repo.blame("a.md", options()).unwrap();
    assert_eq!(lines.len(), 2);
    assert_eq!(lines[0].line, 1);
    assert_eq!(lines[1].line, 2);
    assert_eq!(lines[0].author, "Ana");
    assert_eq!(lines[0].email, "ana@example.com");
    assert!(lines[0].date.contains('T'));
    assert_eq!(lines[0].summary, "inicial");
    assert!(!lines[0].commit.is_empty());
}

#[test]
fn branch_file_reads_from_another_branch() {
    let (dir, repo) = initialized_repo();
    let root = dir.path().to_str().unwrap();
    fs::write(dir.path().join("a.md"), "main").unwrap();
    repo.stage_all(options()).unwrap();
    repo.commit("main", "Test", "test@example.com", options())
        .unwrap();
    repo.checkout_new("otra", options()).unwrap();
    fs::write(dir.path().join("a.md"), "otra").unwrap();
    repo.stage_all(options()).unwrap();
    repo.commit("otra", "Test", "test@example.com", options())
        .unwrap();
    repo.checkout("main", options()).unwrap();

    assert_eq!(
        super::api::branch_file(root, "otra", "a.md").unwrap(),
        Some("otra".to_string())
    );
    assert_eq!(
        super::api::branch_file(root, "main", "a.md").unwrap(),
        Some("main".to_string())
    );
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
    assert_eq!(after.branch.as_deref(), Some("main"));
    assert!(dir.path().join(".git").is_dir());

    fs::write(dir.path().join("a.md"), "uno").unwrap();
    commit_all(dir.path(), "primera");
    let head = GitRepository::open(dir.path())
        .unwrap()
        .head()
        .unwrap()
        .target()
        .unwrap()
        .to_string();
    let committed = super::api::status(root).unwrap();
    assert_eq!(committed.head.as_deref(), Some(head.as_str()));
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
    // reach `.git/config`, logs or an error message.
    repo.push_with_token("origin", "main", "ghp_local_token", options())
        .unwrap();
    let config = fs::read_to_string(dir.path().join(".git/config")).unwrap();
    assert!(!config.contains("ghp_local_token"), "{config}");
    assert!(!config.contains("BRADBIT_GITHUB_TOKEN"), "{config}");

    let clone = tempdir().unwrap();
    clone_repo(remote.path(), clone.path());
    set_user(clone.path(), "Otra", "otra@example.com");
    fs::write(clone.path().join("b.md"), "desde el clon").unwrap();
    commit_all(clone.path(), "desde el clon");
    push_main(clone.path());

    repo.fetch("origin", options()).unwrap();
    {
        let handle = GitRepository::open(dir.path()).expect("open repo");
        let mut branch = handle
            .find_branch("main", git2::BranchType::Local)
            .expect("main branch");
        branch
            .set_upstream(Some("origin/main"))
            .expect("set upstream");
    }
    let (branch, _) = repo.status(options()).unwrap();
    let branch = branch.expect("branch info");
    assert_eq!((branch.ahead, branch.behind), (0, 1));

    repo.pull_with_token("origin", "main", "ghp_local_token", options())
        .unwrap();
    assert_eq!(
        fs::read_to_string(dir.path().join("b.md")).unwrap(),
        "desde el clon"
    );

    fs::write(clone.path().join("c.md"), "segunda traída").unwrap();
    commit_all(clone.path(), "segunda");
    push_main(clone.path());
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

    GitRepository::open(dir.path())
        .expect("open repo")
        .remote("creds", "https://user:secret@example.com/repo.git")
        .expect("add credential remote");
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
    let repo_handle = GitRepository::open(dir.path()).expect("open repo");
    repo_handle
        .remote("origin", "https://github.com/rafael/demo.git")
        .expect("add origin");
    let key = format!("url.{}.insteadOf", bare.path().display());
    repo_handle
        .config()
        .expect("config")
        .set_str(&key, "https://github.com/rafael/demo.git")
        .expect("set insteadOf");

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
    clone_repo(remote.path(), clone.path());
    set_user(clone.path(), "Otra", "otra@example.com");
    fs::write(clone.path().join("b.md"), "remoto").unwrap();
    commit_all(clone.path(), "remoto");
    push_main(clone.path());

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

#[test]
fn stage_unstage_and_diff_stats_roundtrip() {
    let (dir, repo) = initialized_repo();
    fs::write(dir.path().join("a.md"), "uno\ndos\n").unwrap();
    repo.stage(&["a.md"], options()).unwrap();
    let (_, entries) = repo.status(options()).unwrap();
    assert_eq!(entries[0].index, WorktreeStatus::Added);

    repo.unstage_path("a.md", options()).unwrap();
    let (_, entries) = repo.status(options()).unwrap();
    assert_eq!(entries[0].index, WorktreeStatus::Untracked);

    repo.stage_all(options()).unwrap();
    repo.commit("base", "Ana", "ana@example.com", options())
        .unwrap();

    fs::write(dir.path().join("a.md"), "uno\ntres\ncuatro\n").unwrap();
    let stats = repo
        .diff_stats(DiffScope::WorktreeVsHead, options())
        .unwrap();
    let change = stats
        .iter()
        .find(|change| change.path == "a.md")
        .expect("a.md in stats");
    assert_eq!((change.added, change.removed), (2, 1));

    repo.stage(&["a.md"], options()).unwrap();
    let (_, entries) = repo.status(options()).unwrap();
    assert_eq!(entries[0].index, WorktreeStatus::Modified);
    repo.unstage_all(options()).unwrap();
    let (_, entries) = repo.status(options()).unwrap();
    assert_eq!(entries[0].index, WorktreeStatus::Unmodified);
    assert_eq!(entries[0].worktree, WorktreeStatus::Modified);
}

#[test]
fn delete_branch_refuses_the_current_or_unmerged_branch() {
    let (dir, repo) = initialized_repo();
    fs::write(dir.path().join("a.md"), "base").unwrap();
    repo.stage_all(options()).unwrap();
    repo.commit("base", "Ana", "ana@example.com", options())
        .unwrap();

    repo.create_branch("merged", options()).unwrap();
    let error = repo.delete_branch("main", options()).unwrap_err();
    assert!(
        error.to_string().contains("currently checked out"),
        "{error}"
    );
    repo.delete_branch("merged", options()).unwrap();

    repo.checkout_new("unmerged", options()).unwrap();
    fs::write(dir.path().join("b.md"), "otra").unwrap();
    repo.stage_all(options()).unwrap();
    repo.commit("unmerged", "Ana", "ana@example.com", options())
        .unwrap();
    repo.checkout("main", options()).unwrap();

    let error = repo.delete_branch("unmerged", options()).unwrap_err();
    assert!(error.to_string().contains("not fully merged"), "{error}");
    assert!(repo
        .branches(options())
        .unwrap()
        .iter()
        .any(|branch| branch.name == "unmerged"));
}

#[test]
fn merge_fast_forwards_creates_commits_and_aborts_conflicts() {
    let (dir, repo) = initialized_repo();
    fs::write(dir.path().join("a.md"), "base\n").unwrap();
    repo.stage_all(options()).unwrap();
    repo.commit("base", "Ana", "ana@example.com", options())
        .unwrap();

    repo.checkout_new("feature", options()).unwrap();
    fs::write(dir.path().join("b.md"), "feature\n").unwrap();
    repo.stage_all(options()).unwrap();
    repo.commit("feature", "Ana", "ana@example.com", options())
        .unwrap();
    repo.checkout("main", options()).unwrap();
    assert_eq!(
        repo.merge("feature", options()).unwrap(),
        MergeOutcome::FastForward
    );
    assert_eq!(
        fs::read_to_string(dir.path().join("b.md")).unwrap(),
        "feature\n"
    );

    // A real merge commit for divergent, non-conflicting changes.
    repo.checkout_new("normal", options()).unwrap();
    fs::write(dir.path().join("c.md"), "rama\n").unwrap();
    repo.stage_all(options()).unwrap();
    repo.commit("rama", "Ana", "ana@example.com", options())
        .unwrap();
    repo.checkout("main", options()).unwrap();
    fs::write(dir.path().join("d.md"), "main\n").unwrap();
    repo.stage_all(options()).unwrap();
    repo.commit("main", "Ana", "ana@example.com", options())
        .unwrap();
    let outcome = repo.merge("normal", options()).unwrap();
    assert!(
        matches!(outcome, MergeOutcome::Merged { .. }),
        "{outcome:?}"
    );
    assert!(!repo.is_merging(options()).unwrap());
    let head = repo.log(1, options()).unwrap().remove(0);
    assert_eq!(head.subject, "Merge branch 'normal'");

    // Conflicting changes stay unresolved until abort.
    repo.checkout_new("conflict", options()).unwrap();
    fs::write(dir.path().join("a.md"), "rama\n").unwrap();
    repo.stage_all(options()).unwrap();
    repo.commit("conflicto", "Ana", "ana@example.com", options())
        .unwrap();
    repo.checkout("main", options()).unwrap();
    fs::write(dir.path().join("a.md"), "main\n").unwrap();
    repo.stage_all(options()).unwrap();
    repo.commit("main cambia", "Ana", "ana@example.com", options())
        .unwrap();
    let outcome = repo.merge("conflict", options()).unwrap();
    let MergeOutcome::Conflicts { files } = outcome else {
        panic!("expected conflicts, got {outcome:?}");
    };
    assert_eq!(files, vec!["a.md".to_string()]);
    assert!(repo.is_merging(options()).unwrap());
    repo.abort_merge(options()).unwrap();
    assert!(!repo.is_merging(options()).unwrap());
    assert_eq!(
        fs::read_to_string(dir.path().join("a.md")).unwrap(),
        "main\n"
    );
}

#[test]
fn clone_and_detect_use_the_bundled_engine() {
    let (dir, repo) = initialized_repo();
    fs::write(dir.path().join("a.md"), "clon\n").unwrap();
    repo.stage_all(options()).unwrap();
    repo.commit("base", "Ana", "ana@example.com", options())
        .unwrap();

    let remote = tempdir().unwrap();
    init_bare_remote(remote.path());
    repo.add_remote("origin", remote.path().to_str().unwrap(), options())
        .unwrap();
    repo.push("origin", "main", options()).unwrap();

    let destination = tempdir().unwrap();
    let target = destination.path().join("clon");
    let cloned = super::clone(&file_url(remote.path()), &target, options()).unwrap();
    assert_eq!(cloned.root(), target);
    assert_eq!(fs::read_to_string(target.join("a.md")).unwrap(), "clon\n");

    let version = detect(options()).unwrap();
    assert!(version.is_supported());
    assert!(version.raw.starts_with("libgit2 "), "{}", version.raw);

    let status = super::engine_status().unwrap();
    assert!(status.supported);
    assert_eq!(
        (status.major, status.minor, status.patch),
        (version.major, version.minor, version.patch)
    );
}

#[test]
fn a_cancelled_token_stops_before_touching_the_repository() {
    let (_dir, repo) = initialized_repo();
    let token = super::CancellationToken::new();
    token.cancel();
    let error = repo
        .status(options().cancel(token))
        .expect_err("cancelled status");
    assert!(matches!(error, GitError::Cancelled { .. }), "{error:?}");
}

#[test]
fn stage_all_respects_gitignore_and_binary_diffs_stay_summarized() {
    let (dir, repo) = initialized_repo();
    fs::write(dir.path().join(".gitignore"), "ignored.md\n").unwrap();
    fs::write(dir.path().join("ignored.md"), "no debe entrar").unwrap();
    fs::write(dir.path().join("visible.md"), "sí debe entrar").unwrap();
    repo.stage_all(options()).unwrap();
    repo.commit("base", "Ana", "ana@example.com", options())
        .unwrap();

    let tracked = repo
        .show_file("HEAD", "visible.md", options())
        .expect("visible file");
    assert_eq!(tracked, "sí debe entrar");
    assert!(repo.show_file("HEAD", "ignored.md", options()).is_err());

    fs::write(dir.path().join("imagen.bin"), [0u8, 1, 2, 3, 255]).unwrap();
    fs::write(dir.path().join("visible.md"), "cambiado").unwrap();
    repo.stage(&["imagen.bin"], options()).unwrap();
    let diff = repo.diff(DiffScope::WorktreeVsHead, options()).unwrap();
    assert!(diff.contains("Binary files"), "{diff}");
    assert!(diff.contains("cambiado"), "{diff}");
}
