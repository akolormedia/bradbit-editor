//! Project kit discovery.
//!
//! Bradbit projects can ship agents, slash commands and skills in
//! `.opencode/` (the OpenCode convention) or `.bradbit/`. This module reads
//! their YAML frontmatter and exposes a small, stable catalog to the composer.
//! `.bradbit` entries override `.opencode` entries with the same id.

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KitLocalized {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub aliases: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KitAgent {
    pub id: String,
    pub name: String,
    pub description: String,
    pub path: String,
    pub aliases: Vec<String>,
    pub i18n: BTreeMap<String, KitLocalized>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KitCommand {
    pub id: String,
    pub name: String,
    pub description: String,
    pub agent: Option<String>,
    pub path: String,
    pub aliases: Vec<String>,
    pub i18n: BTreeMap<String, KitLocalized>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KitSkill {
    pub id: String,
    pub name: String,
    pub description: String,
    pub path: String,
    pub aliases: Vec<String>,
    pub i18n: BTreeMap<String, KitLocalized>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KitCatalog {
    pub agents: Vec<KitAgent>,
    pub commands: Vec<KitCommand>,
    pub skills: Vec<KitSkill>,
}

#[derive(Debug, Default, Deserialize)]
struct FrontMatter {
    name: Option<String>,
    description: Option<String>,
    agent: Option<String>,
    #[serde(default)]
    aliases: Vec<String>,
    #[serde(default)]
    i18n: BTreeMap<String, KitLocalized>,
}

/// Discover the kit of a project folder. Missing folders are not an error.
pub fn discover(root: &str) -> Result<KitCatalog, String> {
    let root = Path::new(root);
    let mut agents = BTreeMap::new();
    let mut commands = BTreeMap::new();
    let mut skills = BTreeMap::new();

    for base in [".opencode", ".bradbit"] {
        let base_path = root.join(base);
        if !base_path.is_dir() {
            continue;
        }
        collect_agents(root, &base_path, &mut agents)?;
        collect_commands(root, &base_path, &mut commands)?;
        collect_skills(root, &base_path, &mut skills)?;
    }

    Ok(KitCatalog {
        agents: agents.into_values().collect(),
        commands: commands.into_values().collect(),
        skills: skills.into_values().collect(),
    })
}

fn collect_agents(
    root: &Path,
    base: &Path,
    agents: &mut BTreeMap<String, KitAgent>,
) -> Result<(), String> {
    let directory = base.join("agents");
    for path in markdown_files(&directory)? {
        let raw = read_file(&path)?;
        let (front, _) = parse_document(&raw);
        let id = file_stem(&path);
        if id.is_empty() {
            continue;
        }
        let name = trimmed(front.name.as_deref()).unwrap_or_else(|| id.clone());
        agents.insert(
            id.clone(),
            KitAgent {
                id,
                name,
                description: front.description.unwrap_or_default().trim().to_string(),
                path: relative_path(root, &path),
                aliases: front.aliases,
                i18n: front.i18n,
            },
        );
    }
    Ok(())
}

fn collect_commands(
    root: &Path,
    base: &Path,
    commands: &mut BTreeMap<String, KitCommand>,
) -> Result<(), String> {
    let directory = base.join("commands");
    for path in markdown_files(&directory)? {
        let raw = read_file(&path)?;
        let (front, _) = parse_document(&raw);
        let id = file_stem(&path);
        if id.is_empty() {
            continue;
        }
        let name = trimmed(front.name.as_deref()).unwrap_or_else(|| id.clone());
        commands.insert(
            id.clone(),
            KitCommand {
                id,
                name,
                description: front.description.unwrap_or_default().trim().to_string(),
                agent: front.agent.and_then(|agent| trimmed(Some(&agent))),
                path: relative_path(root, &path),
                aliases: front.aliases,
                i18n: front.i18n,
            },
        );
    }
    Ok(())
}

fn collect_skills(
    root: &Path,
    base: &Path,
    skills: &mut BTreeMap<String, KitSkill>,
) -> Result<(), String> {
    let directory = base.join("skills");
    if !directory.is_dir() {
        return Ok(());
    }
    let mut entries = fs::read_dir(&directory)
        .map_err(|error| format!("Could not read {}: {error}", directory.display()))?
        .filter_map(Result::ok)
        .collect::<Vec<_>>();
    entries.sort_by_key(|entry| entry.file_name());

    for entry in entries {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let skill_file = path.join("SKILL.md");
        if !skill_file.is_file() {
            continue;
        }
        let raw = read_file(&skill_file)?;
        let (front, _) = parse_document(&raw);
        let id = path
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_default();
        if id.is_empty() {
            continue;
        }
        let name = trimmed(front.name.as_deref()).unwrap_or_else(|| id.clone());
        skills.insert(
            id.clone(),
            KitSkill {
                id,
                name,
                description: front.description.unwrap_or_default().trim().to_string(),
                path: relative_path(root, &skill_file),
                aliases: front.aliases,
                i18n: front.i18n,
            },
        );
    }
    Ok(())
}

fn markdown_files(directory: &Path) -> Result<Vec<std::path::PathBuf>, String> {
    if !directory.is_dir() {
        return Ok(Vec::new());
    }
    let mut files = fs::read_dir(directory)
        .map_err(|error| format!("Could not read {}: {error}", directory.display()))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.is_file()
                && path
                    .extension()
                    .and_then(|extension| extension.to_str())
                    .map(|extension| extension.eq_ignore_ascii_case("md"))
                    .unwrap_or(false)
        })
        .collect::<Vec<_>>();
    files.sort();
    Ok(files)
}

fn read_file(path: &Path) -> Result<String, String> {
    fs::read_to_string(path).map_err(|error| format!("Could not read {}: {error}", path.display()))
}

fn parse_document(raw: &str) -> (FrontMatter, &str) {
    let raw = raw.strip_prefix('\u{feff}').unwrap_or(raw);
    let mut lines = raw.split_inclusive('\n');
    let Some(first) = lines.next() else {
        return (FrontMatter::default(), raw);
    };
    if first.trim_end() != "---" {
        return (FrontMatter::default(), raw);
    }

    let mut front = String::new();
    let mut consumed = first.len();
    let mut closed = false;
    for line in lines {
        consumed += line.len();
        if line.trim_end() == "---" || line.trim_end() == "..." {
            closed = true;
            break;
        }
        front.push_str(line);
    }
    if !closed {
        return (FrontMatter::default(), raw);
    }
    let parsed = serde_yaml::from_str::<FrontMatter>(&front).unwrap_or_default();
    (parsed, raw.get(consumed..).unwrap_or(""))
}

fn relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn file_stem(path: &Path) -> String {
    path.file_stem()
        .map(|stem| stem.to_string_lossy().to_string())
        .unwrap_or_default()
}

fn trimmed(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn parses_frontmatter_with_quotes_and_without_it() {
        let (front, body) = parse_document(
            "---\nname: \"escena\"\ndescription: 'Write a scene'\nagent: guionista\n---\n\nContent\n",
        );
        assert_eq!(front.name.as_deref(), Some("escena"));
        assert_eq!(front.description.as_deref(), Some("Write a scene"));
        assert_eq!(front.agent.as_deref(), Some("guionista"));
        assert_eq!(body.trim(), "Content");

        let (front, body) = parse_document("# Sin frontmatter\n");
        assert!(front.name.is_none());
        assert_eq!(body.trim(), "# Sin frontmatter");
    }

    #[test]
    fn discovers_agents_commands_and_skills_and_bradbit_overrides() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        let opencode = root.join(".opencode");
        fs::create_dir_all(opencode.join("agents")).unwrap();
        fs::create_dir_all(opencode.join("commands")).unwrap();
        fs::create_dir_all(opencode.join("skills/draft")).unwrap();
        fs::write(
            opencode.join("agents/guionista.md"),
            "---\nname: guionista\ndescription: Escribe\n---\n",
        )
        .unwrap();
        fs::write(
            opencode.join("commands/escena.md"),
            "---\nname: escena\ndescription: Write a scene\nagent: guionista\n---\n",
        )
        .unwrap();
        fs::write(
            opencode.join("skills/draft/SKILL.md"),
            "---\nname: draft\ndescription: Borradores\n---\n",
        )
        .unwrap();

        let bradbit = root.join(".bradbit");
        fs::create_dir_all(bradbit.join("agents")).unwrap();
        fs::write(
            bradbit.join("agents/guionista.md"),
            "---\nname: guionista\ndescription: Version .bradbit\n---\n",
        )
        .unwrap();

        let catalog = discover(root.to_str().unwrap()).unwrap();
        assert_eq!(catalog.agents.len(), 1);
        assert_eq!(catalog.agents[0].description, "Version .bradbit");
        assert_eq!(catalog.commands.len(), 1);
        assert_eq!(catalog.commands[0].agent.as_deref(), Some("guionista"));
        assert_eq!(catalog.skills.len(), 1);
        assert_eq!(catalog.skills[0].id, "draft");
        assert_eq!(catalog.agents[0].path, ".bradbit/agents/guionista.md");
    }

    #[test]
    fn parses_localized_metadata_and_uses_path_ids() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        let agents = root.join(".bradbit/agents");
        let commands = root.join(".bradbit/commands");
        fs::create_dir_all(&agents).unwrap();
        fs::create_dir_all(&commands).unwrap();
        fs::write(
            agents.join("screenwriter.md"),
            "---\nname: Screenwriter\ndescription: Writes scenes\ni18n:\n  es:\n    name: Guionista\n    description: Escribe escenas\n---\n",
        )
        .unwrap();
        fs::write(
            commands.join("scene.md"),
            "---\nname: Scene\ndescription: Write a scene\naliases: [write-scene]\ni18n:\n  es:\n    name: Escena\n    description: Escribe una escena\n    aliases: [escena]\n---\n\n",
        )
        .unwrap();

        let catalog = discover(root.to_str().unwrap()).unwrap();
        assert_eq!(catalog.agents[0].id, "screenwriter");
        assert_eq!(catalog.agents[0].name, "Screenwriter");
        assert_eq!(
            catalog.agents[0].i18n["es"].name.as_deref(),
            Some("Guionista")
        );
        assert_eq!(catalog.commands[0].id, "scene");
        assert_eq!(catalog.commands[0].name, "Scene");
        assert_eq!(catalog.commands[0].aliases, vec!["write-scene"]);
        assert_eq!(
            catalog.commands[0].i18n["es"].name.as_deref(),
            Some("Escena")
        );
        assert_eq!(catalog.commands[0].i18n["es"].aliases, vec!["escena"]);
    }

    #[test]
    fn missing_kit_folders_return_empty_catalog() {
        let dir = tempdir().unwrap();
        assert_eq!(
            discover(dir.path().to_str().unwrap()).unwrap(),
            KitCatalog::default()
        );
    }

    #[test]
    fn discovers_the_real_guionista_kit() {
        let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
        let kit = manifest.join("../../guionista-kit");
        if !kit.is_dir() {
            return;
        }
        let catalog = discover(kit.to_str().unwrap()).unwrap();
        assert_eq!(catalog.agents.len(), 4);
        assert_eq!(catalog.commands.len(), 7);
        assert_eq!(catalog.skills.len(), 9);
    }
}
