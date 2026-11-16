//! libgit2 integration coverage for the operations the editor needs.
//!
//! It exercises local status/log/commit/diff/restore/branches and a local
//! `file://` remote (push/fetch/fast-forward pull), plus an ignored HTTPS
//! smoke test. The wrapper-level tests live in `src/git/tests.rs`.

use std::fs;
use std::path::Path;

use git2::build::{CheckoutBuilder, RepoBuilder};
use git2::{
    BranchType, DiffFormat, IndexAddOption, Repository, RepositoryInitOptions, Signature,
    StatusOptions,
};
use tempfile::TempDir;

fn init_repo(path: &Path, branch: &str) -> Repository {
    let mut opts = RepositoryInitOptions::new();
    opts.initial_head(branch);
    Repository::init_opts(path, &opts).expect("init repo")
}

fn signature() -> Signature<'static> {
    Signature::now("Bradbit Writer", "writer@bradbit.local").expect("signature")
}

fn stage_all(repo: &Repository) {
    let mut index = repo.index().expect("index");
    index
        .add_all(["*"].iter(), IndexAddOption::DEFAULT, None)
        .expect("add all");
    index.update_all(["*"].iter(), None).expect("update all");
    index.write().expect("write index");
}

fn commit_all(repo: &Repository, message: &str) -> git2::Oid {
    let mut index = repo.index().expect("index");
    let tree_id = index.write_tree().expect("write tree");
    let tree = repo.find_tree(tree_id).expect("find tree");
    let sig = signature();
    let parent = repo
        .head()
        .ok()
        .and_then(|head| head.target())
        .and_then(|oid| repo.find_commit(oid).ok());
    let parents: Vec<&git2::Commit> = parent.iter().collect();
    repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &parents)
        .expect("commit")
}

fn status_flags(repo: &Repository, path: &str) -> Option<git2::Status> {
    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_ignored(false);
    let statuses = repo.statuses(Some(&mut opts)).expect("status");
    statuses
        .iter()
        .find(|entry| entry.path().ok() == Some(path))
        .map(|entry| entry.status())
}

fn worktree_diff(repo: &Repository) -> String {
    let head_tree = repo.head().ok().and_then(|head| head.peel_to_tree().ok());
    let diff = repo
        .diff_tree_to_workdir_with_index(head_tree.as_ref(), None)
        .expect("diff");
    let mut text = String::new();
    diff.print(DiffFormat::Patch, |_delta, _hunk, line| {
        text.push_str(&String::from_utf8_lossy(line.content()));
        true
    })
    .expect("print diff");
    text
}

fn show_file(repo: &Repository, commit: &str, path: &str) -> String {
    let object = repo
        .revparse_single(&format!("{commit}:{path}"))
        .expect("find blob");
    let blob = object.peel_to_blob().expect("peel blob");
    String::from_utf8_lossy(blob.content()).into_owned()
}

fn current_branch(repo: &Repository) -> Option<String> {
    repo.head()
        .ok()
        .and_then(|head| head.shorthand().ok().map(str::to_string))
}

fn local_remote_url(path: &Path) -> String {
    format!("file://{}", path.display())
}

#[test]
fn status_log_commit_diff_and_restore_match_the_editor_flow() {
    let dir = TempDir::new().expect("tempdir");
    let repo = init_repo(dir.path(), "main");

    fs::write(dir.path().join("escena-ñ.md"), "INT. CASA - DÍA\n").expect("write scene");
    fs::write(dir.path().join("nota.md"), "nota uno\n").expect("write note");

    assert_eq!(
        status_flags(&repo, "escena-ñ.md"),
        Some(git2::Status::WT_NEW)
    );
    assert_eq!(status_flags(&repo, "nota.md"), Some(git2::Status::WT_NEW));

    stage_all(&repo);
    let first = commit_all(&repo, "primera versión");

    let mut walk = repo.revwalk().expect("revwalk");
    walk.push_head().expect("push head");
    let ids: Vec<_> = walk.map(|oid| oid.expect("oid")).collect();
    assert_eq!(ids, vec![first]);

    let commit = repo.find_commit(first).expect("find commit");
    assert_eq!(commit.message().ok(), Some("primera versión"));
    assert_eq!(commit.author().name().ok(), Some("Bradbit Writer"));
    assert_eq!(commit.author().email().ok(), Some("writer@bradbit.local"));
    assert!(commit.time().seconds() > 0);

    fs::write(
        dir.path().join("escena-ñ.md"),
        "INT. CASA - NOCHE\n\nLa luz parpadea.\n",
    )
    .expect("modify scene");
    fs::remove_file(dir.path().join("nota.md")).expect("delete note");
    fs::write(dir.path().join("nuevo.md"), "nuevo\n").expect("write new");

    assert_eq!(
        status_flags(&repo, "escena-ñ.md"),
        Some(git2::Status::WT_MODIFIED)
    );
    assert_eq!(
        status_flags(&repo, "nota.md"),
        Some(git2::Status::WT_DELETED)
    );
    assert_eq!(status_flags(&repo, "nuevo.md"), Some(git2::Status::WT_NEW));

    let diff = worktree_diff(&repo);
    assert!(diff.contains("La luz parpadea."));
    assert!(diff.contains("nota.md"));

    assert_eq!(show_file(&repo, "HEAD", "escena-ñ.md"), "INT. CASA - DÍA\n");

    // Restore one tracked path the way “Discard changes” does.
    let mut checkout = CheckoutBuilder::new();
    checkout.path("escena-ñ.md").force();
    repo.checkout_head(Some(&mut checkout))
        .expect("restore path");
    assert_eq!(
        fs::read_to_string(dir.path().join("escena-ñ.md")).expect("read scene"),
        "INT. CASA - DÍA\n"
    );
    assert!(status_flags(&repo, "escena-ñ.md").is_none());

    // “Files changed by this version” from the tree diff.
    let tree = commit.tree().expect("tree");
    let diff = repo
        .diff_tree_to_tree(None, Some(&tree), None)
        .expect("tree diff");
    let mut files = Vec::new();
    diff.foreach(
        &mut |delta, _progress| {
            let path = delta
                .new_file()
                .path()
                .or_else(|| delta.old_file().path())
                .expect("path")
                .to_string_lossy()
                .into_owned();
            files.push((delta.status(), path));
            true
        },
        None,
        None,
        None,
    )
    .expect("foreach");
    files.sort_by(|a, b| a.1.cmp(&b.1));
    assert_eq!(
        files,
        vec![
            (git2::Delta::Added, "escena-ñ.md".to_string()),
            (git2::Delta::Added, "nota.md".to_string())
        ]
    );

    // Diff stats: no external parser needed.
    let diff = repo
        .diff_tree_to_workdir_with_index(Some(&tree), None)
        .expect("stats diff");
    let stats = diff.stats().expect("stats");
    // `git diff HEAD` does not include untracked files: only the deletion.
    assert_eq!(stats.files_changed(), 1);
}

#[test]
fn stage_all_respects_gitignore_and_binary_diffs_stay_summarized() {
    let dir = TempDir::new().expect("tempdir");
    let repo = init_repo(dir.path(), "main");
    fs::write(dir.path().join(".gitignore"), "ignored.md\n").expect("write ignore");
    fs::write(dir.path().join("ignored.md"), "no debe entrar\n").expect("write ignored");
    fs::write(dir.path().join("visible.md"), "sí debe entrar\n").expect("write visible");
    fs::write(dir.path().join("imagen.bin"), [0u8, 1, 2, 3, 255]).expect("write binary");

    stage_all(&repo);
    let tree_id = repo.index().expect("index").write_tree().expect("tree");
    let tree = repo.find_tree(tree_id).expect("find tree");
    assert!(tree.get_name(".gitignore").is_some());
    assert!(tree.get_name("visible.md").is_some());
    assert!(tree.get_name("imagen.bin").is_some());
    assert!(tree.get_name("ignored.md").is_none());
    assert!(status_flags(&repo, "ignored.md").is_none());

    commit_all(&repo, "con ignore y binario");

    // A binary change must never leak raw bytes into the diff panel.
    fs::write(dir.path().join("imagen.bin"), [0u8, 9, 9, 9, 255]).expect("modify binary");
    let diff = worktree_diff(&repo);
    assert!(diff.contains("Binary files"), "diff was: {diff}");
    assert!(!diff.contains("\u{0}"));
}

#[test]
fn an_unborn_repository_reports_no_history_instead_of_failing() {
    let dir = TempDir::new().expect("tempdir");
    let repo = init_repo(dir.path(), "main");
    assert!(repo.head().is_err());
    let mut walk = repo.revwalk().expect("revwalk");
    assert!(walk.push_head().is_err());
}

#[test]
fn safe_checkout_refuses_to_overwrite_local_changes() {
    let dir = TempDir::new().expect("tempdir");
    let repo = init_repo(dir.path(), "main");
    fs::write(dir.path().join("a.md"), "main\n").expect("write main");
    stage_all(&repo);
    commit_all(&repo, "main");

    let head = repo.head().expect("head").peel_to_commit().expect("commit");
    repo.branch("otra", &head, false).expect("create branch");
    repo.set_head("refs/heads/otra").expect("set head");
    let mut checkout = CheckoutBuilder::new();
    checkout.safe();
    repo.checkout_head(Some(&mut checkout))
        .expect("checkout otra");
    fs::write(dir.path().join("a.md"), "otra\n").expect("write otra");
    stage_all(&repo);
    commit_all(&repo, "otra");

    repo.set_head("refs/heads/main").expect("back to main");
    repo.checkout_head(Some(&mut CheckoutBuilder::new().force()))
        .expect("restore main");
    fs::write(dir.path().join("a.md"), "cambio local\n").expect("local change");

    let target = repo
        .find_branch("otra", BranchType::Local)
        .expect("branch")
        .into_reference()
        .peel_to_commit()
        .expect("target");
    let mut checkout = CheckoutBuilder::new();
    checkout.safe();
    let error = repo
        .checkout_tree(target.as_object(), Some(&mut checkout))
        .expect_err("safe checkout must refuse");
    assert!(error.message().contains("conflict") || error.message().contains("overwrite"));
    assert_eq!(
        fs::read_to_string(dir.path().join("a.md")).expect("read"),
        "cambio local\n"
    );
    assert_eq!(current_branch(&repo).as_deref(), Some("main"));
}

#[test]
fn branches_can_be_created_and_checked_out() {
    let dir = TempDir::new().expect("tempdir");
    let repo = init_repo(dir.path(), "main");
    fs::write(dir.path().join("a.md"), "uno\n").expect("write");
    stage_all(&repo);
    commit_all(&repo, "base");

    let head = repo.head().expect("head").peel_to_commit().expect("commit");
    repo.branch("borrador", &head, false)
        .expect("create branch");
    repo.set_head("refs/heads/borrador").expect("set head");
    let mut checkout = CheckoutBuilder::new();
    checkout.safe();
    repo.checkout_head(Some(&mut checkout)).expect("checkout");

    assert_eq!(current_branch(&repo).as_deref(), Some("borrador"));
    let names: Vec<_> = repo
        .branches(Some(BranchType::Local))
        .expect("branches")
        .map(|item| {
            let (branch, _) = item.expect("branch");
            (
                branch.name().expect("name").expect("utf8").to_string(),
                branch.is_head(),
            )
        })
        .collect();
    assert!(names.contains(&("main".to_string(), false)));
    assert!(names.contains(&("borrador".to_string(), true)));
}

#[test]
fn local_remote_push_fetch_and_fast_forward_pull_work() {
    let remote_dir = TempDir::new().expect("remote dir");
    let remote_path = remote_dir.path().join("origin.git");
    let mut remote_opts = RepositoryInitOptions::new();
    remote_opts.bare(true).initial_head("main");
    let remote_repo = Repository::init_opts(&remote_path, &remote_opts).expect("bare repo");
    drop(remote_repo);

    let local_dir = TempDir::new().expect("local dir");
    let local = init_repo(local_dir.path(), "main");
    fs::write(local_dir.path().join("capitulo.md"), "v1\n").expect("write");
    stage_all(&local);
    commit_all(&local, "v1");

    local
        .remote("origin", &local_remote_url(&remote_path))
        .expect("add remote");
    let remotes = local.remotes().expect("list remotes");
    assert_eq!(remotes.get(0).expect("remote name"), Some("origin"));
    assert_eq!(
        local.find_remote("origin").expect("remote").url(),
        Ok(local_remote_url(&remote_path).as_str())
    );

    let mut origin = local.find_remote("origin").expect("remote");
    origin
        .push(&["refs/heads/main:refs/heads/main"], None)
        .expect("push");

    let clone_dir = TempDir::new().expect("clone dir");
    let clone = RepoBuilder::new()
        .clone(&local_remote_url(&remote_path), clone_dir.path())
        .expect("clone");
    assert_eq!(
        fs::read_to_string(clone_dir.path().join("capitulo.md")).expect("read clone"),
        "v1\n"
    );

    fs::write(clone_dir.path().join("capitulo.md"), "v2\n").expect("write clone");
    stage_all(&clone);
    commit_all(&clone, "v2");
    let mut clone_origin = clone.find_remote("origin").expect("clone remote");
    clone_origin
        .push(&["refs/heads/main:refs/heads/main"], None)
        .expect("push clone");

    // Fetch into the original repository and measure ahead/behind.
    let mut origin = local.find_remote("origin").expect("remote");
    origin
        .fetch(&["refs/heads/main:refs/remotes/origin/main"], None, None)
        .expect("fetch");
    let local_oid = local
        .find_reference("refs/heads/main")
        .expect("local ref")
        .target()
        .expect("local oid");
    let remote_oid = local
        .find_reference("refs/remotes/origin/main")
        .expect("remote ref")
        .target()
        .expect("remote oid");
    let (ahead, behind) = local
        .graph_ahead_behind(local_oid, remote_oid)
        .expect("ahead/behind");
    assert_eq!((ahead, behind), (0, 1));

    // The status panel gets the same numbers from the branch upstream.
    let mut main_branch = local
        .find_branch("main", BranchType::Local)
        .expect("main branch");
    main_branch
        .set_upstream(Some("origin/main"))
        .expect("set upstream");
    let upstream_oid = main_branch
        .upstream()
        .expect("upstream")
        .get()
        .target()
        .expect("upstream oid");
    assert_eq!(
        local
            .graph_ahead_behind(local_oid, upstream_oid)
            .expect("upstream ahead/behind"),
        (0, 1)
    );

    // Fast-forward only pull: update the worktree and move the branch.
    let fetched = local
        .find_reference("refs/remotes/origin/main")
        .expect("fetched ref")
        .peel_to_commit()
        .expect("fetched commit");
    let mut checkout = CheckoutBuilder::new();
    checkout.force();
    local
        .checkout_tree(fetched.as_object(), Some(&mut checkout))
        .expect("checkout fetched tree");
    local
        .reference("refs/heads/main", fetched.id(), true, "pull: fast-forward")
        .expect("move branch");
    local.set_head("refs/heads/main").expect("set head");

    assert_eq!(
        fs::read_to_string(local_dir.path().join("capitulo.md")).expect("read local"),
        "v2\n"
    );
    assert!(status_flags(&local, "capitulo.md").is_none());

    // Rename detection for the “files changed” panel.
    fs::rename(
        local_dir.path().join("capitulo.md"),
        local_dir.path().join("capítulo-1.md"),
    )
    .expect("rename");
    stage_all(&local);
    commit_all(&local, "renombrar");
    let head = local
        .head()
        .expect("head")
        .peel_to_commit()
        .expect("commit");
    let parent = head.parent(0).expect("parent");
    let mut diff = local
        .diff_tree_to_tree(
            Some(&parent.tree().expect("parent tree")),
            Some(&head.tree().expect("tree")),
            None,
        )
        .expect("rename diff");
    diff.find_similar(Some(&mut git2::DiffFindOptions::new()))
        .expect("detect renames");
    let mut renamed = Vec::new();
    diff.foreach(
        &mut |delta, _progress| {
            if delta.status() == git2::Delta::Renamed {
                renamed.push((
                    delta.old_file().path().map(|p| p.to_path_buf()),
                    delta.new_file().path().map(|p| p.to_path_buf()),
                ));
            }
            true
        },
        None,
        None,
        None,
    )
    .expect("foreach");
    assert_eq!(
        renamed,
        vec![(
            Some(Path::new("capitulo.md").to_path_buf()),
            Some(Path::new("capítulo-1.md").to_path_buf())
        )]
    );
}

/// Manual HTTPS smoke test (network). Run with:
/// `cargo test --test libgit2_probe -- --ignored`.
#[test]
#[ignore = "network"]
fn https_clone_smoke() {
    let dir = TempDir::new().expect("tempdir");
    let repo = RepoBuilder::new()
        .clone("https://github.com/octocat/Hello-World.git", dir.path())
        .expect("https clone");
    assert!(repo.head().expect("head").target().is_some());
}
