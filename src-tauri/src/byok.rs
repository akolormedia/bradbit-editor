//! Bring-your-own-key providers for the Bradbit agent runtime.
//!
//! Provider metadata lives in `settings.json`; API keys live in the macOS
//! Keychain. The editor injects keys into `bradbit serve` through environment
//! variables declared by each provider. Custom OpenAI-compatible providers
//! also receive an inline `OPENCODE_CONFIG_CONTENT` with their base URL and
//! model. Keys never touch project files, settings, logs or argv.

use std::collections::HashSet;
use std::path::Path;

use serde::Serialize;
use serde_json::{json, Map, Value};

use crate::github::secrets::{CachedSecretStore, OsKeychain, SecretStore};
use crate::settings::{AppSettings, ByokProvider};

pub const ACCOUNT_PREFIX: &str = "byok:";
const PROVIDER_KINDS: &[&str] = &[
    "deepseek",
    "openrouter",
    "openai",
    "anthropic",
    "opencode",
    "custom",
];

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ByokProviderStatus {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub base_url: Option<String>,
    pub model: Option<String>,
    pub env_var: String,
    pub has_key: bool,
}

pub struct ByokSecrets {
    store: CachedSecretStore,
}

impl Default for ByokSecrets {
    fn default() -> Self {
        Self::new()
    }
}

impl ByokSecrets {
    pub fn new() -> Self {
        Self {
            store: CachedSecretStore::new(Box::new(OsKeychain::new())),
        }
    }

    pub fn with_store(store: Box<dyn SecretStore>) -> Self {
        Self {
            store: CachedSecretStore::new(store),
        }
    }

    fn account(provider_id: &str) -> Result<String, String> {
        validate_provider_id(provider_id)?;
        Ok(format!("{ACCOUNT_PREFIX}{provider_id}"))
    }

    pub fn get(&self, provider_id: &str) -> Result<Option<String>, String> {
        let account = Self::account(provider_id)?;
        self.store
            .get(&account)
            .map_err(|error| format!("Could not read the API key: {error}"))
    }

    pub fn set(&self, provider_id: &str, key: &str) -> Result<(), String> {
        let account = Self::account(provider_id)?;
        validate_secret(key)?;
        self.store
            .set(&account, key.trim())
            .map_err(|error| format!("Could not save the API key: {error}"))
    }

    pub fn delete(&self, provider_id: &str) -> Result<(), String> {
        let account = Self::account(provider_id)?;
        self.store
            .delete(&account)
            .map_err(|error| format!("Could not delete the API key: {error}"))
    }
}

pub fn statuses(
    settings: &AppSettings,
    secrets: &ByokSecrets,
) -> Result<Vec<ByokProviderStatus>, String> {
    validate_providers(&settings.byok_providers)?;
    settings
        .byok_providers
        .iter()
        .map(|provider| {
            Ok(ByokProviderStatus {
                id: provider.id.clone(),
                name: provider.name.clone(),
                kind: provider.kind.clone(),
                base_url: provider.base_url.clone(),
                model: provider.model.clone(),
                env_var: provider.env_var.clone(),
                has_key: secrets.get(&provider.id)?.is_some(),
            })
        })
        .collect()
}

/// Environment variables for `bradbit serve`. Missing keys are skipped.
pub fn runtime_env(
    settings: &AppSettings,
    secrets: &ByokSecrets,
) -> Result<Vec<(String, String)>, String> {
    validate_providers(&settings.byok_providers)?;
    let mut seen = HashSet::new();
    let mut env = Vec::new();
    for provider in &settings.byok_providers {
        if !seen.insert(provider.env_var.clone()) {
            return Err(format!(
                "Providers cannot share the environment variable {}",
                provider.env_var
            ));
        }
        if let Some(key) = secrets.get(&provider.id)? {
            env.push((provider.env_var.clone(), key));
        }
    }
    Ok(env)
}

/// Inline OpenCode config for custom providers and ambient instructions,
/// merged with any existing `OPENCODE_CONFIG_CONTENT`. Returns `None` when
/// there is nothing to add.
pub fn config_content(
    settings: &AppSettings,
    language_policy: Option<&Path>,
    general_skills: Option<&Path>,
) -> Result<Option<String>, String> {
    let existing = std::env::var("OPENCODE_CONFIG_CONTENT").ok();
    config_content_with(
        settings,
        existing.as_deref(),
        language_policy,
        general_skills,
    )
}

fn config_content_with(
    settings: &AppSettings,
    existing: Option<&str>,
    language_policy: Option<&Path>,
    general_skills: Option<&Path>,
) -> Result<Option<String>, String> {
    validate_providers(&settings.byok_providers)?;
    let custom: Vec<&ByokProvider> = settings
        .byok_providers
        .iter()
        .filter(|provider| provider.kind == "custom")
        .collect();
    if custom.is_empty() && language_policy.is_none() && general_skills.is_none() {
        return Ok(None);
    }

    let mut root = match existing.map(str::trim).filter(|value| !value.is_empty()) {
        Some(raw) => serde_json::from_str::<Value>(raw)
            .map_err(|error| format!("OPENCODE_CONFIG_CONTENT is not valid JSON: {error}"))?,
        None => json!({}),
    };
    if !root.is_object() {
        return Err("OPENCODE_CONFIG_CONTENT must be a JSON object".to_string());
    }
    let object = root.as_object_mut().expect("validated object");

    if !custom.is_empty() {
        let providers = object
            .entry("providers")
            .or_insert_with(|| Value::Object(Map::new()));
        if !providers.is_object() {
            return Err("OPENCODE_CONFIG_CONTENT providers must be an object".to_string());
        }
        let providers = providers.as_object_mut().expect("validated providers");

        for provider in custom {
            let base_url = provider
                .base_url
                .as_deref()
                .ok_or_else(|| format!("Custom provider '{}' needs a base URL", provider.name))?;
            let model = provider
                .model
                .as_deref()
                .ok_or_else(|| format!("Custom provider '{}' needs a model", provider.name))?;
            providers.insert(
                provider.id.clone(),
                json!({
                    "name": provider.name,
                    "package": "@opencode/ai/providers/openai-compatible",
                    "env": [provider.env_var],
                    "settings": { "baseURL": base_url },
                    "models": {
                        model: {
                            "name": model,
                            "modelID": model,
                            "type": "chat"
                        }
                    }
                }),
            );
        }
    }

    if let Some(path) = language_policy {
        let instructions = object
            .entry("instructions")
            .or_insert_with(|| Value::Array(Vec::new()));
        let array = instructions
            .as_array_mut()
            .ok_or_else(|| "OPENCODE_CONFIG_CONTENT instructions must be an array".to_string())?;
        let value = path.to_string_lossy().to_string();
        if !array
            .iter()
            .any(|item| item.as_str().map(|item| item == value).unwrap_or(false))
        {
            array.push(Value::String(value));
        }
    }

    if let Some(path) = general_skills {
        let skills = object
            .entry("skills")
            .or_insert_with(|| Value::Array(Vec::new()));
        let array = skills
            .as_array_mut()
            .ok_or_else(|| "OPENCODE_CONFIG_CONTENT skills must be an array".to_string())?;
        let value = path.to_string_lossy().to_string();
        if !array
            .iter()
            .any(|item| item.as_str().map(|item| item == value).unwrap_or(false))
        {
            array.push(Value::String(value));
        }

        let commands = object
            .entry("commands")
            .or_insert_with(|| Value::Object(Map::new()));
        let map = commands
            .as_object_mut()
            .ok_or_else(|| "OPENCODE_CONFIG_CONTENT commands must be an object".to_string())?;
        if let Some(definitions) = crate::git_assistant::commands().as_object() {
            for (name, definition) in definitions {
                map.insert(name.clone(), definition.clone());
            }
        }
    }

    serde_json::to_string(&root)
        .map(Some)
        .map_err(|error| format!("Could not serialize the provider configuration: {error}"))
}

fn validate_providers(providers: &[ByokProvider]) -> Result<(), String> {
    let mut ids = HashSet::new();
    let mut env_vars = HashSet::new();
    for provider in providers {
        validate_provider(provider)?;
        if !ids.insert(provider.id.clone()) {
            return Err(format!("Duplicate provider id: {}", provider.id));
        }
        if !env_vars.insert(provider.env_var.clone()) {
            return Err(format!(
                "Providers cannot share the environment variable {}",
                provider.env_var
            ));
        }
    }
    Ok(())
}

fn validate_provider(provider: &ByokProvider) -> Result<(), String> {
    validate_provider_id(&provider.id)?;
    if provider.name.trim().is_empty() || provider.name.chars().count() > 80 {
        return Err(format!("Provider '{}' needs a name", provider.id));
    }
    if !PROVIDER_KINDS.contains(&provider.kind.as_str()) {
        return Err(format!(
            "Provider '{}' has an unsupported kind",
            provider.id
        ));
    }
    if !valid_env_var(&provider.env_var) {
        return Err(format!(
            "Provider '{}' has an invalid environment variable",
            provider.id
        ));
    }
    if provider.kind == "custom" {
        let base_url = provider
            .base_url
            .as_deref()
            .ok_or_else(|| format!("Custom provider '{}' needs a base URL", provider.name))?;
        let value = base_url.trim();
        let lower = value.to_ascii_lowercase();
        if value.len() > 2048
            || value.chars().any(char::is_whitespace)
            || !(lower.starts_with("http://") || lower.starts_with("https://"))
        {
            return Err(format!(
                "Custom provider '{}' must use an http(s) base URL",
                provider.name
            ));
        }
        let model = provider
            .model
            .as_deref()
            .ok_or_else(|| format!("Custom provider '{}' needs a model", provider.name))?;
        if model.trim().is_empty()
            || model.chars().count() > 120
            || model.chars().any(char::is_control)
        {
            return Err(format!(
                "Custom provider '{}' has an invalid model",
                provider.name
            ));
        }
    }
    Ok(())
}

fn validate_provider_id(id: &str) -> Result<(), String> {
    if id.is_empty()
        || id.len() > 64
        || !id.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '-' || character == '_'
        })
    {
        return Err(
            "Provider ids can only contain letters, numbers, hyphens and underscores".to_string(),
        );
    }
    Ok(())
}

fn validate_secret(secret: &str) -> Result<(), String> {
    let value = secret.trim();
    if value.is_empty() {
        return Err("The API key cannot be empty".to_string());
    }
    if value.len() > 16_384 || value.chars().any(|character| character.is_control()) {
        return Err("The API key contains invalid characters".to_string());
    }
    Ok(())
}

fn valid_env_var(name: &str) -> bool {
    let mut characters = name.chars();
    let Some(first) = characters.next() else {
        return false;
    };
    (first.is_ascii_uppercase() || first == '_')
        && characters.all(|character| {
            character.is_ascii_uppercase() || character.is_ascii_digit() || character == '_'
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::github::secrets::MemorySecretStore;

    fn provider(id: &str, kind: &str, env_var: &str) -> ByokProvider {
        ByokProvider {
            id: id.to_string(),
            name: id.to_string(),
            kind: kind.to_string(),
            base_url: None,
            model: None,
            env_var: env_var.to_string(),
        }
    }

    fn custom() -> ByokProvider {
        ByokProvider {
            id: "mi-api".to_string(),
            name: "Mi API".to_string(),
            kind: "custom".to_string(),
            base_url: Some("https://api.example.com/v1".to_string()),
            model: Some("mi-modelo".to_string()),
            env_var: "BRADBIT_MI_API_API_KEY".to_string(),
        }
    }

    fn secrets() -> ByokSecrets {
        ByokSecrets::with_store(Box::new(MemorySecretStore::default()))
    }

    #[test]
    fn stores_keys_in_the_secret_store_and_reports_status() {
        let settings = AppSettings {
            byok_providers: vec![provider("deepseek", "deepseek", "DEEPSEEK_API_KEY")],
            ..Default::default()
        };
        let secrets = secrets();
        secrets.set("deepseek", "sk-deepseek").unwrap();

        let status = statuses(&settings, &secrets).unwrap();
        assert_eq!(status.len(), 1);
        assert!(status[0].has_key);

        let env = runtime_env(&settings, &secrets).unwrap();
        assert_eq!(
            env,
            vec![("DEEPSEEK_API_KEY".to_string(), "sk-deepseek".to_string())]
        );

        secrets.delete("deepseek").unwrap();
        assert!(!statuses(&settings, &secrets).unwrap()[0].has_key);
    }

    #[test]
    fn skips_providers_without_a_key() {
        let settings = AppSettings {
            byok_providers: vec![provider("deepseek", "deepseek", "DEEPSEEK_API_KEY")],
            ..Default::default()
        };
        assert!(runtime_env(&settings, &secrets()).unwrap().is_empty());
    }

    #[test]
    fn builds_custom_provider_config_without_exposing_the_key() {
        let settings = AppSettings {
            byok_providers: vec![custom()],
            ..Default::default()
        };
        let content = config_content_with(&settings, None, None, None)
            .unwrap()
            .unwrap();
        assert!(content.contains("https://api.example.com/v1"));
        assert!(content.contains("BRADBIT_MI_API_API_KEY"));
        assert!(content.contains("mi-modelo"));
        assert!(!content.contains("sk-"));
    }

    #[test]
    fn merges_existing_config_content() {
        let settings = AppSettings {
            byok_providers: vec![custom()],
            ..Default::default()
        };
        let existing =
            r#"{"model":"deepseek/deepseek-chat","providers":{"other":{"name":"Other"}}}"#;
        let content = config_content_with(&settings, Some(existing), None, None)
            .unwrap()
            .unwrap();
        let parsed: Value = serde_json::from_str(&content).unwrap();
        assert_eq!(parsed["model"], "deepseek/deepseek-chat");
        assert_eq!(parsed["providers"]["other"]["name"], "Other");
        assert_eq!(
            parsed["providers"]["mi-api"]["env"][0],
            "BRADBIT_MI_API_API_KEY"
        );
    }

    #[test]
    fn adds_the_language_policy_without_custom_providers() {
        let settings = AppSettings::default();
        let content = config_content_with(
            &settings,
            None,
            Some(Path::new("/tmp/agent-language.md")),
            None,
        )
        .unwrap()
        .unwrap();
        let parsed: Value = serde_json::from_str(&content).unwrap();
        assert_eq!(parsed["instructions"][0], "/tmp/agent-language.md");
        assert!(parsed.get("providers").is_none());
    }

    #[test]
    fn merges_the_language_policy_with_existing_instructions() {
        let settings = AppSettings {
            byok_providers: vec![custom()],
            ..Default::default()
        };
        let existing = r#"{"instructions":["/tmp/existing.md"]}"#;
        let content = config_content_with(
            &settings,
            Some(existing),
            Some(Path::new("/tmp/agent-language.md")),
            None,
        )
        .unwrap()
        .unwrap();
        let parsed: Value = serde_json::from_str(&content).unwrap();
        assert_eq!(
            parsed["instructions"],
            json!(["/tmp/existing.md", "/tmp/agent-language.md"])
        );
        assert_eq!(
            parsed["providers"]["mi-api"]["env"][0],
            "BRADBIT_MI_API_API_KEY"
        );
    }

    #[test]
    fn skips_config_content_when_nothing_is_added() {
        assert!(
            config_content_with(&AppSettings::default(), None, None, None)
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn merges_general_skills_and_commands() {
        let settings = AppSettings::default();
        let content = config_content_with(
            &settings,
            None,
            None,
            Some(Path::new("/tmp/bradbit-skills")),
        )
        .unwrap()
        .unwrap();
        let parsed: Value = serde_json::from_str(&content).unwrap();
        assert_eq!(parsed["skills"][0], "/tmp/bradbit-skills");
        assert!(parsed["commands"]["save-version"]["template"]
            .as_str()
            .unwrap()
            .contains("git-versioning"));
        assert_eq!(
            parsed["commands"]["history"]["description"],
            "Summarizes the recent saved versions of the project."
        );
    }

    #[test]
    fn rejects_duplicate_ids_and_environment_variables() {
        let secrets = secrets();
        let shared = AppSettings {
            byok_providers: vec![
                provider("uno", "deepseek", "SHARED_KEY"),
                provider("dos", "openrouter", "SHARED_KEY"),
            ],
            ..Default::default()
        };
        assert!(statuses(&shared, &secrets).unwrap_err().contains("share"));

        let duplicate = AppSettings {
            byok_providers: vec![
                provider("uno", "deepseek", "ONE_KEY"),
                provider("uno", "openrouter", "TWO_KEY"),
            ],
            ..Default::default()
        };
        assert!(statuses(&duplicate, &secrets)
            .unwrap_err()
            .contains("Duplicate"));
    }

    #[test]
    fn rejects_invalid_ids_keys_and_custom_endpoints() {
        let secrets = secrets();
        assert!(secrets
            .set("bad id", "sk-x")
            .unwrap_err()
            .contains("letters"));
        assert!(secrets
            .set("deepseek", "   ")
            .unwrap_err()
            .contains("empty"));
        assert!(secrets
            .set("deepseek", "sk-\nkey")
            .unwrap_err()
            .contains("invalid"));

        let settings = AppSettings {
            byok_providers: vec![{
                let mut item = custom();
                item.base_url = Some("file:///tmp/provider".to_string());
                item
            }],
            ..Default::default()
        };
        assert!(statuses(&settings, &secrets).unwrap_err().contains("http"));
    }

    #[test]
    fn custom_provider_requires_endpoint_and_model() {
        let secrets = secrets();
        let missing_url = AppSettings {
            byok_providers: vec![{
                let mut item = custom();
                item.base_url = None;
                item
            }],
            ..Default::default()
        };
        assert!(statuses(&missing_url, &secrets)
            .unwrap_err()
            .contains("base URL"));

        let missing_model = AppSettings {
            byok_providers: vec![{
                let mut item = custom();
                item.model = None;
                item
            }],
            ..Default::default()
        };
        assert!(statuses(&missing_model, &secrets)
            .unwrap_err()
            .contains("model"));
    }
}
