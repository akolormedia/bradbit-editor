//! Skill discovery and read-only inspection.
//!
//! OpenCode discovers skills from global, project and compatibility folders,
//! plus explicit `skills` entries in its configuration. This module builds an
//! inventory for the editor without changing any files. Skills are Markdown
//! instructions: the app never executes them.

use serde::{Deserialize, Serialize};
use serde_yaml::Value as YamlValue;
use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

const MAX_DEPTH: usize = 6;
const MAX_SUPPORT_FILES: usize = 200;
const MAX_SKILL_BYTES: u64 = 2 * 1024 * 1024;

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillLocalized {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub aliases: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub aliases: Vec<String>,
    pub i18n: BTreeMap<String, SkillLocalized>,
    pub source: String,
    pub scope: String,
    pub path: String,
    pub root: String,
    pub relative_path: String,
    pub format: String,
    pub valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
    pub autoinvoke: bool,
    pub disable_model_invocation: bool,
    pub files: Vec<String>,
    pub effective: bool,
    pub overridden_by: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillCatalog {
    pub skills: Vec<SkillInfo>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillDocument {
    pub info: SkillInfo,
    pub frontmatter: String,
    pub body: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillValidation {
    pub valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone)]
struct SourceSpec {
    source: String,
    scope: String,
    root: PathBuf,
}

impl SourceSpec {
    fn new(source: &str, scope: &str, root: PathBuf) -> Self {
        Self {
            source: source.to_string(),
            scope: scope.to_string(),
            root,
        }
    }
}

#[derive(Debug, Default, Deserialize)]
struct SkillFrontMatter {
    name: Option<String>,
    description: Option<String>,
    #[serde(default)]
    aliases: Vec<String>,
    #[serde(default)]
    autoinvoke: Option<bool>,
    #[serde(default, rename = "disable-model-invocation")]
    disable_model_invocation: Option<bool>,
    #[serde(default)]
    metadata: Option<YamlValue>,
    #[serde(default)]
    i18n: BTreeMap<String, SkillLocalized>,
}

#[derive(Debug, Default)]
struct ParsedDocument {
    front: SkillFrontMatter,
    frontmatter: String,
    body: String,
    errors: Vec<String>,
}

/// Build the inventory for a project (or only global sources when `None`).
pub fn discover(project_root: Option<&str>) -> Result<SkillCatalog, String> {
    let project = project_root.map(Path::new);
    let home = dirs::home_dir();
    let mut sources = global_sources();
    if let Some(project) = project {
        sources.extend(project_sources(project));
    }
    let (explicit, warnings) = config_sources(project, home.as_deref());
    sources.extend(explicit);
    Ok(discover_sources(&sources, warnings))
}

pub fn read(project_root: Option<&str>, path: &str) -> Result<SkillDocument, String> {
    let catalog = discover(project_root)?;
    let canonical = fs::canonicalize(path)
        .map_err(|error| format!("Could not open the skill '{}': {error}", path))?;
    let info = catalog
        .skills
        .into_iter()
        .find(|skill| {
            fs::canonicalize(&skill.path)
                .map(|item| item == canonical)
                .unwrap_or(false)
        })
        .ok_or_else(|| "The skill is not part of any known source".to_string())?;
    let raw = fs::read_to_string(&info.path)
        .map_err(|error| format!("Could not read the skill '{}': {error}", info.path))?;
    let parsed = parse_document(&raw);
    Ok(SkillDocument {
        info,
        frontmatter: parsed.frontmatter,
        body: parsed.body,
    })
}

pub fn validate(project_root: Option<&str>, path: &str) -> Result<SkillValidation, String> {
    let document = read(project_root, path)?;
    Ok(SkillValidation {
        valid: document.info.valid,
        errors: document.info.errors,
        warnings: document.info.warnings,
    })
}

fn global_sources() -> Vec<SourceSpec> {
    let mut sources = Vec::new();
    if let Some(home) = dirs::home_dir() {
        sources.push(SourceSpec::new(
            "claude",
            "global",
            home.join(".claude/skills"),
        ));
        sources.push(SourceSpec::new(
            "agents",
            "global",
            home.join(".agents/skills"),
        ));
        sources.push(SourceSpec::new(
            "opencode",
            "global",
            home.join(".config/opencode/skills"),
        ));
    }
    if let Ok(config) = crate::settings::config_dir() {
        sources.push(SourceSpec::new("app", "global", config.join("skills")));
    }
    sources
}

fn project_sources(project: &Path) -> Vec<SourceSpec> {
    vec![
        SourceSpec::new("claude", "project", project.join(".claude/skills")),
        SourceSpec::new("agents", "project", project.join(".agents/skills")),
        SourceSpec::new("opencode", "project", project.join(".opencode/skills")),
        SourceSpec::new("kit", "project", project.join(".bradbit/skills")),
    ]
}

fn discover_sources(sources: &[SourceSpec], mut warnings: Vec<String>) -> SkillCatalog {
    let mut skills = Vec::new();
    let mut seen_roots = HashSet::new();
    for spec in sources {
        let root = match fs::canonicalize(&spec.root) {
            Ok(path) if path.is_dir() => path,
            _ => continue,
        };
        if !seen_roots.insert(root.clone()) {
            continue;
        }
        skills.extend(discover_source(
            &root,
            &spec.source,
            &spec.scope,
            &mut warnings,
        ));
    }
    resolve_conflicts(&mut skills);
    skills.sort_by(|left, right| {
        right
            .effective
            .cmp(&left.effective)
            .then_with(|| left.id.cmp(&right.id))
            .then_with(|| left.source.cmp(&right.source))
            .then_with(|| left.path.cmp(&right.path))
    });
    SkillCatalog { skills, warnings }
}

fn discover_source(
    root: &Path,
    source: &str,
    scope: &str,
    warnings: &mut Vec<String>,
) -> Vec<SkillInfo> {
    let mut skills = Vec::new();
    let mut entries = match fs::read_dir(root) {
        Ok(entries) => entries.filter_map(Result::ok).collect::<Vec<_>>(),
        Err(error) => {
            warnings.push(format!(
                "Could not read skills in {}: {error}",
                root.display()
            ));
            return skills;
        }
    };
    entries.sort_by_key(|entry| entry.file_name());
    for entry in entries {
        let path = entry.path();
        let file_type = match entry.file_type() {
            Ok(value) => value,
            Err(_) => continue,
        };
        if file_type.is_symlink() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        if file_type.is_file()
            && path
                .extension()
                .and_then(|extension| extension.to_str())
                .map(|extension| extension.eq_ignore_ascii_case("md"))
                .unwrap_or(false)
        {
            if let Some(skill) = read_skill(root, &path, None, source, scope, warnings) {
                skills.push(skill);
            }
            continue;
        }
        if !file_type.is_dir() || name.eq_ignore_ascii_case("node_modules") {
            continue;
        }
        collect_directory_skill(root, &path, 1, source, scope, warnings, &mut skills);
    }
    skills
}

fn collect_directory_skill(
    root: &Path,
    directory: &Path,
    depth: usize,
    source: &str,
    scope: &str,
    warnings: &mut Vec<String>,
    skills: &mut Vec<SkillInfo>,
) {
    if depth > MAX_DEPTH {
        return;
    }
    let skill_file = directory.join("SKILL.md");
    if skill_file.is_file() && !is_symlink(&skill_file) {
        if let Some(skill) = read_skill(root, &skill_file, Some(directory), source, scope, warnings)
        {
            skills.push(skill);
        }
        return;
    }
    let mut entries = match fs::read_dir(directory) {
        Ok(entries) => entries.filter_map(Result::ok).collect::<Vec<_>>(),
        Err(_) => return,
    };
    entries.sort_by_key(|entry| entry.file_name());
    for entry in entries {
        let path = entry.path();
        let file_type = match entry.file_type() {
            Ok(value) => value,
            Err(_) => continue,
        };
        if file_type.is_symlink() || !file_type.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name.eq_ignore_ascii_case("node_modules") {
            continue;
        }
        collect_directory_skill(root, &path, depth + 1, source, scope, warnings, skills);
    }
}

fn read_skill(
    root: &Path,
    path: &Path,
    directory: Option<&Path>,
    source: &str,
    scope: &str,
    warnings: &mut Vec<String>,
) -> Option<SkillInfo> {
    let metadata = match fs::metadata(path) {
        Ok(value) => value,
        Err(error) => {
            warnings.push(format!("Could not inspect {}: {error}", path.display()));
            return None;
        }
    };
    if metadata.len() > MAX_SKILL_BYTES {
        warnings.push(format!(
            "Skipped {}: skill files above {} bytes are not supported",
            path.display(),
            MAX_SKILL_BYTES
        ));
        return None;
    }
    let raw = match fs::read_to_string(path) {
        Ok(value) => value,
        Err(error) => {
            warnings.push(format!("Could not read {}: {error}", path.display()));
            return None;
        }
    };
    let parsed = parse_document(&raw);
    let id = if let Some(directory) = directory {
        directory
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_default()
    } else {
        path.file_stem()
            .map(|stem| stem.to_string_lossy().to_string())
            .unwrap_or_default()
    };
    if id.is_empty() {
        return None;
    }

    let name = trimmed(parsed.front.name.as_deref()).unwrap_or_else(|| id.clone());
    let description = parsed
        .front
        .description
        .as_deref()
        .map(str::trim)
        .unwrap_or_default()
        .to_string();
    let mut warnings = Vec::new();
    if description.is_empty() {
        warnings.push(
            "Missing description: the model will not see this skill in its available list"
                .to_string(),
        );
    }
    if !valid_skill_id(&id) {
        warnings.push(
            "Skill IDs should use lowercase kebab-case (for example, git-release)".to_string(),
        );
    }
    let autoinvoke = autoinvoke_of(&parsed.front);
    let disable = parsed.front.disable_model_invocation.unwrap_or(false);

    Some(SkillInfo {
        id,
        name,
        description,
        aliases: parsed.front.aliases.clone(),
        i18n: parsed.front.i18n.clone(),
        source: source.to_string(),
        scope: scope.to_string(),
        path: path.to_string_lossy().to_string(),
        root: root.to_string_lossy().to_string(),
        relative_path: relative_path(root, path),
        format: if directory.is_some() {
            "directory".to_string()
        } else {
            "file".to_string()
        },
        valid: parsed.errors.is_empty(),
        errors: parsed.errors,
        warnings,
        autoinvoke,
        disable_model_invocation: disable,
        files: directory.map(collect_support_files).unwrap_or_default(),
        effective: false,
        overridden_by: None,
    })
}

fn autoinvoke_of(front: &SkillFrontMatter) -> bool {
    let metadata = front
        .metadata
        .as_ref()
        .and_then(|value| value.get("opencode/autoinvoke"))
        .and_then(YamlValue::as_bool);
    metadata
        .or(front.autoinvoke)
        .unwrap_or(!front.disable_model_invocation.unwrap_or(false))
}

fn parse_document(raw: &str) -> ParsedDocument {
    let raw = raw.strip_prefix('\u{feff}').unwrap_or(raw);
    let mut lines = raw.split_inclusive('\n');
    let Some(first) = lines.next() else {
        return ParsedDocument {
            body: raw.to_string(),
            ..ParsedDocument::default()
        };
    };
    if first.trim_end() != "---" {
        return ParsedDocument {
            body: raw.to_string(),
            ..ParsedDocument::default()
        };
    }

    let mut frontmatter = String::new();
    let mut consumed = first.len();
    let mut closed = false;
    for line in lines {
        consumed += line.len();
        if line.trim_end() == "---" || line.trim_end() == "..." {
            closed = true;
            break;
        }
        frontmatter.push_str(line);
    }
    let body = raw.get(consumed..).unwrap_or("").to_string();
    if !closed {
        return ParsedDocument {
            frontmatter,
            body,
            errors: vec!["The frontmatter is not closed with ---".to_string()],
            ..ParsedDocument::default()
        };
    }
    match serde_yaml::from_str::<SkillFrontMatter>(&frontmatter) {
        Ok(front) => ParsedDocument {
            front,
            frontmatter,
            body,
            errors: Vec::new(),
        },
        Err(error) => ParsedDocument {
            frontmatter,
            body,
            errors: vec![format!("Invalid frontmatter: {error}")],
            ..ParsedDocument::default()
        },
    }
}

fn collect_support_files(directory: &Path) -> Vec<String> {
    let mut files = Vec::new();
    collect_support_files_inner(directory, directory, 0, &mut files);
    files.sort();
    files.truncate(MAX_SUPPORT_FILES);
    files
}

fn collect_support_files_inner(
    root: &Path,
    directory: &Path,
    depth: usize,
    files: &mut Vec<String>,
) {
    if depth > MAX_DEPTH || files.len() >= MAX_SUPPORT_FILES {
        return;
    }
    let mut entries = match fs::read_dir(directory) {
        Ok(entries) => entries.filter_map(Result::ok).collect::<Vec<_>>(),
        Err(_) => return,
    };
    entries.sort_by_key(|entry| entry.file_name());
    for entry in entries {
        let path = entry.path();
        let file_type = match entry.file_type() {
            Ok(value) => value,
            Err(_) => continue,
        };
        if file_type.is_symlink() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name.eq_ignore_ascii_case("node_modules") {
            continue;
        }
        if file_type.is_dir() {
            collect_support_files_inner(root, &path, depth + 1, files);
        } else if file_type.is_file() && path != root.join("SKILL.md") {
            files.push(relative_path(root, &path));
        }
    }
}

fn resolve_conflicts(skills: &mut [SkillInfo]) {
    let mut winners: BTreeMap<String, usize> = BTreeMap::new();
    for index in 0..skills.len() {
        let id = skills[index].id.clone();
        if let Some(previous) = winners.get(&id).copied() {
            skills[previous].effective = false;
            skills[previous].overridden_by = Some(skills[index].path.clone());
        }
        skills[index].effective = true;
        winners.insert(id, index);
    }
}

fn config_sources(project: Option<&Path>, home: Option<&Path>) -> (Vec<SourceSpec>, Vec<String>) {
    let mut sources = Vec::new();
    let mut warnings = Vec::new();
    for file in config_files(project, home) {
        let raw = match fs::read_to_string(&file) {
            Ok(value) => Some(value),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => {
                warnings.push(format!("Could not read {}: {error}", file.display()));
                None
            }
        };
        let Some(raw) = raw else { continue };
        let cleaned = strip_jsonc(&raw);
        let value: serde_json::Value = match serde_json::from_str(&cleaned) {
            Ok(value) => value,
            Err(error) => {
                warnings.push(format!(
                    "Could not read skills from {}: {error}",
                    file.display()
                ));
                continue;
            }
        };
        let Some(entries) = value.get("skills").and_then(serde_json::Value::as_array) else {
            continue;
        };
        for entry in entries {
            let Some(value) = entry.as_str() else {
                continue;
            };
            if value.starts_with("http://") || value.starts_with("https://") {
                warnings.push(format!(
                    "Remote skill catalogs are not supported yet: {value}"
                ));
                continue;
            }
            let Some(path) = resolve_source_path(value, project, home) else {
                warnings.push(format!("Could not resolve the skill source '{value}'"));
                continue;
            };
            let canonical_path = fs::canonicalize(&path).unwrap_or_else(|_| path.clone());
            let scope = if project
                .and_then(|root| fs::canonicalize(root).ok())
                .map(|root| canonical_path.starts_with(&root))
                .unwrap_or(false)
            {
                "project"
            } else {
                "global"
            };
            sources.push(SourceSpec::new("config", scope, path));
        }
    }
    (sources, warnings)
}

fn config_files(project: Option<&Path>, home: Option<&Path>) -> Vec<PathBuf> {
    let mut files = Vec::new();
    if let Some(home) = home {
        let directory = home.join(".config/opencode");
        files.push(directory.join("opencode.json"));
        files.push(directory.join("opencode.jsonc"));
    }
    if let Some(project) = project {
        files.push(project.join("opencode.json"));
        files.push(project.join("opencode.jsonc"));
        files.push(project.join(".opencode/opencode.json"));
        files.push(project.join(".opencode/opencode.jsonc"));
    }
    files
}

fn resolve_source_path(
    value: &str,
    project: Option<&Path>,
    home: Option<&Path>,
) -> Option<PathBuf> {
    let value = value.trim();
    if value == "~" {
        return home.map(Path::to_path_buf);
    }
    if let Some(rest) = value.strip_prefix("~/") {
        return home.map(|home| home.join(rest));
    }
    let path = Path::new(value);
    if path.is_absolute() {
        return Some(path.to_path_buf());
    }
    project.map(|root| root.join(path))
}

fn strip_jsonc(raw: &str) -> String {
    let mut without_comments = String::new();
    let mut chars = raw.chars().peekable();
    let mut in_string = false;
    let mut escaped = false;
    while let Some(character) = chars.next() {
        if in_string {
            without_comments.push(character);
            if escaped {
                escaped = false;
            } else if character == '\\' {
                escaped = true;
            } else if character == '"' {
                in_string = false;
            }
            continue;
        }
        if character == '"' {
            in_string = true;
            without_comments.push(character);
            continue;
        }
        if character == '/' {
            match chars.peek() {
                Some('/') => {
                    chars.next();
                    for next in chars.by_ref() {
                        if next == '\n' {
                            without_comments.push('\n');
                            break;
                        }
                    }
                }
                Some('*') => {
                    chars.next();
                    let mut previous = '\0';
                    for next in chars.by_ref() {
                        if previous == '*' && next == '/' {
                            break;
                        }
                        if next == '\n' {
                            without_comments.push('\n');
                        }
                        previous = next;
                    }
                }
                _ => without_comments.push(character),
            }
            continue;
        }
        without_comments.push(character);
    }
    strip_trailing_commas(&without_comments)
}

fn strip_trailing_commas(raw: &str) -> String {
    let chars = raw.chars().collect::<Vec<_>>();
    let mut output = String::new();
    let mut in_string = false;
    let mut escaped = false;
    let mut index = 0;
    while index < chars.len() {
        let character = chars[index];
        if in_string {
            output.push(character);
            if escaped {
                escaped = false;
            } else if character == '\\' {
                escaped = true;
            } else if character == '"' {
                in_string = false;
            }
            index += 1;
            continue;
        }
        if character == '"' {
            in_string = true;
            output.push(character);
            index += 1;
            continue;
        }
        if character == ',' {
            let mut next = index + 1;
            while next < chars.len() && chars[next].is_whitespace() {
                next += 1;
            }
            if next < chars.len() && (chars[next] == '}' || chars[next] == ']') {
                index += 1;
                continue;
            }
        }
        output.push(character);
        index += 1;
    }
    output
}

fn is_symlink(path: &Path) -> bool {
    fs::symlink_metadata(path)
        .map(|metadata| metadata.file_type().is_symlink())
        .unwrap_or(false)
}

fn relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn trimmed(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn valid_skill_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id.split('-').all(|part| {
            !part.is_empty()
                && part
                    .chars()
                    .all(|character| character.is_ascii_lowercase() || character.is_ascii_digit())
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn source(source: &str, scope: &str, root: &Path) -> SourceSpec {
        SourceSpec::new(source, scope, root.to_path_buf())
    }

    #[test]
    fn discovers_file_and_directory_skills_with_support_files() {
        let dir = tempdir().unwrap();
        let root = dir.path().join("skills");
        fs::create_dir_all(root.join("git-release/references")).unwrap();
        fs::write(
            root.join("review.md"),
            "---\nname: Review\ndescription: Review a draft\n---\n\nBody\n",
        )
        .unwrap();
        fs::write(
            root.join("git-release/SKILL.md"),
            "---\nname: Git Release\ndescription: Prepare a release\naliases: [release]\n---\n\nSteps\n",
        )
        .unwrap();
        fs::write(root.join("git-release/references/policy.md"), "Policy").unwrap();

        let catalog = discover_sources(&[source("app", "global", &root)], Vec::new());
        assert_eq!(catalog.skills.len(), 2);
        let review = catalog
            .skills
            .iter()
            .find(|skill| skill.id == "review")
            .unwrap();
        assert_eq!(review.format, "file");
        assert!(review.files.is_empty());
        assert!(review.effective);
        let release = catalog
            .skills
            .iter()
            .find(|skill| skill.id == "git-release")
            .unwrap();
        assert_eq!(release.format, "directory");
        assert_eq!(release.aliases, vec!["release"]);
        assert_eq!(release.files, vec!["references/policy.md"]);
        assert!(release.valid);
    }

    #[test]
    fn parses_localized_metadata_and_autoinvoke() {
        let dir = tempdir().unwrap();
        let root = dir.path().join("skills");
        fs::create_dir_all(root.join("voice")).unwrap();
        fs::write(
            root.join("voice/SKILL.md"),
            "---\nname: Voice\ndescription: Voice notes\ndisable-model-invocation: true\nmetadata:\n  opencode/autoinvoke: false\ni18n:\n  es:\n    name: Voz\n    description: Notas de voz\n    aliases: [voz]\n---\n",
        )
        .unwrap();

        let catalog = discover_sources(&[source("app", "global", &root)], Vec::new());
        let voice = &catalog.skills[0];
        assert!(!voice.autoinvoke);
        assert!(voice.disable_model_invocation);
        assert_eq!(voice.i18n["es"].name.as_deref(), Some("Voz"));
        assert_eq!(voice.i18n["es"].aliases, vec!["voz"]);
    }

    #[test]
    fn marks_overridden_skills_by_source_precedence() {
        let dir = tempdir().unwrap();
        let opencode = dir.path().join("opencode");
        let kit = dir.path().join("kit");
        fs::create_dir_all(opencode.join("review")).unwrap();
        fs::create_dir_all(kit.join("review")).unwrap();
        fs::write(
            opencode.join("review/SKILL.md"),
            "---\nname: Review\ndescription: From OpenCode\n---\n",
        )
        .unwrap();
        fs::write(
            kit.join("review/SKILL.md"),
            "---\nname: Review\ndescription: From the kit\n---\n",
        )
        .unwrap();

        let catalog = discover_sources(
            &[
                source("opencode", "project", &opencode),
                source("kit", "project", &kit),
            ],
            Vec::new(),
        );
        assert_eq!(catalog.skills.len(), 2);
        let kit_skill = catalog
            .skills
            .iter()
            .find(|skill| skill.source == "kit")
            .unwrap();
        let opencode_skill = catalog
            .skills
            .iter()
            .find(|skill| skill.source == "opencode")
            .unwrap();
        assert!(kit_skill.effective);
        assert!(!opencode_skill.effective);
        assert_eq!(
            opencode_skill.overridden_by.as_deref(),
            Some(kit_skill.path.as_str())
        );
    }

    #[test]
    fn skips_hidden_directories_and_node_modules() {
        let dir = tempdir().unwrap();
        let root = dir.path().join("skills");
        fs::create_dir_all(root.join(".hidden")).unwrap();
        fs::create_dir_all(root.join("node_modules/dep")).unwrap();
        fs::create_dir_all(root.join("visible")).unwrap();
        fs::write(
            root.join(".hidden/SKILL.md"),
            "---\nname: Hidden\ndescription: Hidden\n---\n",
        )
        .unwrap();
        fs::write(
            root.join("node_modules/dep/SKILL.md"),
            "---\nname: Dep\ndescription: Dep\n---\n",
        )
        .unwrap();
        fs::write(
            root.join("visible/SKILL.md"),
            "---\nname: Visible\ndescription: Visible\n---\n",
        )
        .unwrap();

        let catalog = discover_sources(&[source("app", "global", &root)], Vec::new());
        assert_eq!(catalog.skills.len(), 1);
        assert_eq!(catalog.skills[0].id, "visible");
    }

    #[test]
    fn parses_bom_crlf_and_reports_invalid_yaml() {
        let dir = tempdir().unwrap();
        let root = dir.path().join("skills");
        fs::create_dir_all(root.join("bom")).unwrap();
        fs::create_dir_all(root.join("broken")).unwrap();
        fs::write(
            root.join("bom/SKILL.md"),
            "\u{feff}---\r\nname: BOM\r\ndescription: Compatible\r\n---\r\nBody\r\n",
        )
        .unwrap();
        fs::write(
            root.join("broken/SKILL.md"),
            "---\nname: [broken\n---\nBody\n",
        )
        .unwrap();

        let catalog = discover_sources(&[source("app", "global", &root)], Vec::new());
        let bom = catalog
            .skills
            .iter()
            .find(|skill| skill.id == "bom")
            .unwrap();
        assert!(bom.valid);
        assert_eq!(bom.name, "BOM");
        let broken = catalog
            .skills
            .iter()
            .find(|skill| skill.id == "broken")
            .unwrap();
        assert!(!broken.valid);
        assert!(!broken.errors.is_empty());
    }

    #[test]
    fn strips_jsonc_comments_and_trailing_commas() {
        let raw = r#"{
          // Global skills
          "skills": [
            "./skills",
            /* local */ "team-skills",
          ],
          "other": "// not a comment",
        }"#;
        let value: serde_json::Value = serde_json::from_str(&strip_jsonc(raw)).unwrap();
        assert_eq!(
            value["skills"],
            serde_json::json!(["./skills", "team-skills"])
        );
        assert_eq!(value["other"], "// not a comment");
    }

    #[test]
    fn resolves_local_config_sources_and_skips_remote_catalogs() {
        let dir = tempdir().unwrap();
        let project = dir.path().join("project");
        let home = dir.path().join("home");
        fs::create_dir_all(project.join(".opencode")).unwrap();
        fs::create_dir_all(project.join("extra-skills")).unwrap();
        fs::write(
            project.join(".opencode/opencode.jsonc"),
            r#"{
              "skills": ["extra-skills", "https://example.com/skills/"],
            }"#,
        )
        .unwrap();

        let (sources, warnings) = config_sources(Some(&project), Some(&home));
        assert_eq!(sources.len(), 1);
        assert_eq!(sources[0].source, "config");
        assert_eq!(sources[0].scope, "project");
        assert_eq!(sources[0].root, project.join("extra-skills"));
        assert!(warnings.iter().any(|warning| warning.contains("Remote")));
    }

    #[test]
    fn reads_documents_only_from_known_sources() {
        let dir = tempdir().unwrap();
        let project = dir.path().join("project");
        let root = project.join(".bradbit/skills");
        fs::create_dir_all(root.join("review")).unwrap();
        let path = root.join("review/SKILL.md");
        fs::write(
            &path,
            "---\nname: Review\ndescription: Review\n---\n\nBody\n",
        )
        .unwrap();

        let catalog = discover_sources(&[source("kit", "project", &root)], Vec::new());
        let info = &catalog.skills[0];
        let raw = fs::read_to_string(&info.path).unwrap();
        let parsed = parse_document(&raw);
        assert!(parsed.body.contains("Body"));
        assert!(read(Some(project.to_str().unwrap()), "/etc/passwd").is_err());
    }

    #[test]
    fn reads_and_validates_a_known_skill() {
        let dir = tempdir().unwrap();
        let project = dir.path().join("project");
        let root = project.join(".bradbit/skills");
        fs::create_dir_all(root.join("review")).unwrap();
        let path = root.join("review/SKILL.md");
        fs::write(
            &path,
            "---
name: Review
description: Review a draft
---

Body
",
        )
        .unwrap();

        let document = read(Some(project.to_str().unwrap()), path.to_str().unwrap()).unwrap();
        assert_eq!(document.info.id, "review");
        assert!(document.body.contains("Body"));
        let validation = validate(Some(project.to_str().unwrap()), path.to_str().unwrap()).unwrap();
        assert!(validation.valid);
        assert!(validation.errors.is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn skips_symlinked_files_and_directories() {
        use std::os::unix::fs::symlink;
        let dir = tempdir().unwrap();
        let root = dir.path().join("skills");
        fs::create_dir_all(root.join("real")).unwrap();
        fs::write(
            root.join("review.md"),
            "---
name: Review
description: Review
---
",
        )
        .unwrap();
        fs::write(
            root.join("real/SKILL.md"),
            "---
name: Real
description: Real
---
",
        )
        .unwrap();
        symlink(root.join("review.md"), root.join("linked.md")).unwrap();
        symlink(root.join("real"), root.join("linked-dir")).unwrap();

        let catalog = discover_sources(&[source("app", "global", &root)], Vec::new());
        let ids = catalog
            .skills
            .iter()
            .map(|skill| skill.id.as_str())
            .collect::<Vec<_>>();
        assert_eq!(ids, vec!["real", "review"]);
    }

    #[test]
    fn stops_at_six_levels_below_the_source_root() {
        let dir = tempdir().unwrap();
        let root = dir.path().join("skills");
        let deep = root.join("a/b/c/d/e/f");
        fs::create_dir_all(&deep).unwrap();
        fs::write(
            deep.join("SKILL.md"),
            "---
name: Six
description: At the limit
---
",
        )
        .unwrap();
        let too_deep = root.join("a/b/c/d/e/f/g");
        fs::create_dir_all(&too_deep).unwrap();
        fs::write(
            too_deep.join("SKILL.md"),
            "---
name: Seven
description: Too deep
---
",
        )
        .unwrap();

        let catalog = discover_sources(&[source("app", "global", &root)], Vec::new());
        assert_eq!(catalog.skills.len(), 1);
        assert_eq!(catalog.skills[0].id, "f");
    }

    #[test]
    fn rejects_skill_ids_with_uppercase_or_spaces() {
        assert!(valid_skill_id("git-release"));
        assert!(valid_skill_id("review2"));
        assert!(!valid_skill_id("Git Release"));
        assert!(!valid_skill_id("review_2"));
        assert!(!valid_skill_id(""));
    }
}
