//! Ambient language policy for the agent runtime.
//!
//! Kit prompts are written in English. The editor writes a small policy file
//! outside the project and passes it to `bradbit serve` through
//! `OPENCODE_CONFIG_CONTENT.instructions`, so the agent replies and writes in
//! the language configured in the app without duplicating every kit.

use std::fs;
use std::path::{Path, PathBuf};

const POLICY_FILE: &str = "agent-language.md";

pub fn policy_path() -> Result<PathBuf, String> {
    Ok(crate::settings::config_dir()?.join(POLICY_FILE))
}

fn language_name(language: &str) -> &'static str {
    if language == "en" {
        "English"
    } else {
        "Spanish"
    }
}

pub fn policy_text(language: &str) -> String {
    let name = language_name(language);
    format!(
        "# Output language\n\n\
         - The Bradbit app is configured in {name}.\n\
         - Always reply in {name}.\n\
         - Write every deliverable in {name}: premises, character sheets, outlines, scenes, dialogue, notes, and summaries.\n\
         - Keep command names, file paths, code, and identifiers exactly as they are.\n\
         - If the user explicitly asks for another language for a specific deliverable, follow that request and then return to {name}.\n"
    )
}

fn write_policy_to(path: &Path, language: &str) -> Result<(), String> {
    let temp = path.with_extension("md.tmp");
    fs::write(&temp, policy_text(language))
        .map_err(|error| format!("Could not write the language policy: {error}"))?;
    fs::rename(&temp, path)
        .map_err(|error| format!("Could not install the language policy: {error}"))
}

/// Writes the policy file used by the runtime and returns its absolute path.
/// Unchanged content is left untouched so the runtime watcher does not reload
/// on unrelated settings saves.
pub fn write_policy(language: &str) -> Result<PathBuf, String> {
    let path = policy_path()?;
    let text = policy_text(language);
    if fs::read_to_string(&path).ok().as_deref() == Some(text.as_str()) {
        return Ok(path);
    }
    write_policy_to(&path, language)?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn policy_text_mentions_spanish_and_preserves_identifiers() {
        let policy = policy_text("es");
        assert!(policy.contains("configured in Spanish"));
        assert!(policy.contains("Always reply in Spanish"));
        assert!(policy.contains("Keep command names, file paths, code, and identifiers"));
    }

    #[test]
    fn policy_text_mentions_english() {
        let policy = policy_text("en");
        assert!(policy.contains("configured in English"));
        assert!(policy.contains("Write every deliverable in English"));
    }

    #[test]
    fn writes_the_policy_at_an_absolute_path() {
        let dir = tempdir().unwrap();
        let path = dir.path().join(POLICY_FILE);
        write_policy_to(&path, "es").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), policy_text("es"));
        assert!(!dir.path().join("agent-language.md.tmp").exists());
    }
}
