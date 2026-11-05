use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Component, Path, PathBuf};

const MAX_TREE_DEPTH: usize = 8;
const MAX_FILE_BYTES: u64 = 10 * 1024 * 1024; // 10 MiB

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileTreeNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_config: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileTreeNode>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedFolder {
    pub root_path: String,
    pub name: String,
    pub tree: Vec<FileTreeNode>,
}

pub fn is_always_hidden(name: &str) -> bool {
    matches!(name, ".git" | ".DS_Store" | "node_modules" | "target")
}

pub fn is_config_entry(name: &str) -> bool {
    matches!(
        name,
        ".opencode" | ".bradbit" | ".narra" | ".gitignore" | "AGENTS.md" | "CLAUDE.md"
    ) || (name.starts_with('.') && !is_always_hidden(name))
}

fn canonical_root(root: &str) -> Result<PathBuf, String> {
    let path = Path::new(root);
    let canon = fs::canonicalize(path)
        .map_err(|e| format!("No se pudo abrir la carpeta '{}': {}", root, e))?;
    if !canon.is_dir() {
        return Err(format!("La ruta '{}' no es una carpeta", root));
    }
    Ok(canon)
}

/// Validates a project-relative path and prevents path traversal (`..`, absolute paths, root escape).
pub fn resolve_safe_relative(root: &Path, rel_path: &str) -> Result<PathBuf, String> {
    let trimmed = rel_path.trim();
    if trimmed.starts_with('/') || Path::new(trimmed).is_absolute() {
        return Err("No se permiten rutas absolutas".to_string());
    }
    let trimmed = trimmed.trim_matches('/');
    if trimmed.is_empty() {
        return Err("La ruta relativa no puede estar vacía".to_string());
    }
    let rel = Path::new(trimmed);
    for comp in rel.components() {
        match comp {
            Component::Normal(os) => {
                let s = os.to_string_lossy();
                if s == ".git" || s == ".DS_Store" {
                    return Err(format!("Ruta reservada no permitida: {}", s));
                }
            }
            _ => return Err("Ruta relativa inválida (contiene '..' o prefijos)".to_string()),
        }
    }
    Ok(root.join(rel))
}

pub fn open_folder(path: &str, show_config: bool) -> Result<OpenedFolder, String> {
    let canon = canonical_root(path)?;
    let name = canon
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "proyecto".to_string());
    let root_str = canon.to_string_lossy().to_string();
    let tree = build_tree(&canon, &canon, show_config, 0)?;
    Ok(OpenedFolder {
        root_path: root_str,
        name,
        tree,
    })
}

pub fn list_directory_tree(root: &str, show_config: bool) -> Result<Vec<FileTreeNode>, String> {
    let canon = canonical_root(root)?;
    build_tree(&canon, &canon, show_config, 0)
}

fn build_tree(
    root: &Path,
    current: &Path,
    show_config: bool,
    depth: usize,
) -> Result<Vec<FileTreeNode>, String> {
    if depth > MAX_TREE_DEPTH {
        return Ok(Vec::new());
    }
    let read_dir = fs::read_dir(current)
        .map_err(|e| format!("Error leyendo directorio '{}': {}", current.display(), e))?;

    let mut nodes = Vec::new();
    for entry_res in read_dir {
        let entry = match entry_res {
            Ok(e) => e,
            Err(_) => continue,
        };
        let file_type = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };
        if file_type.is_symlink() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if is_always_hidden(&name) {
            continue;
        }
        let is_cfg = is_config_entry(&name);
        if !show_config && is_cfg {
            continue;
        }

        let full_path = entry.path();
        let rel = full_path
            .strip_prefix(root)
            .map_err(|_| "Ruta fuera del proyecto".to_string())?;
        let rel_str = rel
            .components()
            .map(|c| c.as_os_str().to_string_lossy())
            .collect::<Vec<_>>()
            .join("/");

        if file_type.is_dir() {
            let children = build_tree(root, &full_path, show_config, depth + 1)?;
            nodes.push(FileTreeNode {
                name,
                path: rel_str,
                is_dir: true,
                is_config: is_cfg,
                children: Some(children),
            });
        } else if file_type.is_file() {
            nodes.push(FileTreeNode {
                name,
                path: rel_str,
                is_dir: false,
                is_config: is_cfg,
                children: None,
            });
        }
    }

    nodes.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(nodes)
}

pub fn read_text_file(root: &str, rel_path: &str) -> Result<String, String> {
    let canon_root = canonical_root(root)?;
    let target = resolve_safe_relative(&canon_root, rel_path)?;
    let meta = fs::symlink_metadata(&target)
        .map_err(|e| format!("No se pudo leer '{}': {}", rel_path, e))?;
    if meta.file_type().is_symlink() {
        return Err("No se permiten enlaces simbólicos".to_string());
    }
    if !meta.is_file() {
        return Err(format!("'{}' no es un archivo regular", rel_path));
    }
    if meta.len() > MAX_FILE_BYTES {
        return Err(format!(
            "El archivo '{}' excede el límite de 10 MB",
            rel_path
        ));
    }
    fs::read_to_string(&target)
        .map_err(|e| format!("El archivo '{}' no es texto UTF-8 válido: {}", rel_path, e))
}

/// Writes a text file atomically via a temporary sibling file.
pub fn write_text_file(root: &str, rel_path: &str, content: &str) -> Result<(), String> {
    let canon_root = canonical_root(root)?;
    let target = resolve_safe_relative(&canon_root, rel_path)?;
    if let Ok(meta) = fs::symlink_metadata(&target) {
        if meta.file_type().is_symlink() {
            return Err("No se puede escribir sobre un enlace simbólico".to_string());
        }
    }
    let parent = target
        .parent()
        .ok_or_else(|| "Ruta sin carpeta contenedora".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|e| format!("No se pudo crear carpeta contenedora: {}", e))?;

    let file_name = target
        .file_name()
        .ok_or_else(|| "Nombre de archivo inválido".to_string())?
        .to_string_lossy();
    let tmp_path = parent.join(format!(".{}.bradbit-tmp", file_name));

    {
        let mut tmp_file = fs::File::create(&tmp_path)
            .map_err(|e| format!("No se pudo crear archivo temporal: {}", e))?;
        tmp_file
            .write_all(content.as_bytes())
            .map_err(|e| format!("Error escribiendo contenido: {}", e))?;
        tmp_file
            .sync_all()
            .map_err(|e| format!("Error sincronizando archivo en disco: {}", e))?;
    }

    fs::rename(&tmp_path, &target).map_err(|e| {
        let _ = fs::remove_file(&tmp_path);
        format!("No se pudo guardar '{}': {}", rel_path, e)
    })
}

pub fn create_entry(root: &str, rel_path: &str, is_dir: bool) -> Result<(), String> {
    let canon_root = canonical_root(root)?;
    let target = resolve_safe_relative(&canon_root, rel_path)?;
    if target.exists() {
        return Err(format!("Ya existe '{}'", rel_path));
    }
    if is_dir {
        fs::create_dir_all(&target)
            .map_err(|e| format!("No se pudo crear la carpeta '{}': {}", rel_path, e))
    } else {
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("No se pudo crear la carpeta padre: {}", e))?;
        }
        OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&target)
            .map(|_| ())
            .map_err(|e| format!("No se pudo crear el archivo '{}': {}", rel_path, e))
    }
}

pub fn rename_entry(root: &str, old_rel_path: &str, new_rel_path: &str) -> Result<(), String> {
    let canon_root = canonical_root(root)?;
    let old_target = resolve_safe_relative(&canon_root, old_rel_path)?;
    let new_target = resolve_safe_relative(&canon_root, new_rel_path)?;
    if !old_target.exists() {
        return Err(format!("No existe '{}'", old_rel_path));
    }
    if new_target.exists() {
        return Err(format!("Ya existe un elemento en '{}'", new_rel_path));
    }
    if let Some(parent) = new_target.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("No se pudo crear la carpeta destino: {}", e))?;
    }
    fs::rename(&old_target, &new_target)
        .map_err(|e| format!("No se pudo renombrar '{}': {}", old_rel_path, e))
}

pub fn delete_entry(root: &str, rel_path: &str) -> Result<(), String> {
    let canon_root = canonical_root(root)?;
    let target = resolve_safe_relative(&canon_root, rel_path)?;
    let meta =
        fs::symlink_metadata(&target).map_err(|e| format!("No existe '{}': {}", rel_path, e))?;
    if meta.is_dir() {
        fs::remove_dir_all(&target)
            .map_err(|e| format!("No se pudo eliminar la carpeta '{}': {}", rel_path, e))
    } else {
        fs::remove_file(&target)
            .map_err(|e| format!("No se pudo eliminar el archivo '{}': {}", rel_path, e))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn opens_any_folder_without_manifest_and_filters_config_files() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        fs::create_dir_all(root.join(".git")).unwrap();
        fs::create_dir_all(root.join(".opencode/agents")).unwrap();
        fs::create_dir_all(root.join("biblia")).unwrap();
        fs::write(root.join("AGENTS.md"), "# Reglas").unwrap();
        fs::write(root.join("biblia/premisa.md"), "# Premisa").unwrap();

        let opened_default = open_folder(root.to_str().unwrap(), false).unwrap();
        assert_eq!(opened_default.tree.len(), 1);
        assert_eq!(opened_default.tree[0].name, "biblia");

        let opened_with_cfg = open_folder(root.to_str().unwrap(), true).unwrap();
        let names: Vec<_> = opened_with_cfg
            .tree
            .iter()
            .map(|n| n.name.as_str())
            .collect();
        assert_eq!(names, vec![".opencode", "biblia", "AGENTS.md"]);
    }

    #[test]
    fn rejects_path_traversal_and_reserved_paths() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        assert!(resolve_safe_relative(root, "../secret.txt").is_err());
        assert!(resolve_safe_relative(root, "/etc/passwd").is_err());
        assert!(resolve_safe_relative(root, ".git/config").is_err());
    }

    #[test]
    fn create_write_read_rename_and_delete_round_trip() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path().to_str().unwrap();

        create_entry(root, "guion/escena-1.fountain", false).unwrap();
        assert!(create_entry(root, "guion/escena-1.fountain", false).is_err());

        write_text_file(root, "guion/escena-1.fountain", "INT. OFICINA - DÍA\n").unwrap();
        let text = read_text_file(root, "guion/escena-1.fountain").unwrap();
        assert_eq!(text, "INT. OFICINA - DÍA\n");

        rename_entry(root, "guion/escena-1.fountain", "guion/acto-1.fountain").unwrap();
        assert_eq!(
            read_text_file(root, "guion/acto-1.fountain").unwrap(),
            "INT. OFICINA - DÍA\n"
        );

        delete_entry(root, "guion/acto-1.fountain").unwrap();
        assert!(read_text_file(root, "guion/acto-1.fountain").is_err());
    }
}
