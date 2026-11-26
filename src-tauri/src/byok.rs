//! Bring-your-own-key providers for the Bradbit agent runtime.
//!
//! Provider metadata lives in `settings.json`; API keys live in the macOS
//! Keychain. The editor injects keys into `bradbit serve` through environment
//! variables declared by each provider. Custom OpenAI-compatible providers
//! also receive an inline `OPENCODE_CONFIG_CONTENT` with their base URL and
//! model. Keys never touch project files, settings, logs or argv.

use std::collections::HashSet;
use std::path::Path;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

use crate::git::redact_secrets;
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

/// Provider metadata used by the guided connection test. The key is passed
/// separately and is never stored by this module.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ByokTestProvider {
    pub kind: String,
    pub base_url: Option<String>,
    pub model: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ByokTestResult {
    pub ok: bool,
    pub status: Option<u16>,
    pub model_count: usize,
    pub error: Option<String>,
}

struct ConnectionTarget {
    url: String,
    headers: Vec<(&'static str, String)>,
}

/// Validate a key against the selected provider without saving anything.
/// Invalid input is returned as `Err`; HTTP failures are returned as a
/// structured `ByokTestResult` so the UI can localize them.
pub fn test_connection(provider: &ByokTestProvider, key: &str) -> Result<ByokTestResult, String> {
    validate_secret(key)?;
    let target = connection_target(provider, key)?;
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(20)))
        .http_status_as_error(false)
        .build()
        .into();
    let mut request = agent.get(&target.url);
    for (name, value) in &target.headers {
        request = request.header(*name, value);
    }
    match request.call() {
        Ok(mut response) => {
            let status = response.status().as_u16();
            let body = response.body_mut().read_to_string().unwrap_or_default();
            let mut result = classify_connection_response(status, &body);
            if let Some(error) = result.error.as_mut() {
                if !key.is_empty() {
                    *error = error.replace(key, "***");
                }
            }
            Ok(result)
        }
        Err(error) => Ok(ByokTestResult {
            ok: false,
            status: None,
            model_count: 0,
            error: Some(if matches!(error, ureq::Error::Timeout(_)) {
                "timeout".to_string()
            } else {
                redact_secrets(&error.to_string())
            }),
        }),
    }
}

fn connection_target(provider: &ByokTestProvider, key: &str) -> Result<ConnectionTarget, String> {
    let metadata = ByokProvider {
        id: "connection-test".to_string(),
        name: "Connection test".to_string(),
        kind: provider.kind.clone(),
        base_url: provider.base_url.clone(),
        model: provider.model.clone(),
        env_var: "BRADBIT_CONNECTION_TEST_API_KEY".to_string(),
    };
    validate_provider(&metadata)?;

    let bearer = || vec![("Authorization", format!("Bearer {key}"))];
    let (url, headers) = match provider.kind.as_str() {
        "deepseek" => ("https://api.deepseek.com/models".to_string(), bearer()),
        "openrouter" => ("https://openrouter.ai/api/v1/key".to_string(), bearer()),
        "openai" => ("https://api.openai.com/v1/models".to_string(), bearer()),
        "anthropic" => (
            "https://api.anthropic.com/v1/models".to_string(),
            vec![
                ("x-api-key", key.to_string()),
                ("anthropic-version", "2023-06-01".to_string()),
            ],
        ),
        "opencode" => ("https://opencode.ai/console/api/user".to_string(), bearer()),
        "custom" => {
            let base = provider
                .base_url
                .as_deref()
                .ok_or_else(|| "Custom provider needs a base URL".to_string())?
                .trim()
                .trim_end_matches('/');
            let url = if base.ends_with("/models") {
                base.to_string()
            } else {
                format!("{base}/models")
            };
            (url, bearer())
        }
        _ => return Err("Unsupported provider kind".to_string()),
    };
    Ok(ConnectionTarget { url, headers })
}

/// Single completion used by small UI helpers (for example the version
/// composer's "write notes with AI" action). This is deliberately not an
/// agent loop: one prompt goes out, one short answer comes back, and the
/// result is returned to the caller for the author to edit.
pub fn complete(
    provider: &ByokProvider,
    model_override: Option<&str>,
    key: &str,
    prompt: &str,
    effort: Option<&str>,
) -> Result<String, String> {
    validate_provider(provider)?;
    validate_secret(key)?;
    let model = model_override
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .or_else(|| {
            provider
                .model
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
        })
        .ok_or_else(|| "The selected provider has no model configured".to_string())?;
    if prompt.trim().is_empty() {
        return Err("The prompt cannot be empty".to_string());
    }

    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(90)))
        .http_status_as_error(false)
        .build()
        .into();

    let reasoning_effort = effort.and_then(|value| effort_for_provider(&provider.kind, value));
    let (url, body, headers) = match provider.kind.as_str() {
        "deepseek" => openai_request(
            "https://api.deepseek.com/chat/completions",
            model,
            prompt,
            key,
            reasoning_effort,
        ),
        "openrouter" => openai_request(
            "https://openrouter.ai/api/v1/chat/completions",
            model,
            prompt,
            key,
            reasoning_effort,
        ),
        "openai" => openai_request(
            "https://api.openai.com/v1/chat/completions",
            model,
            prompt,
            key,
            reasoning_effort,
        ),
        "custom" => {
            let base = provider
                .base_url
                .as_deref()
                .ok_or_else(|| "Custom provider needs a base URL".to_string())?
                .trim()
                .trim_end_matches('/');
            let url = if base.ends_with("/chat/completions") {
                base.to_string()
            } else {
                format!("{base}/chat/completions")
            };
            openai_request(&url, model, prompt, key, reasoning_effort)
        }
        "anthropic" => {
            let body = json!({
                "model": model,
                "max_tokens": 4096,
                "messages": [{ "role": "user", "content": prompt }],
            });
            (
                "https://api.anthropic.com/v1/messages".to_string(),
                body,
                vec![
                    ("x-api-key", key.to_string()),
                    ("anthropic-version", "2023-06-01".to_string()),
                ],
            )
        }
        _ => return Err("This provider does not expose a text completion endpoint".to_string()),
    };

    let mut request = agent.post(&url).header("Content-Type", "application/json");
    for (name, value) in &headers {
        request = request.header(*name, value);
    }
    match request.send_json(body) {
        Ok(mut response) => {
            let status = response.status().as_u16();
            let raw = response.body_mut().read_to_string().unwrap_or_default();
            if !(200..300).contains(&status) {
                let payload: Option<Value> = serde_json::from_str(&raw).ok();
                let message = error_detail(status, payload.as_ref(), &raw);
                return Err(message.replace(key, "***"));
            }
            let payload: Value = serde_json::from_str(&raw)
                .map_err(|error| format!("The model returned invalid JSON: {error}"))?;
            let truncated = match provider.kind.as_str() {
                "anthropic" => {
                    payload.get("stop_reason").and_then(Value::as_str) == Some("max_tokens")
                }
                _ => {
                    payload
                        .pointer("/choices/0/finish_reason")
                        .and_then(Value::as_str)
                        == Some("length")
                }
            };
            let text = match provider.kind.as_str() {
                "anthropic" => payload
                    .get("content")
                    .and_then(Value::as_array)
                    .and_then(|items| {
                        items.iter().find_map(|item| {
                            (item.get("type").and_then(Value::as_str) == Some("text"))
                                .then(|| item.get("text").and_then(Value::as_str))
                                .flatten()
                        })
                    })
                    .map(str::to_string),
                _ => openai_completion_text(&payload),
            };
            match text
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
            {
                Some(value) => Ok(value),
                None if truncated => Err(
                    "The model ran out of tokens before answering. Try another model in Settings."
                        .to_string(),
                ),
                None => Err(
                    "The model returned an empty answer. Try another model in Settings."
                        .to_string(),
                ),
            }
        }
        Err(error) => Err(redact_secrets(&error.to_string())),
    }
}

fn openai_completion_text(payload: &Value) -> Option<String> {
    let content = payload.pointer("/choices/0/message/content");
    if let Some(text) = content.and_then(Value::as_str) {
        return Some(text.to_string());
    }
    if let Some(parts) = content.and_then(Value::as_array) {
        let joined = parts
            .iter()
            .filter_map(|part| {
                part.get("text")
                    .and_then(Value::as_str)
                    .or_else(|| part.get("content").and_then(Value::as_str))
            })
            .collect::<String>();
        if !joined.trim().is_empty() {
            return Some(joined);
        }
    }
    payload
        .pointer("/choices/0/text")
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn effort_for_provider(kind: &str, effort: &str) -> Option<&'static str> {
    let value = effort.trim().to_ascii_lowercase();
    match kind {
        "deepseek" | "custom" => match value.as_str() {
            "none" => Some("none"),
            "low" => Some("low"),
            "high" => Some("high"),
            "max" => Some("max"),
            _ => None,
        },
        "openrouter" => match value.as_str() {
            "none" => Some("none"),
            "low" => Some("low"),
            "high" => Some("high"),
            "max" => Some("xhigh"),
            _ => None,
        },
        "openai" => match value.as_str() {
            "none" => Some("minimal"),
            "low" => Some("low"),
            "high" => Some("high"),
            "max" => Some("high"),
            _ => None,
        },
        _ => None,
    }
}

fn openai_request(
    url: &str,
    model: &str,
    prompt: &str,
    key: &str,
    effort: Option<&str>,
) -> (String, Value, Vec<(&'static str, String)>) {
    let mut body = json!({
        "model": model,
        "temperature": 0.2,
        "max_tokens": 4096,
        "messages": [{ "role": "user", "content": prompt }],
    });
    if let Some(effort) = effort {
        body["reasoning_effort"] = json!(effort);
    }
    (
        url.to_string(),
        body,
        vec![("Authorization", format!("Bearer {key}"))],
    )
}

fn classify_connection_response(status: u16, body: &str) -> ByokTestResult {
    let payload: Option<Value> = serde_json::from_str(body).ok();
    let model_count = payload
        .as_ref()
        .and_then(|value| value.get("data"))
        .and_then(Value::as_array)
        .map(Vec::len)
        .unwrap_or(0);
    let ok = (200..300).contains(&status);
    ByokTestResult {
        ok,
        status: Some(status),
        model_count,
        error: if ok {
            None
        } else {
            Some(error_detail(status, payload.as_ref(), body))
        },
    }
}

fn error_detail(status: u16, payload: Option<&Value>, body: &str) -> String {
    for pointer in ["/error/message", "/message"] {
        if let Some(message) = payload
            .and_then(|value| value.pointer(pointer))
            .and_then(Value::as_str)
        {
            return redact_secrets(message);
        }
    }
    let trimmed = body.trim();
    if trimmed.is_empty() {
        format!("HTTP {status}")
    } else {
        let snippet: String = trimmed.chars().take(300).collect();
        format!("HTTP {status}: {}", redact_secrets(&snippet))
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

    fn test_provider(kind: &str, base_url: Option<&str>, model: Option<&str>) -> ByokTestProvider {
        ByokTestProvider {
            kind: kind.to_string(),
            base_url: base_url.map(str::to_string),
            model: model.map(str::to_string),
        }
    }

    #[test]
    fn connection_targets_are_provider_specific() {
        let deepseek =
            connection_target(&test_provider("deepseek", None, None), "sk-test").unwrap();
        assert_eq!(deepseek.url, "https://api.deepseek.com/models");
        assert_eq!(
            deepseek.headers,
            vec![("Authorization", "Bearer sk-test".to_string())]
        );

        let anthropic =
            connection_target(&test_provider("anthropic", None, None), "sk-ant").unwrap();
        assert_eq!(anthropic.url, "https://api.anthropic.com/v1/models");
        assert_eq!(
            anthropic.headers,
            vec![
                ("x-api-key", "sk-ant".to_string()),
                ("anthropic-version", "2023-06-01".to_string())
            ]
        );

        let custom = connection_target(
            &test_provider("custom", Some("https://api.example.com/v1/"), Some("m")),
            "sk-custom",
        )
        .unwrap();
        assert_eq!(custom.url, "https://api.example.com/v1/models");

        let custom_with_models = connection_target(
            &test_provider(
                "custom",
                Some("https://api.example.com/v1/models"),
                Some("m"),
            ),
            "sk-custom",
        )
        .unwrap();
        assert_eq!(custom_with_models.url, "https://api.example.com/v1/models");
    }

    #[test]
    fn classifies_success_invalid_keys_and_redacts_errors() {
        let ok = classify_connection_response(200, r#"{"data":[{"id":"a"},{"id":"b"}]}"#);
        assert!(ok.ok);
        assert_eq!(ok.status, Some(200));
        assert_eq!(ok.model_count, 2);
        assert!(ok.error.is_none());

        let invalid =
            classify_connection_response(401, r#"{"error":{"message":"Incorrect API key"}}"#);
        assert!(!invalid.ok);
        assert_eq!(invalid.status, Some(401));
        assert!(invalid.error.unwrap().contains("Incorrect"));

        let leaked =
            classify_connection_response(500, r#"{"message":"failed with ghp_supersecret"}"#);
        let message = leaked.error.unwrap();
        assert!(!message.contains("ghp_supersecret"), "{message}");
        assert!(message.contains("***"), "{message}");
    }

    #[test]
    fn connection_test_rejects_invalid_inputs_before_network() {
        assert!(test_connection(&test_provider("unknown", None, None), "sk").is_err());
        assert!(test_connection(&test_provider("deepseek", None, None), "  ").is_err());
        assert!(test_connection(
            &test_provider("custom", Some("file:///tmp/api"), Some("m")),
            "sk"
        )
        .is_err());
        assert!(test_connection(
            &test_provider("custom", Some("https://api.example.com"), None),
            "sk"
        )
        .is_err());
    }

    #[test]
    #[ignore = "network"]
    fn provider_endpoints_reject_invalid_keys() {
        let result = test_connection(
            &test_provider("deepseek", None, None),
            "sk-invalid-bradbit-test",
        )
        .unwrap();
        assert!(!result.ok);
        assert!(matches!(result.status, Some(401) | Some(403)), "{result:?}");
    }

    #[test]
    fn complete_rejects_missing_models_and_unknown_endpoints() {
        let mut item = provider("p", "deepseek", "DEEPSEEK_KEY");
        assert!(complete(&item, None, "sk-bradbit-test-key", "hola", None)
            .unwrap_err()
            .contains("model"));

        item.model = Some("deepseek-chat".to_string());
        item.kind = "opencode".to_string();
        assert!(complete(&item, None, "sk-bradbit-test-key", "hola", None)
            .unwrap_err()
            .contains("completion"));
    }

    #[test]
    fn openai_completion_text_accepts_strings_arrays_and_legacy_text() {
        let string = json!({"choices": [{"message": {"content": "hola"}}]});
        assert_eq!(openai_completion_text(&string).as_deref(), Some("hola"));
        let array = json!({"choices": [{"message": {"content": [
            {"type": "text", "text": "gato"},
            {"type": "text", "text": "s"}
        ]}}]});
        assert_eq!(openai_completion_text(&array).as_deref(), Some("gatos"));
        let legacy = json!({"choices": [{"text": "antiguo"}]});
        assert_eq!(openai_completion_text(&legacy).as_deref(), Some("antiguo"));
        let empty = json!({"choices": [{"message": {"content": null}}]});
        assert_eq!(openai_completion_text(&empty), None);
    }

    #[test]
    fn normalizes_effort_for_each_provider() {
        assert_eq!(effort_for_provider("deepseek", "low"), Some("low"));
        assert_eq!(effort_for_provider("deepseek", "max"), Some("max"));
        assert_eq!(effort_for_provider("deepseek", "medium"), None);
        assert_eq!(effort_for_provider("openrouter", "max"), Some("xhigh"));
        assert_eq!(effort_for_provider("openai", "none"), Some("minimal"));
        assert_eq!(effort_for_provider("anthropic", "low"), None);
    }

    #[test]
    fn openai_request_builds_a_chat_completion_body() {
        let (url, body, headers) = openai_request(
            "https://example.test/v1/chat/completions",
            "modelo",
            "hola",
            "secreto",
            Some("low"),
        );
        assert_eq!(url, "https://example.test/v1/chat/completions");
        assert_eq!(body["model"], "modelo");
        assert_eq!(body["messages"][0]["content"], "hola");
        assert_eq!(body["max_tokens"], 4096);
        assert_eq!(body["reasoning_effort"], "low");
        assert_eq!(headers[0].0, "Authorization");
        assert_eq!(headers[0].1, "Bearer secreto");
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
