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
    #[serde(default)]
    pub brief: String,
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
    let brief = value
        .get("brief")
        .or_else(|| value.get("summary"))
        .or_else(|| value.get("resumen"))
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default()
        .trim();
    if name.is_empty() || template_id.is_empty() {
        return Err("The project request needs a name and a templateId".to_string());
    }
    Ok(WelcomeProjectRequest {
        name: name.to_string(),
        template_id: template_id.to_string(),
        brief: brief.to_string(),
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

Eres el asistente que ayuda a un autor a preparar el brief de un proyecto nuevo.

## Tu objetivo
Conversar con el autor para entender qué quiere escribir y ayudarle a convertir la idea en un brief claro. Puedes preguntar por el formato, la audiencia, el tono, la extensión y los entregables. Al final, propone un nombre y una plantilla adecuada de la lista.

## Reglas
- Habla en el idioma del autor, con frases breves y amables.
- Haz una o dos preguntas por turno; no interrogues con una lista larga.
- No crees carpetas, archivos de proyecto ni repositorios. La app se encarga de crear el proyecto.
- La única escritura permitida es el archivo de borrador `.bradbit/create-project.json` descrito abajo.
- No uses la terminal.
- No digas que el proyecto ya está creado.
- Cuando el brief esté claro, resume las decisiones en pocas líneas y sugiere un nombre y una plantilla.
- La app puede mostrarte una nota como [Plantilla: Guionista]. Si aparece, respeta esa elección y no vuelvas a preguntar por la plantilla.
- Si la nota dice [Plantilla: Decidir en el chat], ayuda al autor a elegir entre las plantillas disponibles.

## Entregable
Cuando el brief esté completo, escribe exactamente `.bradbit/create-project.json` con este formato. No añadas texto fuera del JSON dentro del archivo:

```json
{{"name":"Nombre del proyecto","templateId":"guionista-kit","brief":"Brief completo en Markdown: idea, formato, audiencia, tono, decisiones tomadas y entregables."}}
```

- Usa `blank` como `templateId` solo si el autor eligió un proyecto en blanco.
- El `brief` debe ser autosuficiente: la app lo cargará en el chat del proyecto.
- Después de escribir el archivo responde: "Listo. Revisa la tarjeta para confirmar la carpeta y crear el proyecto."

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
        assert!(instructions.contains("brief"));
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
                brief: String::new(),
            })
        );

        fs::write(
            root.join(REQUEST_RELATIVE),
            "```json\n{\"name\":\"Serie\",\"template\":\"guionista-kit\",\"brief\":\"Una serie sobre el mar.\"}\n```",
        )
        .unwrap();
        let series = read_project_request_in(&root).unwrap().unwrap();
        assert_eq!(series.name, "Serie");
        assert_eq!(series.brief, "Una serie sobre el mar.");

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
