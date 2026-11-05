use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_RECENTS: usize = 10;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub language: String,
    pub theme: String,
    pub font_size: u32,
    pub word_wrap: bool,
    pub line_numbers: bool,
    pub show_config_files: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            language: "es".to_string(),
            theme: "dark".to_string(),
            font_size: 15,
            word_wrap: true,
            line_numbers: false,
            show_config_files: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecentProject {
    pub path: String,
    pub name: String,
    pub last_opened: String,
}

fn config_dir() -> Result<PathBuf, String> {
    if let Ok(custom) = std::env::var("BRADBIT_CONFIG_DIR") {
        let p = PathBuf::from(custom);
        fs::create_dir_all(&p).map_err(|e| e.to_string())?;
        return Ok(p);
    }
    let base = dirs::config_dir()
        .ok_or_else(|| "No se encontró el directorio de configuración".to_string())?;
    let dir = base.join("Bradbit");
    fs::create_dir_all(&dir).map_err(|e| format!("No se pudo crear directorio Bradbit: {}", e))?;
    Ok(dir)
}

pub fn load_settings() -> Result<AppSettings, String> {
    let path = config_dir()?.join("settings.json");
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let raw =
        fs::read_to_string(&path).map_err(|e| format!("Error leyendo settings.json: {}", e))?;
    serde_json::from_str(&raw).map_err(|e| format!("settings.json inválido: {}", e))
}

pub fn save_settings(settings: &AppSettings) -> Result<(), String> {
    let path = config_dir()?.join("settings.json");
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| format!("No se pudo guardar settings.json: {}", e))
}

pub fn list_recent_projects() -> Result<Vec<RecentProject>, String> {
    let path = config_dir()?.join("recent-projects.json");
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(&path).unwrap_or_default();
    let list: Vec<RecentProject> = serde_json::from_str(&raw).unwrap_or_default();
    Ok(list
        .into_iter()
        .filter(|r| PathBuf::from(&r.path).is_dir())
        .collect())
}

pub fn record_recent_project(project_path: &str, name: &str) -> Result<Vec<RecentProject>, String> {
    let mut current = list_recent_projects().unwrap_or_default();
    current.retain(|item| item.path != project_path);
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string());
    current.insert(
        0,
        RecentProject {
            path: project_path.to_string(),
            name: name.to_string(),
            last_opened: ts,
        },
    );
    current.truncate(MAX_RECENTS);
    let path = config_dir()?.join("recent-projects.json");
    let json = serde_json::to_string_pretty(&current).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(current)
}

pub fn remove_recent_project(project_path: &str) -> Result<Vec<RecentProject>, String> {
    let mut current = list_recent_projects().unwrap_or_default();
    current.retain(|item| item.path != project_path);
    let path = config_dir()?.join("recent-projects.json");
    let json = serde_json::to_string_pretty(&current).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(current)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn saves_and_loads_settings_and_recents() {
        let cfg_tmp = TempDir::new().unwrap();
        let proj_tmp = TempDir::new().unwrap();
        std::env::set_var("BRADBIT_CONFIG_DIR", cfg_tmp.path());

        let defaults = load_settings().unwrap();
        assert_eq!(defaults.language, "es");
        assert!(!defaults.show_config_files);

        let updated = AppSettings {
            language: "en".to_string(),
            theme: "light".to_string(),
            font_size: 18,
            word_wrap: false,
            line_numbers: true,
            show_config_files: true,
        };
        save_settings(&updated).unwrap();
        assert_eq!(load_settings().unwrap(), updated);

        let proj_path = proj_tmp.path().to_str().unwrap();
        let recents = record_recent_project(proj_path, "mi-guion").unwrap();
        assert_eq!(recents.len(), 1);
        assert_eq!(recents[0].name, "mi-guion");

        let after_remove = remove_recent_project(proj_path).unwrap();
        assert!(after_remove.is_empty());
    }
}
