//! Folder-level PDF export.
//!
//! A folder is exported as either:
//! - **Markdown**: one A4 book PDF joining every `.md`/`.markdown`/`.mdx`
//!   file in natural order.
//! - **Fountain**: one screenplay PDF per `.fountain`/`.spmd` file, keeping
//!   the folder structure under `exports/`.
//!
//! Mixed folders are rejected with a clear error instead of guessing which
//! format the writer wanted.

use crate::book_pdf;
use crate::fountain;
use crate::fs_ops;
use serde::Serialize;
use std::cmp::Ordering;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Format {
    Markdown,
    Fountain,
}

#[derive(Debug)]
struct CollectedFile {
    relative: String,
    path: PathBuf,
    format: Format,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FolderPdfResult {
    /// `markdown` for one book PDF, `fountain` for one PDF per script.
    pub kind: String,
    /// Absolute paths of the generated PDFs.
    pub outputs: Vec<String>,
}

/// Exports a project-relative folder to PDF. An empty `title` derives a
/// readable title from the folder (or project) name.
pub fn export_to_project(
    root: &str,
    rel_folder: &str,
    title: &str,
    author: &str,
) -> Result<FolderPdfResult, String> {
    let root_path = fs::canonicalize(root)
        .map_err(|e| format!("Could not open the folder '{}': {}", root, e))?;
    if !root_path.is_dir() {
        return Err(format!("The path '{}' is not a folder", root));
    }

    let folder_path = resolve_folder(&root_path, rel_folder)?;
    let folder_name = folder_path
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| "book".to_string());

    let files = collect_files(&folder_path)?;
    if files.is_empty() {
        return Err(format!(
            "No Markdown or Fountain files found in '{}'",
            folder_name
        ));
    }

    let markdown_count = files
        .iter()
        .filter(|file| file.format == Format::Markdown)
        .count();
    let fountain_count = files.len() - markdown_count;
    if markdown_count > 0 && fountain_count > 0 {
        return Err(format!(
            "'{}' mixes {} Markdown and {} Fountain files. Choose a folder with a single format.",
            folder_name, markdown_count, fountain_count
        ));
    }

    if markdown_count > 0 {
        export_markdown(&root_path, rel_folder, &folder_name, &files, title, author)
    } else {
        export_fountain(&root_path, rel_folder, &files)
    }
}

fn resolve_folder(root: &Path, rel_folder: &str) -> Result<PathBuf, String> {
    let trimmed = rel_folder.trim();
    if trimmed.is_empty() || trimmed == "." {
        return Ok(root.to_path_buf());
    }
    let path = fs_ops::resolve_safe_relative(root, trimmed)?;
    let canonical = fs::canonicalize(&path)
        .map_err(|e| format!("Could not open the folder '{}': {}", rel_folder, e))?;
    if !canonical.starts_with(root) {
        return Err("The folder is outside the project".to_string());
    }
    if !canonical.is_dir() {
        return Err(format!("The path '{}' is not a folder", rel_folder));
    }
    Ok(canonical)
}

fn collect_files(folder: &Path) -> Result<Vec<CollectedFile>, String> {
    let mut files = Vec::new();
    collect_into(folder, folder, &mut files)?;
    files.sort_by(|a, b| natural_cmp(&a.relative, &b.relative));
    Ok(files)
}

fn collect_into(root: &Path, current: &Path, files: &mut Vec<CollectedFile>) -> Result<(), String> {
    let entries = fs::read_dir(current)
        .map_err(|e| format!("Could not read folder '{}': {}", current.display(), e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Could not read folder entry: {}", e))?;
        let file_type = entry
            .file_type()
            .map_err(|e| format!("Could not inspect '{}': {}", entry.path().display(), e))?;
        if file_type.is_symlink() {
            continue;
        }

        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || fs_ops::is_always_hidden(&name) || name == "exports" {
            continue;
        }

        let path = entry.path();
        if file_type.is_dir() {
            collect_into(root, &path, files)?;
            continue;
        }
        if !file_type.is_file() {
            continue;
        }

        let Some(format) = format_of(&path) else {
            continue;
        };
        let relative = path
            .strip_prefix(root)
            .map_err(|_| "The file is outside the selected folder".to_string())?
            .components()
            .map(|component| component.as_os_str().to_string_lossy())
            .collect::<Vec<_>>()
            .join("/");
        files.push(CollectedFile {
            relative,
            path,
            format,
        });
    }

    Ok(())
}

fn format_of(path: &Path) -> Option<Format> {
    let extension = path.extension()?.to_string_lossy().to_lowercase();
    match extension.as_str() {
        "md" | "markdown" | "mdx" => Some(Format::Markdown),
        "fountain" | "spmd" => Some(Format::Fountain),
        _ => None,
    }
}

fn export_markdown(
    root: &Path,
    rel_folder: &str,
    folder_name: &str,
    files: &[CollectedFile],
    title: &str,
    author: &str,
) -> Result<FolderPdfResult, String> {
    let mut chapters = Vec::new();
    for file in files {
        let content = fs::read_to_string(&file.path)
            .map_err(|e| format!("Could not read '{}': {}", file.relative, e))?;
        chapters.push((file.relative.clone(), content));
    }

    let title = if title.trim().is_empty() {
        book_title(root, rel_folder, folder_name)
    } else {
        title.trim().to_string()
    };
    let author = if author.trim().is_empty() {
        "Bradbit Writer"
    } else {
        author.trim()
    };
    let bytes = book_pdf::export(&chapters, &title, author)?;

    let output_rel = if rel_folder.trim().is_empty() || rel_folder.trim() == "." {
        Path::new("exports").join(format!("{}.pdf", folder_name))
    } else {
        Path::new("exports")
            .join(rel_folder.trim())
            .join(format!("{}.pdf", folder_name))
    };
    let output = fs_ops::resolve_safe_relative(root, &output_rel.to_string_lossy())?;
    write_atomic(&output, &bytes)?;

    Ok(FolderPdfResult {
        kind: "markdown".to_string(),
        outputs: vec![output.to_string_lossy().to_string()],
    })
}

fn export_fountain(
    root: &Path,
    rel_folder: &str,
    files: &[CollectedFile],
) -> Result<FolderPdfResult, String> {
    let mut outputs = Vec::new();
    for file in files {
        let content = fs::read_to_string(&file.path)
            .map_err(|e| format!("Could not read '{}': {}", file.relative, e))?;
        let stem = Path::new(&file.relative)
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("script");
        let bytes = fountain::pdf::export(&content, Some(stem));

        let relative = Path::new(&file.relative).with_extension("pdf");
        let output_rel = match rel_folder.trim() {
            "" | "." => Path::new("exports").join(relative),
            folder => Path::new("exports").join(folder).join(relative),
        };
        let output = fs_ops::resolve_safe_relative(root, &output_rel.to_string_lossy())?;
        write_atomic(&output, &bytes)?;
        outputs.push(output.to_string_lossy().to_string());
    }

    Ok(FolderPdfResult {
        kind: "fountain".to_string(),
        outputs,
    })
}

fn write_atomic(output: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Could not create the export folder: {}", e))?;
    }
    let temp = output.with_extension("pdf.tmp");
    fs::write(&temp, bytes).map_err(|e| format!("Could not write the PDF: {}", e))?;
    if let Err(err) = fs::rename(&temp, output) {
        let _ = fs::remove_file(&temp);
        return Err(format!("Could not save the PDF: {}", err));
    }
    Ok(())
}

fn book_title(root: &Path, rel_folder: &str, folder_name: &str) -> String {
    let generic = [
        "manuscript",
        "manuscrito",
        "book",
        "libro",
        "chapters",
        "capitulos",
        "text",
        "texto",
    ];
    let rel = rel_folder.trim().to_lowercase();
    let project_name = root
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| folder_name.to_string());
    let source =
        if rel.is_empty() || rel == "." || generic.contains(&folder_name.to_lowercase().as_str()) {
            project_name
        } else {
            folder_name.to_string()
        };
    prettify(&source)
}

fn prettify(name: &str) -> String {
    let words: Vec<String> = name
        .split(['-', '_'])
        .filter(|word| !word.is_empty())
        .map(|word| {
            let mut chars = word.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect();
    if words.is_empty() {
        "Book".to_string()
    } else {
        words.join(" ")
    }
}

/// Natural ordering: `2.md` comes before `10.md`.
fn natural_cmp(a: &str, b: &str) -> Ordering {
    let mut left = a.chars().peekable();
    let mut right = b.chars().peekable();
    loop {
        match (left.peek().copied(), right.peek().copied()) {
            (None, None) => return Ordering::Equal,
            (None, Some(_)) => return Ordering::Less,
            (Some(_), None) => return Ordering::Greater,
            (Some(l), Some(r)) if l.is_ascii_digit() && r.is_ascii_digit() => {
                let left_number = take_number(&mut left);
                let right_number = take_number(&mut right);
                match left_number.cmp(&right_number) {
                    Ordering::Equal => {}
                    other => return other,
                }
            }
            (Some(l), Some(r)) => {
                left.next();
                right.next();
                match l.to_ascii_lowercase().cmp(&r.to_ascii_lowercase()) {
                    Ordering::Equal => {}
                    other => return other,
                }
            }
        }
    }
}

fn take_number(chars: &mut std::iter::Peekable<std::str::Chars<'_>>) -> u128 {
    let mut value = 0u128;
    while let Some(char) = chars.peek().copied() {
        if !char.is_ascii_digit() {
            break;
        }
        value = value
            .saturating_mul(10)
            .saturating_add(u128::from(char as u8 - b'0'));
        chars.next();
    }
    value
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn write(path: &Path, content: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, content).unwrap();
    }

    #[test]
    fn exports_a_markdown_folder_as_one_book_pdf() {
        let dir = tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        let folder = dir.path().join("manuscript");
        write(&folder.join("10.md"), "# Ten\n\nThe last chapter.");
        write(&folder.join("2.md"), "# Two\n\nThe second chapter.");
        write(&folder.join("notes.txt"), "ignored");

        let result = export_to_project(root, "manuscript", "The House of Tides", "Rafael")
            .expect("markdown folder export");

        assert_eq!(result.kind, "markdown");
        assert_eq!(result.outputs.len(), 1);
        let output = Path::new(&result.outputs[0]);
        assert!(output.starts_with(fs::canonicalize(dir.path()).unwrap()));
        assert!(output.ends_with("exports/manuscript/manuscript.pdf"));

        let bytes = fs::read(output).unwrap();
        assert!(bytes.starts_with(b"%PDF-"));
        let text = String::from_utf8_lossy(&bytes);
        assert!(text.contains("The House of Tides"));
        assert!(text.contains("The second chapter."));
        assert!(text.contains("The last chapter."));
        let two = text.find("The second chapter.").unwrap();
        let ten = text.find("The last chapter.").unwrap();
        assert!(two < ten, "2.md must come before 10.md");
    }

    #[test]
    fn exports_a_fountain_folder_as_one_pdf_per_script() {
        let dir = tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        let folder = dir.path().join("script");
        write(
            &folder.join("episode-1.fountain"),
            "Title: Episode One\n\nINT. HOUSE - DAY\n\nANA\nHola.",
        );
        write(
            &folder.join("extras/episode-2.spmd"),
            "Title: Episode Two\n\nEXT. STREET - NIGHT\n\nLUIS\nAdios.",
        );

        let result =
            export_to_project(root, "script", "", "Rafael").expect("fountain folder export");

        assert_eq!(result.kind, "fountain");
        assert_eq!(result.outputs.len(), 2);
        assert!(result.outputs[0].ends_with("exports/script/episode-1.pdf"));
        assert!(result.outputs[1].ends_with("exports/script/extras/episode-2.pdf"));
        for output in &result.outputs {
            let bytes = fs::read(output).unwrap();
            assert!(bytes.starts_with(b"%PDF-"));
        }
        let first = String::from_utf8_lossy(&fs::read(&result.outputs[0]).unwrap()).to_string();
        assert!(first.contains("EPISODE ONE"));
    }

    #[test]
    fn rejects_empty_mixed_and_unsafe_folders() {
        let dir = tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        fs::create_dir_all(dir.path().join("empty")).unwrap();
        write(&dir.path().join("mixed/a.md"), "# A");
        write(&dir.path().join("mixed/b.fountain"), "INT. A - DAY");

        assert!(export_to_project(root, "empty", "", "").is_err());
        let mixed = export_to_project(root, "mixed", "", "").unwrap_err();
        assert!(mixed.contains("mixes 1 Markdown and 1 Fountain"));
        assert!(export_to_project(root, "../outside", "", "").is_err());
    }

    #[test]
    fn derives_a_project_title_for_generic_manuscript_folders() {
        let dir = tempdir().unwrap();
        let root = dir.path().join("my-novel");
        fs::create_dir_all(root.join("manuscript")).unwrap();
        fs::write(root.join("manuscript/01.md"), "# One\n\nText.").unwrap();

        let result = export_to_project(root.to_str().unwrap(), "manuscript", "", "Rafael").unwrap();
        let text = String::from_utf8_lossy(&fs::read(&result.outputs[0]).unwrap()).to_string();
        assert!(text.contains("My Novel"));
    }

    #[test]
    fn natural_order_handles_embedded_numbers() {
        assert_eq!(natural_cmp("2.md", "10.md"), Ordering::Less);
        assert_eq!(natural_cmp("Chapter 2.md", "chapter 10.md"), Ordering::Less);
        assert_eq!(natural_cmp("a.md", "A.md"), Ordering::Equal);
    }
}
