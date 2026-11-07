use serde::Serialize;
use std::fs;
use std::path::Path;

const MAX_DEPTH: usize = 12;
const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;
const MAX_SNIPPET_CHARS: usize = 240;
const MAX_RESULTS_CAP: usize = 1000;
const SKIPPED_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    ".next",
    "build",
    "vendor",
];
const CONFIG_DIRS: &[&str] = &[".opencode", ".bradbit", ".narra"];
const CONFIG_FILES: &[&str] = &["AGENTS.md", "CLAUDE.md", ".gitignore"];

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatch {
    pub path: String,
    /// 1-based line number.
    pub line: usize,
    /// 1-based column of the first match in the line.
    pub column: usize,
    pub snippet: String,
}

/// Searches UTF-8 text files under `root` for a case-insensitive literal term.
/// Results are deterministic (path, then line) and capped at `max_results`.
pub fn search_in_folder(
    root: &str,
    query: &str,
    max_results: usize,
    include_config: bool,
) -> Result<Vec<SearchMatch>, String> {
    let needle = query.trim();
    if needle.is_empty() {
        return Ok(Vec::new());
    }
    let root = fs::canonicalize(root)
        .map_err(|e| format!("Could not open folder '{}': {}", root, e))?;
    if !root.is_dir() {
        return Err(format!("The path '{}' is not a folder", root.display()));
    }

    let needle = needle.to_lowercase();
    let limit = max_results.clamp(1, MAX_RESULTS_CAP);
    let mut matches = Vec::new();
    walk(
        &root,
        &root,
        &needle,
        limit,
        include_config,
        0,
        &mut matches,
    )?;
    matches.sort_by(|a, b| a.path.cmp(&b.path).then(a.line.cmp(&b.line)));
    Ok(matches)
}

fn walk(
    root: &Path,
    directory: &Path,
    needle: &str,
    limit: usize,
    include_config: bool,
    depth: usize,
    matches: &mut Vec<SearchMatch>,
) -> Result<(), String> {
    if depth > MAX_DEPTH || matches.len() >= limit {
        return Ok(());
    }

    let entries = fs::read_dir(directory)
        .map_err(|e| format!("Error leyendo '{}': {}", directory.display(), e))?;

    for entry in entries.flatten() {
        if matches.len() >= limit {
            break;
        }
        let file_type = match entry.file_type() {
            Ok(value) => value,
            Err(_) => continue,
        };
        if file_type.is_symlink() {
            continue;
        }

        let name = entry.file_name().to_string_lossy().to_string();
        if file_type.is_dir() {
            if SKIPPED_DIRS.contains(&name.as_str()) {
                continue;
            }
            if !include_config && CONFIG_DIRS.contains(&name.as_str()) {
                continue;
            }
            walk(
                root,
                &entry.path(),
                needle,
                limit,
                include_config,
                depth + 1,
                matches,
            )?;
            continue;
        }
        if !file_type.is_file() {
            continue;
        }
        if !include_config && CONFIG_FILES.contains(&name.as_str()) {
            continue;
        }

        let metadata = match entry.metadata() {
            Ok(value) => value,
            Err(_) => continue,
        };
        if metadata.len() > MAX_FILE_BYTES {
            continue;
        }

        // UTF-8 decoding doubles as the binary-file filter.
        let content = match fs::read_to_string(entry.path()) {
            Ok(value) => value,
            Err(_) => continue,
        };

        for (index, line) in content.lines().enumerate() {
            if matches.len() >= limit {
                break;
            }
            let lower = line.to_lowercase();
            let Some(byte_index) = lower.find(needle) else {
                continue;
            };
            let column = line
                .char_indices()
                .take_while(|(offset, _)| *offset < byte_index)
                .count()
                + 1;
            let entry_path = entry.path();
            let relative = entry_path
                .strip_prefix(root)
                .unwrap_or(entry_path.as_path())
                .to_string_lossy()
                .replace('\\', "/");
            matches.push(SearchMatch {
                path: relative,
                line: index + 1,
                column,
                snippet: snippet(line),
            });
        }
    }

    Ok(())
}

fn snippet(line: &str) -> String {
    let trimmed = line.trim();
    let mut value: String = trimmed.chars().take(MAX_SNIPPET_CHARS).collect();
    if trimmed.chars().count() > MAX_SNIPPET_CHARS {
        value.push('…');
    }
    value
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::tempdir;

    #[test]
    fn finds_case_insensitive_matches_with_line_and_snippet() {
        let dir = tempdir().unwrap();
        fs::create_dir_all(dir.path().join("biblia")).unwrap();
        fs::create_dir_all(dir.path().join("guion")).unwrap();
        fs::write(
            dir.path().join("biblia/premisa.md"),
            "# Premisa\n\nUna idea sobre Ana.\n",
        )
        .unwrap();
        fs::write(
            dir.path().join("guion/acto-1.fountain"),
            "INT. HOUSE - DAY\n\nANA\nHola, Ana.\n",
        )
        .unwrap();

        let results = search_in_folder(dir.path().to_str().unwrap(), "ana", 50, false).unwrap();
        assert_eq!(results.len(), 3);
        assert_eq!(results[0].path, "biblia/premisa.md");
        assert_eq!(results[0].line, 3);
        assert_eq!(results[0].snippet, "Una idea sobre Ana.");
        assert_eq!(results[1].path, "guion/acto-1.fountain");
        assert_eq!(results[1].line, 3);
        assert_eq!(results[2].line, 4);
    }

    #[test]
    fn skips_binary_and_technical_directories() {
        let dir = tempdir().unwrap();
        fs::create_dir_all(dir.path().join(".git")).unwrap();
        fs::write(dir.path().join(".git/config"), "token buscado").unwrap();
        fs::write(dir.path().join("notas.md"), "texto buscado").unwrap();
        let mut binary = fs::File::create(dir.path().join("imagen.png")).unwrap();
        binary.write_all(&[0xFF, 0xFE, 0x00, 0x01]).unwrap();

        let results = search_in_folder(dir.path().to_str().unwrap(), "buscado", 50, false).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].path, "notas.md");
    }

    #[test]
    fn skips_configuration_files_unless_requested() {
        let dir = tempdir().unwrap();
        fs::create_dir_all(dir.path().join(".opencode/commands")).unwrap();
        fs::create_dir_all(dir.path().join("biblia")).unwrap();
        fs::write(
            dir.path().join(".opencode/commands/idea.md"),
            "desarrollo de la premisa",
        )
        .unwrap();
        fs::write(dir.path().join("biblia/premisa.md"), "# Premisa").unwrap();

        let without = search_in_folder(dir.path().to_str().unwrap(), "premisa", 50, false).unwrap();
        assert_eq!(without.len(), 1);
        assert_eq!(without[0].path, "biblia/premisa.md");

        let with = search_in_folder(dir.path().to_str().unwrap(), "premisa", 50, true).unwrap();
        assert_eq!(with.len(), 2);
        assert!(with
            .iter()
            .any(|item| item.path == ".opencode/commands/idea.md"));
    }

    #[test]
    fn respects_the_result_limit_and_empty_queries() {
        let dir = tempdir().unwrap();
        let lines = (1..=10)
            .map(|n| format!("coincidencia {n}"))
            .collect::<Vec<_>>()
            .join("\n");
        fs::write(dir.path().join("notas.md"), lines).unwrap();

        let results =
            search_in_folder(dir.path().to_str().unwrap(), "coincidencia", 3, false).unwrap();
        assert_eq!(results.len(), 3);
        assert_eq!(
            search_in_folder(dir.path().to_str().unwrap(), "   ", 10, false).unwrap(),
            Vec::new()
        );
    }

    #[test]
    fn truncates_long_snippets() {
        let dir = tempdir().unwrap();
        let long = format!("inicio {}", "x".repeat(300));
        fs::write(dir.path().join("notas.md"), long).unwrap();

        let results = search_in_folder(dir.path().to_str().unwrap(), "inicio", 10, false).unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].snippet.ends_with('…'));
        assert!(results[0].snippet.chars().count() <= MAX_SNIPPET_CHARS + 1);
    }

    #[test]
    fn reports_a_clear_error_for_an_invalid_root() {
        let error = search_in_folder("/ruta/que/no/existe", "texto", 10, false).unwrap_err();
        assert!(error.contains("Could not open folder"));
    }
}
