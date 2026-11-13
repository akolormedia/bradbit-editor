//! General Git assistant for every Bradbit project.
//!
//! Git versioning is not part of any kit: the editor installs a general
//! `git-versioning` skill and two runtime commands (`save-version` and
//! `history`) in the app support directory, then exposes them to every
//! project through `OPENCODE_CONFIG_CONTENT`.

use std::fs;
use std::path::{Path, PathBuf};

const SKILL_NAME: &str = "git-versioning";

pub fn skill_text() -> &'static str {
    r#"---
name: git-versioning
description: Use this skill to inspect Git changes, propose a human-readable version, and commit only after explicit approval.
i18n:
  es:
    name: Versionado con Git
    description: Usa este skill para revisar cambios de Git, proponer una versión en lenguaje humano y hacer commit solo después de una aprobación explícita.
---

# Git versioning

## Goal
Help the author save a meaningful version of the project without exposing
raw Git output or committing anything without permission.

## Before proposing a version
1. Check that the project is a Git repository. If it is not, explain the
   benefit and offer `git init` with approval; do not initialize silently.
2. Run `git status --short` to see changed, added and untracked files.
3. Run `git diff --stat` and `git diff` to understand the changes. Do not
   dump the full diff to the user; use it to write the summary.
4. Identify secrets, credentials, `.env` files, generated `exports/` and
   large binaries. They must stay out of the commit unless the user
   explicitly approved them.

## What to present
- A 2-4 line summary in the user's language of what changed.
- The list of files that will be included.
- A proposed version name and commit message in the user's language.
- A direct question: "¿Guardo esta versión?" / "Save this version?"

## After explicit approval
1. Stage only the approved paths, for example:
   `git add bible/premise.md structure/outline.md script/act-1.fountain`
2. Commit with the approved message:
   `git commit -m "<message>"`
3. Show the short commit hash and a one-line summary.

## Never
- Never commit without explicit approval.
- Never rewrite history, force push, amend or delete branches.
- Never include secrets, tokens, keys, `.env` files or generated
  `exports/`.
- Never use `git add -A` unless the user explicitly approved every
  change in the working tree.
"#
}

fn skill_dir() -> Result<PathBuf, String> {
    Ok(crate::settings::config_dir()?.join("skills"))
}

fn skill_path_in(dir: &Path) -> PathBuf {
    dir.join(SKILL_NAME).join("SKILL.md")
}

fn write_skill_to(dir: &Path) -> Result<(), String> {
    let path = skill_path_in(dir);
    let content = skill_text();
    if fs::read_to_string(&path).ok().as_deref() == Some(content) {
        return Ok(());
    }
    let parent = path
        .parent()
        .ok_or_else(|| "Could not resolve the Git skill folder".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Could not create the Git skill folder: {error}"))?;
    fs::write(&path, content).map_err(|error| format!("Could not write the Git skill: {error}"))
}

/// Installs the general skill and returns the skills root directory.
pub fn write_skill() -> Result<PathBuf, String> {
    let dir = skill_dir()?;
    write_skill_to(&dir)?;
    Ok(dir)
}

/// Inline runtime commands shared by every project.
pub fn commands() -> serde_json::Value {
    serde_json::json!({
        "save-version": {
            "description": "Saves the current project state as a Git version after the user approves it.",
            "template": "Use the git-versioning skill. Inspect the working tree, summarize the changes in human language, propose a version name and a commit message, and wait for explicit approval before committing. Never commit secrets, generated exports or unrelated files."
        },
        "history": {
            "description": "Summarizes the recent saved versions of the project.",
            "template": "Use the git-versioning skill to read `git log --oneline -10` and summarize the recent versions in human language. Do not change files or create commits."
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn skill_requires_explicit_approval_and_covers_history() {
        let skill = skill_text();
        assert!(skill.contains("explicit approval"));
        assert!(skill.contains("git status --short"));
        assert!(skill.contains("force push"));
        assert!(skill.contains("exports/"));
    }

    #[test]
    fn commands_expose_save_version_and_history() {
        let commands = commands();
        assert!(commands["save-version"]["template"]
            .as_str()
            .unwrap()
            .contains("git-versioning"));
        assert!(commands["history"]["template"]
            .as_str()
            .unwrap()
            .contains("git log"));
    }

    #[test]
    fn writes_the_skill_and_is_idempotent() {
        let dir = tempdir().unwrap();
        write_skill_to(dir.path()).unwrap();
        let path = skill_path_in(dir.path());
        assert_eq!(fs::read_to_string(&path).unwrap(), skill_text());
        write_skill_to(dir.path()).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), skill_text());
    }
}
