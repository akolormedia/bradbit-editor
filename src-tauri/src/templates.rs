use include_dir::{include_dir, Dir, DirEntry};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};

static BUILTIN_TEMPLATES: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/resources/templates");

const SCREENWRITER_KIT_ID: &str = "guionista-kit";
const CAMPAIGN_KIT_ID: &str = "campaign-kit";
const LIBRO_KIT_ID: &str = "libro-kit";
const BLANK_ID: &str = "blank";
const BUILTIN_KITS: &[(&str, &str, &str)] = &[
    (
        SCREENWRITER_KIT_ID,
        "Screenwriting (guionista-kit)",
        "Film, series and microdrama writing with a story bible.",
    ),
    (
        CAMPAIGN_KIT_ID,
        "Advertising campaigns (campaign-kit)",
        "Client folders, briefs, strategy, creative and approvals.",
    ),
    (
        LIBRO_KIT_ID,
        "Novel (libro-kit)",
        "Novel writing with bible, structure, manuscript, research, revision and pitch.",
    ),
];
const RESERVED_TEMPLATE_NAMES: &[&str] =
    &[SCREENWRITER_KIT_ID, CAMPAIGN_KIT_ID, LIBRO_KIT_ID, BLANK_ID];
const SKIPPED_NAMES: &[&str] = &[".git", ".DS_Store", "node_modules", "target", "exports"];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TemplateInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    /// `bundled`, `blank` or `user`.
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CreatedProject {
    pub path: String,
    pub name: String,
    pub git_initialized: bool,
}

#[derive(Debug, Default, Deserialize)]
struct TemplateMeta {
    name: Option<String>,
    description: Option<String>,
}

/// Built-in writing kits plus user templates found under
/// `~/Library/Application Support/Bradbit/templates/`.
pub fn list_templates() -> Result<Vec<TemplateInfo>, String> {
    let user_dir = user_templates_dir()?;
    list_templates_in(&user_dir)
}

pub fn list_templates_in(user_dir: &Path) -> Result<Vec<TemplateInfo>, String> {
    let mut templates = BUILTIN_KITS
        .iter()
        .map(|(id, name, description)| TemplateInfo {
            id: (*id).to_string(),
            name: (*name).to_string(),
            description: (*description).to_string(),
            source: "bundled".to_string(),
            path: None,
        })
        .collect::<Vec<_>>();
    templates.push(TemplateInfo {
        id: BLANK_ID.to_string(),
        name: "Blank project".to_string(),
        description: "A clean folder to write freely.".to_string(),
        source: "blank".to_string(),
        path: None,
    });

    if user_dir.exists() {
        let mut user_templates = Vec::new();
        let entries = fs::read_dir(user_dir)
            .map_err(|e| format!("Error leyendo las plantillas de usuario: {}", e))?;
        for entry in entries.flatten() {
            let file_type = match entry.file_type() {
                Ok(value) => value,
                Err(_) => continue,
            };
            if !file_type.is_dir() || file_type.is_symlink() {
                continue;
            }
            let id = entry.file_name().to_string_lossy().to_string();
            if RESERVED_TEMPLATE_NAMES.contains(&id.as_str()) {
                continue;
            }
            user_templates.push(read_user_template(&entry.path(), &id));
        }
        user_templates.sort_by_key(|template| template.name.to_lowercase());
        templates.extend(user_templates);
    }

    Ok(templates)
}

pub fn user_templates_dir() -> Result<PathBuf, String> {
    let dir = crate::settings::config_dir()?.join("templates");
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Could not create the templates folder: {}", e))?;
    Ok(dir)
}

/// Creates `<destination>/<name>` from a bundled, blank or user template.
pub fn create_project_from_template(
    template_id: &str,
    name: &str,
    destination: &str,
) -> Result<CreatedProject, String> {
    let user_dir = user_templates_dir()?;
    create_project_from_template_in(template_id, name, destination, &user_dir)
}

pub fn create_project_from_template_in(
    template_id: &str,
    name: &str,
    destination: &str,
    user_dir: &Path,
) -> Result<CreatedProject, String> {
    let name = validate_project_name(name)?;
    let destination = canonical_directory(destination)?;
    let project_path = destination.join(&name);
    if project_path.exists() {
        return Err(format!(
            "A folder named '{}' already exists in the destination",
            name
        ));
    }

    let temp = temp_path(&destination, &name);
    let result = (|| -> Result<(), String> {
        match template_id {
            BLANK_ID => {
                fs::create_dir_all(&temp)
                    .map_err(|e| format!("Could not create the project: {}", e))?;
            }
            other if BUILTIN_KITS.iter().any(|(id, _, _)| *id == other) => {
                let template = BUILTIN_TEMPLATES.get_dir(other).ok_or_else(|| {
                    format!("The {other} template is not available in this build")
                })?;
                copy_embedded_dir(template, &temp)?;
            }
            other => {
                let template = list_templates_in(user_dir)?
                    .into_iter()
                    .find(|template| template.id == other && template.source == "user")
                    .ok_or_else(|| format!("Template '{}' not found", other))?;
                let source = template
                    .path
                    .ok_or_else(|| "The user template has no valid path".to_string())?;
                copy_directory(Path::new(&source), &temp)?;
            }
        }
        fs::rename(&temp, &project_path)
            .map_err(|e| format!("Could not finalize the project: {}", e))
    })();

    if let Err(error) = result {
        let _ = fs::remove_dir_all(&temp);
        return Err(error);
    }

    let git_initialized = try_git_init(&project_path);
    Ok(CreatedProject {
        path: project_path.to_string_lossy().to_string(),
        name,
        git_initialized,
    })
}

/// Copies a project folder into the user templates directory.
pub fn save_folder_as_template(folder_path: &str, name: &str) -> Result<TemplateInfo, String> {
    let user_dir = user_templates_dir()?;
    save_folder_as_template_in(folder_path, name, &user_dir)
}

pub fn save_folder_as_template_in(
    folder_path: &str,
    name: &str,
    user_dir: &Path,
) -> Result<TemplateInfo, String> {
    let source = canonical_directory(folder_path)?;
    let name = validate_template_name(name)?;
    fs::create_dir_all(user_dir)
        .map_err(|e| format!("Could not create the templates folder: {}", e))?;
    let destination = user_dir.join(&name);
    if destination.exists() {
        return Err(format!("A template named '{}' already exists", name));
    }
    let user_canon = fs::canonicalize(user_dir).unwrap_or_else(|_| user_dir.to_path_buf());
    if user_canon.starts_with(&source) {
        return Err("The templates folder cannot be saved as a template".to_string());
    }

    let temp = temp_path(user_dir, &name);
    let result = (|| -> Result<(), String> {
        copy_directory(&source, &temp)?;
        let meta_path = temp.join("template.json");
        if !meta_path.exists() {
            let source_name = source
                .file_name()
                .map(|value| value.to_string_lossy().to_string())
                .unwrap_or_else(|| "proyecto".to_string());
            let meta = serde_json::json!({
                "name": name,
                "description": format!("Plantilla guardada desde «{}»", source_name),
            });
            fs::write(
                &meta_path,
                serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?,
            )
            .map_err(|e| format!("Could not write template.json: {}", e))?;
        }
        fs::rename(&temp, &destination)
            .map_err(|e| format!("Could not finalize the template: {}", e))
    })();

    if let Err(error) = result {
        let _ = fs::remove_dir_all(&temp);
        return Err(error);
    }
    Ok(read_user_template(&destination, &name))
}

fn read_user_template(path: &Path, id: &str) -> TemplateInfo {
    let meta = fs::read_to_string(path.join("template.json"))
        .ok()
        .and_then(|raw| serde_json::from_str::<TemplateMeta>(&raw).ok())
        .unwrap_or_default();
    let readme_line = fs::read_to_string(path.join("README.md"))
        .ok()
        .and_then(|text| {
            text.lines()
                .map(str::trim)
                .find(|line| !line.is_empty())
                .map(|line| line.trim_start_matches('#').trim().to_string())
        });

    TemplateInfo {
        id: id.to_string(),
        name: meta
            .name
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| id.to_string()),
        description: meta
            .description
            .filter(|value| !value.trim().is_empty())
            .or(readme_line)
            .unwrap_or_else(|| "Plantilla de usuario".to_string()),
        source: "user".to_string(),
        path: Some(path.to_string_lossy().to_string()),
    }
}

fn copy_embedded_dir(source: &Dir<'_>, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination)
        .map_err(|e| format!("Could not create '{}': {}", destination.display(), e))?;
    for entry in source.entries() {
        let relative = entry
            .path()
            .strip_prefix(source.path())
            .map_err(|e| format!("Invalid template path: {}", e))?;
        let name = relative
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("");
        if SKIPPED_NAMES.contains(&name) {
            continue;
        }
        match entry {
            DirEntry::Dir(directory) => {
                copy_embedded_dir(directory, &destination.join(relative))?;
            }
            DirEntry::File(file) => {
                let target = destination.join(relative);
                if let Some(parent) = target.parent() {
                    fs::create_dir_all(parent)
                        .map_err(|e| format!("Could not create '{}': {}", parent.display(), e))?;
                }
                fs::write(&target, file.contents())
                    .map_err(|e| format!("Could not write '{}': {}", target.display(), e))?;
            }
        }
    }
    Ok(())
}

fn copy_directory(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination)
        .map_err(|e| format!("Could not create '{}': {}", destination.display(), e))?;
    let entries = fs::read_dir(source)
        .map_err(|e| format!("Could not read '{}': {}", source.display(), e))?;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if SKIPPED_NAMES.contains(&name.as_str()) {
            continue;
        }
        let file_type = match entry.file_type() {
            Ok(value) => value,
            Err(_) => continue,
        };
        if file_type.is_symlink() {
            continue;
        }
        let target = destination.join(&name);
        if file_type.is_dir() {
            copy_directory(&entry.path(), &target)?;
        } else if file_type.is_file() {
            fs::copy(entry.path(), &target)
                .map_err(|e| format!("Could not copy '{}': {}", name, e))?;
        }
    }
    Ok(())
}

fn try_git_init(path: &Path) -> bool {
    Command::new("git")
        .arg("init")
        .current_dir(path)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn canonical_directory(path: &str) -> Result<PathBuf, String> {
    let canonical = fs::canonicalize(path)
        .map_err(|e| format!("Could not open the folder '{}': {}", path, e))?;
    if !canonical.is_dir() {
        return Err(format!("The path '{}' is not a folder", path));
    }
    Ok(canonical)
}

fn validate_project_name(name: &str) -> Result<String, String> {
    validate_name(name, "El nombre del proyecto")
}

fn validate_template_name(name: &str) -> Result<String, String> {
    let value = validate_name(name, "El nombre de la plantilla")?;
    if RESERVED_TEMPLATE_NAMES.contains(&value.as_str()) {
        return Err(format!("'{}' es un nombre reservado", value));
    }
    Ok(value)
}

fn validate_name(name: &str, label: &str) -> Result<String, String> {
    let value = name.trim();
    if value.is_empty() {
        return Err(format!("{} cannot be empty", label));
    }
    if value == "." || value == ".." || value.starts_with('.') {
        return Err(format!("{} cannot start with a dot", label));
    }
    if value.chars().count() > 120 {
        return Err(format!("{} es demasiado largo", label));
    }
    if value
        .chars()
        .any(|c| c == '/' || c == '\\' || c == ':' || c == '\0' || c.is_control())
    {
        return Err(format!("{} contiene caracteres no permitidos", label));
    }
    Ok(value.to_string())
}

fn temp_path(parent: &Path, name: &str) -> PathBuf {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    parent.join(format!(".{}.tmp-{}", name, stamp))
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
    fn lists_builtin_and_user_templates_with_metadata() {
        let dir = tempdir().unwrap();
        let user_dir = dir.path().join("templates");
        write(&user_dir.join("mi-plantilla/README.md"), "# Mi plantilla\n");
        write(
            &user_dir.join("con-meta/template.json"),
            r#"{"name":"With metadata","description":"A description"}"#,
        );

        let templates = list_templates_in(&user_dir).unwrap();
        assert_eq!(templates[0].id, SCREENWRITER_KIT_ID);
        assert_eq!(templates[0].source, "bundled");
        assert_eq!(templates[1].id, CAMPAIGN_KIT_ID);
        assert_eq!(templates[1].source, "bundled");
        assert_eq!(templates[2].id, LIBRO_KIT_ID);
        assert_eq!(templates[2].source, "bundled");
        assert_eq!(templates[3].id, BLANK_ID);
        assert_eq!(templates[3].source, "blank");
        assert!(templates.iter().any(|item| item.id == "mi-plantilla"
            && item.name == "mi-plantilla"
            && item.description == "Mi plantilla"));
        assert!(templates.iter().any(|item| item.id == "con-meta"
            && item.name == "With metadata"
            && item.description == "A description"));
    }

    #[test]
    fn bundled_template_contains_the_kit() {
        fn count_files(directory: &Dir<'_>) -> usize {
            directory
                .entries()
                .iter()
                .map(|entry| match entry {
                    DirEntry::Dir(subdirectory) => count_files(subdirectory),
                    DirEntry::File(_) => 1,
                })
                .sum()
        }

        for (id, _, _) in BUILTIN_KITS {
            let template = BUILTIN_TEMPLATES.get_dir(id).unwrap();
            let files = count_files(template);
            assert!(files >= 30, "only {files} bundled files in {id}");
            assert!(
                template.get_file(format!("{id}/AGENTS.md")).is_some(),
                "{id} has no AGENTS.md"
            );
            assert!(
                template
                    .get_file(format!("{id}/bradbit-kit.json"))
                    .is_some(),
                "{id} has no bradbit-kit.json"
            );
        }
        assert!(BUILTIN_TEMPLATES
            .get_file("guionista-kit/.bradbit/agents/screenwriter.md")
            .is_some());
        assert!(BUILTIN_TEMPLATES
            .get_file("campaign-kit/.bradbit/agents/strategist.md")
            .is_some());
        assert!(BUILTIN_TEMPLATES
            .get_file("libro-kit/.bradbit/agents/novelist.md")
            .is_some());
    }

    #[test]
    fn creates_a_blank_project_and_initializes_git_when_available() {
        let dir = tempdir().unwrap();
        let user_dir = dir.path().join("templates");
        let destination = dir.path().join("projects");
        fs::create_dir_all(&destination).unwrap();

        let created = create_project_from_template_in(
            BLANK_ID,
            "Mi Proyecto",
            destination.to_str().unwrap(),
            &user_dir,
        )
        .unwrap();
        let project = Path::new(&created.path);
        assert!(project.is_dir());
        assert_eq!(created.name, "Mi Proyecto");
        assert_eq!(
            created.git_initialized,
            Command::new("git").arg("--version").output().is_ok()
        );
        if created.git_initialized {
            assert!(project.join(".git").is_dir());
        }
    }

    #[test]
    fn creates_a_guionista_kit_project_with_the_expected_files() {
        let dir = tempdir().unwrap();
        let destination = dir.path().join("projects");
        fs::create_dir_all(&destination).unwrap();
        let created = create_project_from_template_in(
            SCREENWRITER_KIT_ID,
            "Guion Nuevo",
            destination.to_str().unwrap(),
            &dir.path().join("templates"),
        )
        .unwrap();
        let project = Path::new(&created.path);
        assert!(project.join("AGENTS.md").is_file());
        assert!(project.join("bible/premise.md").is_file());
        assert!(project.join(".bradbit/agents/screenwriter.md").is_file());
        assert!(project
            .join(".bradbit/skills/write-scene/SKILL.md")
            .is_file());
        assert!(!project.join("exports").exists());
    }

    #[test]
    fn creates_a_campaign_kit_project_with_the_expected_files() {
        let dir = tempdir().unwrap();
        let destination = dir.path().join("projects");
        fs::create_dir_all(&destination).unwrap();
        let created = create_project_from_template_in(
            CAMPAIGN_KIT_ID,
            "Campaña Nueva",
            destination.to_str().unwrap(),
            &dir.path().join("templates"),
        )
        .unwrap();
        let project = Path::new(&created.path);
        assert!(project.join("AGENTS.md").is_file());
        assert!(project.join(".bradbit/agents/strategist.md").is_file());
        assert!(project.join("clients/_template/client.md").is_file());
        assert!(project.join("campaigns/_template/brief.md").is_file());
        assert!(project.join("library/channel-specs/social.md").is_file());
        assert!(!project.join("exports").exists());
    }

    #[test]
    fn creates_a_libro_kit_project_with_the_expected_files() {
        let dir = tempdir().unwrap();
        let destination = dir.path().join("projects");
        fs::create_dir_all(&destination).unwrap();
        let created = create_project_from_template_in(
            LIBRO_KIT_ID,
            "Novela Nueva",
            destination.to_str().unwrap(),
            &dir.path().join("templates"),
        )
        .unwrap();
        let project = Path::new(&created.path);
        assert!(project.join("AGENTS.md").is_file());
        assert!(project.join(".bradbit/agents/novelist.md").is_file());
        assert!(project.join("bible/premise.md").is_file());
        assert!(project.join("structure/outline.md").is_file());
        assert!(project.join("manuscript/title-page.md").is_file());
        assert!(project.join("pitch/synopsis.md").is_file());
        assert!(!project.join("exports").exists());
    }

    #[test]
    fn creates_a_project_from_a_user_template_without_technical_folders() {
        let dir = tempdir().unwrap();
        let user_dir = dir.path().join("templates");
        let source = user_dir.join("mi-plantilla");
        write(&source.join("README.md"), "# Mi plantilla\n");
        write(&source.join("bible/premise.md"), "# Premisa\n");
        write(&source.join(".git/from-template"), "no copiar\n");
        write(&source.join("exports/test.pdf"), "no copiar\n");
        let destination = dir.path().join("projects");
        fs::create_dir_all(&destination).unwrap();

        let created = create_project_from_template_in(
            "mi-plantilla",
            "Proyecto desde plantilla",
            destination.to_str().unwrap(),
            &user_dir,
        )
        .unwrap();
        let project = Path::new(&created.path);
        assert!(project.join("README.md").is_file());
        assert!(project.join("bible/premise.md").is_file());
        assert!(!project.join("exports").exists());
        assert!(!project.join(".git/from-template").exists());
    }

    #[test]
    fn saves_a_project_as_a_user_template_and_lists_it() {
        let dir = tempdir().unwrap();
        let user_dir = dir.path().join("templates");
        let source = dir.path().join("proyecto");
        write(&source.join("bible/premise.md"), "# Premisa\n");
        write(&source.join(".git/config"), "no copiar\n");
        write(&source.join("exports/out.pdf"), "no copiar\n");

        let saved = save_folder_as_template_in(source.to_str().unwrap(), "Mi plantilla", &user_dir)
            .unwrap();
        assert_eq!(saved.name, "Mi plantilla");
        assert_eq!(saved.source, "user");
        let template = user_dir.join("Mi plantilla");
        assert!(template.join("bible/premise.md").is_file());
        assert!(!template.join(".git").exists());
        assert!(!template.join("exports").exists());
        let meta: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(template.join("template.json")).unwrap())
                .unwrap();
        assert_eq!(meta["name"], "Mi plantilla");

        let templates = list_templates_in(&user_dir).unwrap();
        assert!(templates.iter().any(|item| item.id == "Mi plantilla"));
    }

    #[test]
    fn rejects_invalid_names_existing_destinations_and_missing_templates() {
        let dir = tempdir().unwrap();
        let destination = dir.path().join("projects");
        fs::create_dir_all(&destination).unwrap();
        let user_dir = dir.path().join("templates");

        for invalid in ["", "   ", "../fuera", "con/barra", ".oculto", "con:dos"] {
            assert!(
                create_project_from_template_in(
                    BLANK_ID,
                    invalid,
                    destination.to_str().unwrap(),
                    &user_dir
                )
                .is_err(),
                "accepted invalid name {invalid:?}"
            );
        }

        fs::create_dir_all(destination.join("existente")).unwrap();
        assert!(create_project_from_template_in(
            BLANK_ID,
            "existente",
            destination.to_str().unwrap(),
            &user_dir
        )
        .is_err());
        assert!(create_project_from_template_in(
            "no-existe",
            "Proyecto",
            destination.to_str().unwrap(),
            &user_dir
        )
        .is_err());
    }

    #[test]
    fn rejects_reserved_and_invalid_template_names() {
        let dir = tempdir().unwrap();
        let source = dir.path().join("proyecto");
        fs::create_dir_all(&source).unwrap();
        let user_dir = dir.path().join("templates");
        for invalid in [SCREENWRITER_KIT_ID, BLANK_ID, "", "../fuera", ".oculto"] {
            assert!(
                save_folder_as_template_in(source.to_str().unwrap(), invalid, &user_dir).is_err(),
                "accepted invalid template name {invalid:?}"
            );
        }
    }
}
