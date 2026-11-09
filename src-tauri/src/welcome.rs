//! Temporary onboarding workspace for creating a project through chat.
//!
//! OpenCode needs a real folder before the project exists. We prepare a
//! disposable workspace under the Bradbit config directory with instructions
//! for the welcome agent, then read the structured request it leaves behind.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

pub const WORKSPACE_DIR: &str = "welcome-workspace";
pub const REQUEST_RELATIVE: &str = ".bradbit/create-project.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WelcomeTemplate {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WelcomeWorkspace {
    pub path: String,
    pub default_destination: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WelcomeProjectRequest {
    pub name: String,
    pub template_id: String,
}

/// Create the disposable workspace seeded with the welcome agent instructions.
pub fn prepare_workspace(templates: &[WelcomeTemplate]) -> Result<WelcomeWorkspace, String> {
    let root = crate::settings::config_dir()?.join(WORKSPACE_DIR);
    prepare_workspace_in(&root, templates, &default_destination())
}

/// Read the project draft written by the welcome agent, if any.
pub fn read_project_request() -> Result<Option<WelcomeProjectRequest>, String> {
    let root = crate::settings::config_dir()?.join(WORKSPACE_DIR);
    read_project_request_in(&root)
}

fn default_destination() -> PathBuf {
    dirs::document_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_else(|| PathBuf::from("."))
        .join("Bradbit")
}

pub fn prepare_workspace_in(
    root: &Path,
    templates: &[WelcomeTemplate],
    default_destination: &Path,
) -> Result<WelcomeWorkspace, String> {
    if root.exists() {
        fs::remove_dir_all(root)
            .map_err(|error| format!("Could not reset the welcome workspace: {error}"))?;
    }
    fs::create_dir_all(root.join(".bradbit"))
        .map_err(|error| format!("Could not create the welcome workspace: {error}"))?;
    fs::write(root.join("AGENTS.md"), welcome_instructions(templates))
        .map_err(|error| format!("Could not write the welcome instructions: {error}"))?;
    Ok(WelcomeWorkspace {
        path: root.to_string_lossy().to_string(),
        default_destination: default_destination.to_string_lossy().to_string(),
    })
}

pub fn read_project_request_in(root: &Path) -> Result<Option<WelcomeProjectRequest>, String> {
    let path = root.join(REQUEST_RELATIVE);
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("Could not read the project request: {error}"))?;
    parse_project_request(&raw).map(Some)
}

fn parse_project_request(raw: &str) -> Result<WelcomeProjectRequest, String> {
    let trimmed = raw.trim();
    let without_fence = trimmed
        .strip_prefix("```json")
        .or_else(|| trimmed.strip_prefix("```"))
        .and_then(|text| text.strip_suffix("```"))
        .unwrap_or(trimmed)
        .trim();
    let start = without_fence
        .find('{')
        .ok_or_else(|| "The project request is not valid JSON: missing object".to_string())?;
    let end = without_fence
        .rfind('}')
        .ok_or_else(|| "The project request is not valid JSON: missing object".to_string())?;
    let value: serde_json::Value = serde_json::from_str(&without_fence[start..=end])
        .map_err(|error| format!("The project request is not valid JSON: {error}"))?;
    let name = value
        .get("name")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default()
        .trim();
    let template_id = value
        .get("templateId")
        .or_else(|| value.get("template_id"))
        .or_else(|| value.get("template"))
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default()
        .trim();
    if name.is_empty() || template_id.is_empty() {
        return Err("The project request needs a name and a templateId".to_string());
    }
    Ok(WelcomeProjectRequest {
        name: name.to_string(),
        template_id: template_id.to_string(),
    })
}

fn welcome_instructions(templates: &[WelcomeTemplate]) -> String {
    let template_lines = if templates.is_empty() {
        "- `blank` — Proyecto en blanco.".to_string()
    } else {
        templates
            .iter()
            .map(|template| {
                if template.description.trim().is_empty() {
                    format!("- `{}` — {}", template.id, template.name)
                } else {
                    format!(
                        "- `{}` — {}: {}",
                        template.id, template.name, template.description
                    )
                }
            })
            .collect::<Vec<_>>()
            .join("\n")
    };

    format!(
        r#"# Asistente de bienvenida de Bradbit Editor

Eres el asistente que ayuda a un autor a crear un proyecto nuevo en Bradbit Editor.

## Tu objetivo
Conversar brevemente con el autor para elegir el tipo de proyecto, la plantilla y el nombre. Después dejas un borrador para que la app muestre la confirmación final.

## Reglas
- Habla en español, con frases breves y amables.
- Pregunta qué quiere escribir y recomienda una plantilla de la lista.
- Pregunta el nombre del proyecto.
- No crees carpetas, archivos de proyecto ni repositorios. La app los crea al confirmar.
- Puedes usar la herramienta `question` para presentar opciones, pero no es obligatorio.
- No uses la terminal ni escribas archivos que no sean el borrador indicado.
- Cuando tengas el nombre y la plantilla confirmados, escribe exactamente este archivo:

  `.bradbit/create-project.json`

  con este formato, sin texto adicional:

  ```json
  {{"name":"Nombre del proyecto","templateId":"guionista-kit"}}
  ```

- Después de escribir el archivo responde: "Listo. Revisa la tarjeta de confirmación para elegir la carpeta y crear el proyecto."

## Plantillas disponibles
{template_lines}
"#
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn template() -> WelcomeTemplate {
        WelcomeTemplate {
            id: "guionista-kit".to_string(),
            name: "Guion Audiovisual".to_string(),
            description: "Biblia, estructura y guion.".to_string(),
        }
    }

    #[test]
    fn prepares_a_clean_workspace_with_agent_instructions() {
        let dir = tempdir().unwrap();
        let root = dir.path().join(WORKSPACE_DIR);
        let destination = dir.path().join("Documents/Bradbit");

        let workspace =
            prepare_workspace_in(&root, &[template()], &destination).expect("workspace");

        assert_eq!(workspace.path, root.to_string_lossy());
        assert_eq!(workspace.default_destination, destination.to_string_lossy());
        let instructions = fs::read_to_string(root.join("AGENTS.md")).unwrap();
        assert!(instructions.contains("Asistente de bienvenida"));
        assert!(instructions.contains("`guionista-kit`"));
        assert!(instructions.contains(".bradbit/create-project.json"));
    }

    #[test]
    fn reads_a_valid_project_request_and_rejects_empty_fields() {
        let dir = tempdir().unwrap();
        let root = dir.path().join(WORKSPACE_DIR);
        prepare_workspace_in(&root, &[template()], &dir.path().join("out")).unwrap();

        assert_eq!(read_project_request_in(&root).unwrap(), None);

        fs::write(
            root.join(REQUEST_RELATIVE),
            r#"{"name":"  Mi guion  ","templateId":" guionista-kit "}"#,
        )
        .unwrap();
        assert_eq!(
            read_project_request_in(&root).unwrap(),
            Some(WelcomeProjectRequest {
                name: "Mi guion".to_string(),
                template_id: "guionista-kit".to_string(),
            })
        );

        fs::write(
            root.join(REQUEST_RELATIVE),
            "```json\n{\"name\":\"Serie\",\"template\":\"guionista-kit\"}\n```",
        )
        .unwrap();
        assert_eq!(
            read_project_request_in(&root).unwrap().unwrap().name,
            "Serie"
        );

        fs::write(
            root.join(REQUEST_RELATIVE),
            r#"{"name":"","templateId":"guionista-kit"}"#,
        )
        .unwrap();
        assert!(read_project_request_in(&root).is_err());

        fs::write(root.join(REQUEST_RELATIVE), "not json").unwrap();
        assert!(read_project_request_in(&root).is_err());
    }
}
