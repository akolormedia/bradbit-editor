//! GitHub REST client.
//!
//! Wire behavior follows the GitHub REST API: one JSON error envelope
//! (`message`/`status`), `Link` pagination, `Retry-After` on rate limits and
//! `404` masking some permission failures. Success means "GitHub answered 2xx
//! and the body parsed" — nothing else.
//!
//! The client is synchronous on purpose: the app calls it from Tauri command
//! threads, never from the UI thread. Tokens are only kept in
//! [`GitHubConfig`], whose `Debug` output is redacted.

use std::fmt;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::error::GitHubError;
use crate::git::redact_secrets;

pub const GITHUB_API_BASE_URL: &str = "https://api.github.com";
pub const GITHUB_API_VERSION: &str = "2022-11-28";

/// Connection settings for one GitHub-compatible host.
#[derive(Clone, PartialEq, Eq)]
pub struct GitHubConfig {
    pub base_url: String,
    token: String,
    pub timeout: Duration,
}

impl GitHubConfig {
    pub fn github_com(token: impl Into<String>) -> Self {
        Self {
            base_url: GITHUB_API_BASE_URL.to_string(),
            token: token.into(),
            timeout: Duration::from_secs(30),
        }
    }

    pub fn with_base_url(mut self, base_url: impl Into<String>) -> Self {
        self.base_url = base_url.into();
        self
    }

    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }
}

impl fmt::Debug for GitHubConfig {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("GitHubConfig")
            .field("base_url", &self.base_url)
            .field("token", &"<redacted>")
            .field("timeout", &self.timeout)
            .finish()
    }
}

/// The authenticated user (`GET /user`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub login: String,
}

/// Effective permissions the token has on a repository.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Permissions {
    pub admin: bool,
    pub push: bool,
    pub pull: bool,
}

/// A repository as the product needs it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Repository {
    pub full_name: String,
    pub name: String,
    pub default_branch: String,
    pub clone_url: String,
    pub html_url: String,
    pub private: bool,
    pub permissions: Option<Permissions>,
}

/// A branch with the commit it points at.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub name: String,
    pub sha: String,
    pub protected: bool,
}

/// Pull request state as GitHub reports it (`merged` PRs are `Closed`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PullRequestState {
    Open,
    Closed,
}

impl PullRequestState {
    pub fn as_str(self) -> &'static str {
        match self {
            PullRequestState::Open => "open",
            PullRequestState::Closed => "closed",
        }
    }

    pub fn parse(raw: &str) -> Result<Self, GitHubError> {
        match raw {
            "open" => Ok(PullRequestState::Open),
            "closed" => Ok(PullRequestState::Closed),
            other => Err(decode(format!("unknown PR state: {other}"))),
        }
    }
}

/// A pull request with the fields the sync UI needs.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PullRequest {
    pub number: u64,
    pub state: PullRequestState,
    pub merged: bool,
    pub title: String,
    pub html_url: String,
    pub head_ref: String,
    pub base_ref: String,
}

/// Input for `POST /user/repos`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewRepository {
    pub name: String,
    pub private: bool,
    pub description: Option<String>,
    /// Create an initial commit with an empty README.
    pub auto_init: bool,
}

impl NewRepository {
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            private: false,
            description: None,
            auto_init: false,
        }
    }

    pub fn private(mut self) -> Self {
        self.private = true;
        self
    }

    pub fn auto_init(mut self) -> Self {
        self.auto_init = true;
        self
    }
}

/// Input for `POST /repos/{owner}/{repo}/pulls`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewPullRequest {
    pub title: String,
    pub head: String,
    pub base: String,
    pub body: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Method {
    Get,
    Post,
}

/// One raw HTTP exchange: status, lowercased headers and body.
struct HttpReply {
    status: u16,
    headers: Vec<(String, String)>,
    body: String,
}

impl HttpReply {
    fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(key, _)| key == name)
            .map(|(_, value)| value.as_str())
    }
}

/// Synchronous GitHub REST client.
#[derive(Debug, Clone)]
pub struct GitHubClient {
    config: GitHubConfig,
    agent: ureq::Agent,
}

impl GitHubClient {
    pub fn new(config: GitHubConfig) -> Self {
        let agent = ureq::Agent::config_builder()
            .timeout_global(Some(config.timeout))
            // Non-2xx is data: read GitHub's JSON envelope and return a typed
            // error instead of a generic transport failure.
            .http_status_as_error(false)
            .build()
            .into();
        Self { config, agent }
    }

    /// `GET /user` — verifies auth and identifies the account.
    pub fn authenticated_user(&self) -> Result<User, GitHubError> {
        let reply = self.send(Method::Get, "/user", &[], None)?;
        let payload = expect_success(reply)?;
        Ok(User {
            login: req_str(&payload, "/login")?,
        })
    }

    /// `GET /user/repos` — paginated; each page holds up to 100 repositories.
    pub fn list_repositories(&self, max_pages: usize) -> Result<Vec<Repository>, GitHubError> {
        self.list_paginated(
            "/user/repos",
            &[("per_page", "100")],
            max_pages,
            parse_repository,
        )
    }

    /// `GET /repos/{owner}/{repo}`.
    pub fn get_repository(&self, owner: &str, repo: &str) -> Result<Repository, GitHubError> {
        validate_slug(owner, "propietario")?;
        validate_slug(repo, "repositorio")?;
        let reply = self.send(Method::Get, &format!("/repos/{owner}/{repo}"), &[], None)?;
        let payload = expect_success(reply)?;
        parse_repository(&payload)
    }

    /// `POST /user/repos` — creates a repository owned by the authenticated user.
    pub fn create_repository(&self, input: &NewRepository) -> Result<Repository, GitHubError> {
        if input.name.trim().is_empty() {
            return Err(GitHubError::Validation {
                detail: "the repository name cannot be empty".to_string(),
            });
        }
        let body = match &input.description {
            Some(description) => json!({
                "name": input.name.trim(),
                "private": input.private,
                "auto_init": input.auto_init,
                "description": description,
            }),
            None => json!({
                "name": input.name.trim(),
                "private": input.private,
                "auto_init": input.auto_init,
            }),
        };
        let reply = self.send(Method::Post, "/user/repos", &[], Some(&body))?;
        let payload = expect_success(reply)?;
        parse_repository(&payload)
    }

    /// `GET /repos/{owner}/{repo}/branches` — paginated.
    pub fn list_branches(
        &self,
        owner: &str,
        repo: &str,
        max_pages: usize,
    ) -> Result<Vec<Branch>, GitHubError> {
        validate_slug(owner, "propietario")?;
        validate_slug(repo, "repositorio")?;
        self.list_paginated(
            &format!("/repos/{owner}/{repo}/branches"),
            &[("per_page", "100")],
            max_pages,
            |item| {
                Ok(Branch {
                    name: req_str(item, "/name")?,
                    sha: req_str(item, "/commit/sha")?,
                    protected: opt_bool(item, "/protected").unwrap_or(false),
                })
            },
        )
    }

    /// `GET /repos/{owner}/{repo}/pulls?state=…` — paginated.
    pub fn list_pull_requests(
        &self,
        owner: &str,
        repo: &str,
        state: &str,
        max_pages: usize,
    ) -> Result<Vec<PullRequest>, GitHubError> {
        validate_slug(owner, "propietario")?;
        validate_slug(repo, "repositorio")?;
        match state {
            "open" | "closed" | "all" => {}
            other => {
                return Err(GitHubError::Validation {
                    detail: format!("invalid PR state: {other} (use open, closed or all)"),
                });
            }
        }
        self.list_paginated(
            &format!("/repos/{owner}/{repo}/pulls"),
            &[("per_page", "100"), ("state", state)],
            max_pages,
            parse_pull_request,
        )
    }

    /// `POST /repos/{owner}/{repo}/pulls`.
    pub fn create_pull_request(
        &self,
        owner: &str,
        repo: &str,
        input: &NewPullRequest,
    ) -> Result<PullRequest, GitHubError> {
        validate_slug(owner, "propietario")?;
        validate_slug(repo, "repositorio")?;
        if input.title.trim().is_empty() {
            return Err(GitHubError::Validation {
                detail: "the Pull Request title cannot be empty".to_string(),
            });
        }
        if input.head.trim().is_empty() || input.base.trim().is_empty() {
            return Err(GitHubError::Validation {
                detail: "the Pull Request branches cannot be empty".to_string(),
            });
        }
        let mut body = json!({
            "title": input.title.trim(),
            "head": input.head.trim(),
            "base": input.base.trim(),
        });
        if let Some(text) = &input.body {
            body["body"] = Value::String(text.clone());
        }
        let reply = self.send(
            Method::Post,
            &format!("/repos/{owner}/{repo}/pulls"),
            &[],
            Some(&body),
        )?;
        let payload = expect_success(reply)?;
        parse_pull_request(&payload)
    }

    // ------------------------------------------------------------------
    // Wire plumbing
    // ------------------------------------------------------------------

    fn with_common_headers<B>(&self, builder: ureq::RequestBuilder<B>) -> ureq::RequestBuilder<B> {
        builder
            .header("Authorization", &format!("Bearer {}", self.config.token))
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", GITHUB_API_VERSION)
    }

    fn send(
        &self,
        method: Method,
        path: &str,
        query: &[(&str, &str)],
        body: Option<&Value>,
    ) -> Result<HttpReply, GitHubError> {
        let base = self.config.base_url.trim_end_matches('/');
        let mut url = format!("{base}{path}");
        if !query.is_empty() {
            url.push('?');
            url.push_str(
                &query
                    .iter()
                    .map(|(key, value)| format!("{key}={value}"))
                    .collect::<Vec<_>>()
                    .join("&"),
            );
        }
        self.send_url(method, &url, body)
    }

    fn send_url(
        &self,
        method: Method,
        url: &str,
        body: Option<&Value>,
    ) -> Result<HttpReply, GitHubError> {
        let empty = json!({});
        let result = match method {
            Method::Get => self.with_common_headers(self.agent.get(url)).call(),
            Method::Post => self
                .with_common_headers(self.agent.post(url))
                .send_json(body.unwrap_or(&empty)),
        };
        match result {
            Ok(mut response) => {
                let status = response.status().as_u16();
                let headers = collect_headers(&response);
                let body = response
                    .body_mut()
                    .read_to_string()
                    .map_err(|error| decode(format!("cuerpo ilegible: {error}")))?;
                Ok(HttpReply {
                    status,
                    headers,
                    body,
                })
            }
            Err(error) => Err(GitHubError::Transport {
                detail: redact_secrets(&error.to_string()),
            }),
        }
    }

    fn list_paginated<T>(
        &self,
        path: &str,
        query: &[(&str, &str)],
        max_pages: usize,
        parse_item: impl Fn(&Value) -> Result<T, GitHubError>,
    ) -> Result<Vec<T>, GitHubError> {
        let pages = max_pages.max(1);
        let mut items = Vec::new();
        let mut next: Option<String> = None;
        for page in 0..pages {
            let reply = if page == 0 {
                self.send(Method::Get, path, query, None)?
            } else {
                match next.take() {
                    Some(url) => self.send_url(Method::Get, &url, None)?,
                    None => break,
                }
            };
            let link = reply.header("link").map(str::to_string);
            let payload = expect_success(reply)?;
            let array = payload
                .as_array()
                .ok_or_else(|| decode(format!("se esperaba una lista en `{path}`")))?;
            for item in array {
                items.push(parse_item(item)?);
            }
            next = link.and_then(|value| next_page_url(&value));
            if next.is_none() {
                break;
            }
            if let Some(next_url) = &next {
                if !self.is_same_api(next_url) {
                    return Err(decode(
                        "Pagination link outside the GitHub API host".to_string(),
                    ));
                }
            }
        }
        Ok(items)
    }

    fn is_same_api(&self, url: &str) -> bool {
        let base = self.config.base_url.trim_end_matches('/');
        url == base || url.starts_with(&format!("{base}/"))
    }
}

fn collect_headers(response: &ureq::http::Response<ureq::Body>) -> Vec<(String, String)> {
    response
        .headers()
        .iter()
        .map(|(name, value)| {
            (
                name.as_str().to_ascii_lowercase(),
                value.to_str().unwrap_or_default().to_string(),
            )
        })
        .collect()
}

/// Extract the next page URL from a `Link` header value.
fn next_page_url(link: &str) -> Option<String> {
    for part in link.split(',') {
        let mut segments = part.split(';');
        let target = segments
            .next()?
            .trim()
            .trim_start_matches('<')
            .trim_end_matches('>');
        let rel_is_next = segments.any(|segment| {
            let segment = segment.trim();
            segment == "rel=\"next\"" || segment == "rel=next"
        });
        if rel_is_next && target.starts_with("http") {
            return Some(target.to_string());
        }
    }
    None
}

/// Turn a 2xx reply into its JSON payload, or a typed error for every other
/// status. This is the single choke point where success is decided.
fn expect_success(reply: HttpReply) -> Result<Value, GitHubError> {
    if (200..300).contains(&reply.status) {
        if reply.body.trim().is_empty() {
            return Ok(Value::Null);
        }
        return serde_json::from_str(&reply.body)
            .map_err(|error| decode(format!("Invalid JSON: {error}")));
    }

    let server_message = serde_json::from_str::<Value>(&reply.body)
        .ok()
        .and_then(|payload| {
            payload
                .get("message")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_else(|| "the server returned no message".to_string());
    let detail = redact_secrets(&server_message);

    match reply.status {
        400 | 422 => Err(GitHubError::Validation { detail }),
        401 => Err(GitHubError::Unauthorized { detail }),
        403 => {
            let retry_after = retry_after(&reply);
            let exhausted = reply.header("x-ratelimit-remaining") == Some("0");
            if retry_after.is_some() || exhausted {
                Err(GitHubError::RateLimited {
                    detail,
                    retry_after,
                })
            } else {
                Err(GitHubError::Forbidden { detail })
            }
        }
        404 => Err(GitHubError::NotFound { detail }),
        409 => Err(GitHubError::Conflict { detail }),
        429 => Err(GitHubError::RateLimited {
            detail,
            retry_after: retry_after(&reply),
        }),
        status => Err(GitHubError::Server { status, detail }),
    }
}

fn retry_after(reply: &HttpReply) -> Option<Duration> {
    reply
        .header("retry-after")
        .and_then(|value| value.trim().parse::<u64>().ok())
        .map(Duration::from_secs)
}

fn decode(detail: String) -> GitHubError {
    GitHubError::Decode { detail }
}

fn validate_slug(value: &str, label: &str) -> Result<(), GitHubError> {
    let valid = !value.is_empty()
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'));
    if valid {
        Ok(())
    } else {
        Err(GitHubError::Validation {
            detail: format!("Invalid GitHub {label}: {value}"),
        })
    }
}

fn req_str(payload: &Value, pointer: &str) -> Result<String, GitHubError> {
    payload
        .pointer(pointer)
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| decode(format!("campo requerido ausente: {pointer}")))
}

fn req_u64(payload: &Value, pointer: &str) -> Result<u64, GitHubError> {
    payload
        .pointer(pointer)
        .and_then(Value::as_u64)
        .ok_or_else(|| decode(format!("campo requerido ausente: {pointer}")))
}

fn opt_bool(payload: &Value, pointer: &str) -> Option<bool> {
    payload.pointer(pointer).and_then(Value::as_bool)
}

fn parse_repository(payload: &Value) -> Result<Repository, GitHubError> {
    let permissions = payload.get("permissions").map(|raw| Permissions {
        admin: opt_bool(raw, "/admin").unwrap_or(false),
        push: opt_bool(raw, "/push").unwrap_or(false),
        pull: opt_bool(raw, "/pull").unwrap_or(false),
    });
    Ok(Repository {
        full_name: req_str(payload, "/full_name")?,
        name: req_str(payload, "/name")?,
        default_branch: req_str(payload, "/default_branch")?,
        clone_url: req_str(payload, "/clone_url")?,
        html_url: req_str(payload, "/html_url")?,
        private: opt_bool(payload, "/private").unwrap_or(false),
        permissions,
    })
}

fn parse_pull_request(payload: &Value) -> Result<PullRequest, GitHubError> {
    Ok(PullRequest {
        number: req_u64(payload, "/number")?,
        state: PullRequestState::parse(&req_str(payload, "/state")?)?,
        merged: opt_bool(payload, "/merged").unwrap_or(false),
        title: req_str(payload, "/title")?,
        html_url: req_str(payload, "/html_url")?,
        head_ref: req_str(payload, "/head/ref")?,
        base_ref: req_str(payload, "/base/ref")?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_debug_never_shows_the_token() {
        let config = GitHubConfig::github_com("ghp_supersecret");
        let printed = format!("{config:?}");
        assert!(!printed.contains("ghp_supersecret"), "{printed}");
        assert!(printed.contains("<redacted>"), "{printed}");
    }

    #[test]
    fn client_debug_never_shows_the_token() {
        let client = GitHubClient::new(GitHubConfig::github_com("github_pat_masctoken"));
        let printed = format!("{client:?}");
        assert!(!printed.contains("masctoken"), "{printed}");
    }

    #[test]
    fn link_header_parses_next_page() {
        let link = "<https://api.github.com/user/repos?per_page=1&page=2>; rel=\"next\", <https://api.github.com/user/repos?per_page=1&page=23>; rel=\"last\"";
        assert_eq!(
            next_page_url(link),
            Some("https://api.github.com/user/repos?per_page=1&page=2".to_string())
        );
    }

    #[test]
    fn link_header_without_next_is_none() {
        let link = "<https://api.github.com/user/repos?per_page=1&page=1>; rel=\"prev\", <https://api.github.com/user/repos?per_page=1&page=3>; rel=\"last\"";
        assert_eq!(next_page_url(link), None);
    }

    #[test]
    fn secondary_rate_limit_403_needs_retry_after_header() {
        let reply = HttpReply {
            status: 403,
            headers: vec![("retry-after".to_string(), "60".to_string())],
            body: r#"{"message":"You have exceeded a secondary rate limit."}"#.to_string(),
        };
        let error = expect_success(reply).expect_err("403 must fail");
        assert!(
            matches!(
                error,
                GitHubError::RateLimited {
                    retry_after: Some(_),
                    ..
                }
            ),
            "{error:?}"
        );
    }

    #[test]
    fn plain_403_is_forbidden_not_rate_limited() {
        let reply = HttpReply {
            status: 403,
            headers: vec![("x-ratelimit-remaining".to_string(), "4999".to_string())],
            body: r#"{"message":"Resource not accessible by integration"}"#.to_string(),
        };
        let error = expect_success(reply).expect_err("403 must fail");
        assert!(matches!(error, GitHubError::Forbidden { .. }), "{error:?}");
    }

    #[test]
    fn rejects_path_injection_in_owner_and_repo() {
        assert!(validate_slug("olivaresrafael", "propietario").is_ok());
        assert!(validate_slug("mi-repo_2.0", "repositorio").is_ok());
        assert!(validate_slug("../otro", "repositorio").is_err());
        assert!(validate_slug("con espacio", "repositorio").is_err());
        assert!(validate_slug("a?b", "repositorio").is_err());
    }

    #[test]
    fn rejects_invalid_pull_request_input_locally() {
        let client = GitHubClient::new(GitHubConfig::github_com("ghp_test"));
        let empty_title = NewPullRequest {
            title: "   ".to_string(),
            head: "feature".to_string(),
            base: "main".to_string(),
            body: None,
        };
        assert!(matches!(
            client.create_pull_request("o", "r", &empty_title),
            Err(GitHubError::Validation { .. })
        ));
        let empty_branch = NewPullRequest {
            title: "Title".to_string(),
            head: "".to_string(),
            base: "main".to_string(),
            body: None,
        };
        assert!(matches!(
            client.create_pull_request("o", "r", &empty_branch),
            Err(GitHubError::Validation { .. })
        ));
    }
}
