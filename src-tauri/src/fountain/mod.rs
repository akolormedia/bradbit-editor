use crate::fs_ops;
use std::fs;
use std::path::Path;

pub mod parser;
pub mod pdf;

pub use parser::{parse, Element, ElementKind};
pub use pdf::{export, layout, write_pdf, Layout, Page};

/// Generates a deterministic PDF for a Fountain file and writes it into
/// `<project>/exports/<relative-folder>/<stem>.pdf`.
pub fn export_to_project(root: &str, rel_path: &str, content: &str) -> Result<String, String> {
    let lower = rel_path.to_lowercase();
    if !lower.ends_with(".fountain") && !lower.ends_with(".spmd") {
        return Err("PDF export is only available for Fountain files".to_string());
    }

    let root_path = fs::canonicalize(root)
        .map_err(|e| format!("No se pudo abrir la carpeta '{}': {}", root, e))?;
    if !root_path.is_dir() {
        return Err(format!("La ruta '{}' no es una carpeta", root));
    }

    // Validate the source path even though we only need its name: this keeps
    // the command safe against traversal attempts from the frontend.
    fs_ops::resolve_safe_relative(&root_path, rel_path)?;

    let rel = Path::new(rel_path);
    let stem = rel
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Invalid file name".to_string())?;
    let parent = rel.parent().filter(|path| !path.as_os_str().is_empty());
    let output_rel = match parent {
        Some(parent) => Path::new("exports")
            .join(parent)
            .join(format!("{stem}.pdf")),
        None => Path::new("exports").join(format!("{stem}.pdf")),
    };
    let output = fs_ops::resolve_safe_relative(&root_path, &output_rel.to_string_lossy())?;
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Could not create the export folder: {}", e))?;
    }

    let bytes = pdf::export(content, Some(stem));
    let temp = output.with_extension("pdf.tmp");
    fs::write(&temp, &bytes).map_err(|e| format!("No se pudo escribir el PDF: {}", e))?;
    if let Err(err) = fs::rename(&temp, &output) {
        let _ = fs::remove_file(&temp);
        return Err(format!("No se pudo guardar el PDF: {}", err));
    }
    Ok(output.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn exports_pdf_into_exports_and_is_deterministic() {
        let dir = tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        let source = "Title: Demo\n\nINT. HOUSE - DAY\n\nANA\nHola, mundo.\n";
        fs::create_dir_all(dir.path().join("guion")).unwrap();
        fs::write(dir.path().join("guion/acto-1.fountain"), source).unwrap();

        let output = export_to_project(root, "guion/acto-1.fountain", source).unwrap();
        let canonical_root = fs::canonicalize(dir.path()).unwrap();
        let output_path = Path::new(&output);
        assert!(output_path.starts_with(canonical_root.join("exports/guion")));

        let first = fs::read(output_path).unwrap();
        assert!(first.starts_with(b"%PDF-"));
        assert!(first.windows(5).any(|window| window == b"%%EOF"));
        assert!(first.windows(4).any(|window| window == b"DEMO"));

        let second_path = export_to_project(root, "guion/acto-1.fountain", source).unwrap();
        assert_eq!(fs::read(second_path).unwrap(), first);
    }

    #[test]
    fn rejects_non_fountain_and_traversal_paths() {
        let dir = tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        assert!(export_to_project(root, "biblia/premisa.md", "# Premisa").is_err());
        assert!(export_to_project(root, "../fuera.fountain", "INT. X").is_err());
        assert!(export_to_project(root, "/tmp/fuera.fountain", "INT. X").is_err());
    }
}
