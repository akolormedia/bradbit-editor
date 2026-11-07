//! Contract tests for the GitHub REST client against a local mock server.
//!
//! No network and no real credentials: every case pins provider-confirmed
//! behavior, typed failures, bounded pagination and token hygiene.

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use bradbit_editor_lib::github::{
    GitHubClient, GitHubConfig, GitHubError, NewPullRequest, NewRepository, PullRequestState,
};
use serde_json::json;

struct Reply {
    status: u16,
    headers: Vec<(&'static str, String)>,
    body: String,
}

impl Reply {
    fn json(status: u16, body: serde_json::Value) -> Self {
        Self {
            status,
            headers: vec![("content-type", "application/json".to_string())],
            body: body.to_string(),
        }
    }

    fn with_header(mut self, name: &'static str, value: String) -> Self {
        self.headers.push((name, value));
        self
    }
}

#[derive(Debug, Clone)]
struct Recorded {
    method: String,
    target: String,
    headers: Vec<(String, String)>,
    body: String,
}

fn spawn_server(replies: Vec<Reply>) -> (String, Arc<Mutex<Vec<Recorded>>>) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind mock server");
    let base_url = format!("http://{}", listener.local_addr().expect("addr"));
    let recorded: Arc<Mutex<Vec<Recorded>>> = Arc::new(Mutex::new(Vec::new()));
    let sink = Arc::clone(&recorded);
    let server_base = base_url.clone();

    thread::spawn(move || {
        for reply in replies {
            let Ok((mut stream, _)) = listener.accept() else {
                return;
            };
            let Ok(recorded_request) = read_request(&mut stream) else {
                return;
            };
            sink.lock().expect("recorded lock").push(recorded_request);
            let status = reply.status;
            let reason = match status {
                200 => "OK",
                201 => "Created",
                401 => "Unauthorized",
                403 => "Forbidden",
                404 => "Not Found",
                409 => "Conflict",
                422 => "Unprocessable Entity",
                429 => "Too Many Requests",
                500 => "Internal Server Error",
                _ => "Status",
            };
            let body = reply.body.replace("{BASE}", &server_base);
            let mut head_out = format!(
                "HTTP/1.1 {status} {reason}\r\nContent-Length: {}\r\nConnection: close\r\n",
                body.len()
            );
            for (name, value) in &reply.headers {
                let value = value.replace("{BASE}", &server_base);
                head_out.push_str(&format!("{name}: {value}\r\n"));
            }
            head_out.push_str("\r\n");
            let _ = stream.write_all(head_out.as_bytes());
            let _ = stream.write_all(body.as_bytes());
            let _ = stream.flush();
        }
    });

    (base_url, recorded)
}

fn read_request(stream: &mut TcpStream) -> std::io::Result<Recorded> {
    let mut buffer = Vec::new();
    let mut chunk = [0u8; 4096];
    let head_end = loop {
        let read = stream.read(&mut chunk)?;
        if read == 0 {
            break buffer.len();
        }
        buffer.extend_from_slice(&chunk[..read]);
        if let Some(position) = buffer.windows(4).position(|w| w == b"\r\n\r\n") {
            break position + 4;
        }
    };
    let head = String::from_utf8_lossy(&buffer[..head_end]).to_string();
    let mut lines = head.split("\r\n");
    let request_line = lines.next().unwrap_or_default().to_string();
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or_default().to_string();
    let target = parts.next().unwrap_or_default().to_string();
    let headers: Vec<(String, String)> = lines
        .filter_map(|line| {
            let (name, value) = line.split_once(':')?;
            Some((name.trim().to_ascii_lowercase(), value.trim().to_string()))
        })
        .collect();
    let content_length: usize = headers
        .iter()
        .find(|(name, _)| name == "content-length")
        .and_then(|(_, value)| value.parse().ok())
        .unwrap_or(0);
    let mut body = String::from_utf8_lossy(&buffer[head_end..]).to_string();
    let mut body_read = body.len();
    while body_read < content_length {
        let read = stream.read(&mut chunk)?;
        if read == 0 {
            break;
        }
        body.push_str(&String::from_utf8_lossy(&chunk[..read]));
        body_read += read;
    }
    Ok(Recorded {
        method,
        target,
        headers,
        body,
    })
}

fn client_for(base_url: &str) -> GitHubClient {
    GitHubClient::new(
        GitHubConfig::github_com("ghp_testtokennotreal")
            .with_base_url(base_url)
            .with_timeout(Duration::from_secs(3)),
    )
}

fn repo_json() -> serde_json::Value {
    json!({
        "full_name": "olivaresrafael/bradbit-demo",
        "name": "bradbit-demo",
        "default_branch": "main",
        "clone_url": "https://github.com/olivaresrafael/bradbit-demo.git",
        "html_url": "https://github.com/olivaresrafael/bradbit-demo",
        "private": false,
        "permissions": { "admin": true, "push": true, "pull": true }
    })
}

fn pr_json(number: u64) -> serde_json::Value {
    json!({
        "number": number,
        "state": "open",
        "merged": false,
        "title": "Version of act 1",
        "html_url": format!("https://github.com/o/r/pull/{number}"),
        "head": { "ref": "final-alternativo" },
        "base": { "ref": "main" }
    })
}

#[test]
fn authenticated_user_sends_required_headers() {
    let (base, recorded) = spawn_server(vec![Reply::json(200, json!({ "login": "rafael" }))]);
    let user = client_for(&base)
        .authenticated_user()
        .expect("GET /user should succeed");
    assert_eq!(user.login, "rafael");

    let log = recorded.lock().expect("lock").clone();
    assert_eq!(log.len(), 1);
    assert_eq!(log[0].method, "GET");
    assert_eq!(log[0].target, "/user");
    let header = |name: &str| {
        log[0]
            .headers
            .iter()
            .find(|(key, _)| key == name)
            .map(|(_, value)| value.as_str())
            .unwrap_or("<missing>")
            .to_string()
    };
    assert_eq!(header("authorization"), "Bearer ghp_testtokennotreal");
    assert_eq!(header("accept"), "application/vnd.github+json");
    assert_eq!(header("x-github-api-version"), "2022-11-28");
}

#[test]
fn get_repository_parses_identity_and_permissions() {
    let (base, _recorded) = spawn_server(vec![Reply::json(200, repo_json())]);
    let repo = client_for(&base)
        .get_repository("olivaresrafael", "bradbit-demo")
        .expect("get repo");
    assert_eq!(repo.full_name, "olivaresrafael/bradbit-demo");
    assert_eq!(repo.default_branch, "main");
    assert_eq!(
        repo.clone_url,
        "https://github.com/olivaresrafael/bradbit-demo.git"
    );
    let permissions = repo.permissions.expect("permissions");
    assert!(permissions.admin && permissions.push && permissions.pull);
}

#[test]
fn create_repository_sends_body_and_needs_201() {
    let (base, recorded) = spawn_server(vec![Reply::json(201, repo_json())]);
    let input = NewRepository::new("bradbit-demo").private().auto_init();
    let repo = client_for(&base)
        .create_repository(&input)
        .expect("create repo");
    assert_eq!(repo.name, "bradbit-demo");

    let log = recorded.lock().expect("lock").clone();
    assert_eq!(log[0].method, "POST");
    assert_eq!(log[0].target, "/user/repos");
    let body: serde_json::Value = serde_json::from_str(&log[0].body).expect("json body");
    assert_eq!(body["name"], "bradbit-demo");
    assert_eq!(body["private"], true);
    assert_eq!(body["auto_init"], true);
}

#[test]
fn list_branches_follows_link_pagination() {
    let (base, recorded) = spawn_server(vec![
        Reply::json(
            200,
            json!([
                { "name": "main", "commit": { "sha": "aaaa" }, "protected": true },
                { "name": "final-alternativo", "commit": { "sha": "bbbb" }, "protected": false }
            ]),
        )
        .with_header(
            "link",
            "<{BASE}/repos/o/r/branches?per_page=100&page=2>; rel=\"next\", <{BASE}/repos/o/r/branches?per_page=100&page=2>; rel=\"last\""
                .to_string(),
        ),
        Reply::json(
            200,
            json!([
                { "name": "otra-rama", "commit": { "sha": "cccc" }, "protected": false }
            ]),
        ),
    ]);
    let branches = client_for(&base)
        .list_branches("o", "r", 5)
        .expect("pagination");
    assert_eq!(branches.len(), 3);
    assert_eq!(branches[0].name, "main");
    assert!(branches[0].protected);
    assert_eq!(branches[2].sha, "cccc");

    let log = recorded.lock().expect("lock").clone();
    assert_eq!(log.len(), 2, "one request per page");
    assert_eq!(log[0].target, "/repos/o/r/branches?per_page=100");
    assert_eq!(log[1].target, "/repos/o/r/branches?per_page=100&page=2");
}

#[test]
fn list_branches_stops_at_max_pages() {
    let page = || {
        Reply::json(
            200,
            json!([{ "name": "x", "commit": { "sha": "dddd" }, "protected": false }]),
        )
        .with_header(
            "link",
            "<{BASE}/repos/o/r/branches?per_page=100&page=2>; rel=\"next\"".to_string(),
        )
    };
    let (base, recorded) = spawn_server(vec![page(), page()]);
    let branches = client_for(&base)
        .list_branches("o", "r", 2)
        .expect("bounded list");
    assert_eq!(branches.len(), 2);
    assert_eq!(recorded.lock().expect("lock").len(), 2);
}

#[test]
fn pagination_link_outside_the_api_host_is_rejected() {
    let (base, recorded) = spawn_server(vec![Reply::json(200, json!([repo_json()])).with_header(
        "link",
        "<https://evil.example/steal>; rel=\"next\"".to_string(),
    )]);
    let error = client_for(&base)
        .list_repositories(2)
        .expect_err("external pagination link must fail");
    assert!(matches!(error, GitHubError::Decode { .. }), "{error:?}");
    assert_eq!(recorded.lock().expect("lock").len(), 1);
}

#[test]
fn list_pull_requests_sends_state_filter() {
    let (base, recorded) = spawn_server(vec![Reply::json(200, json!([pr_json(7)]))]);
    let prs = client_for(&base)
        .list_pull_requests("o", "r", "open", 1)
        .expect("list PRs");
    assert_eq!(prs.len(), 1);
    assert_eq!(prs[0].number, 7);
    assert_eq!(prs[0].state, PullRequestState::Open);
    assert_eq!(prs[0].head_ref, "final-alternativo");

    let log = recorded.lock().expect("lock").clone();
    assert_eq!(log[0].target, "/repos/o/r/pulls?per_page=100&state=open");
}

#[test]
fn create_pull_request_success() {
    let (base, recorded) = spawn_server(vec![Reply::json(201, pr_json(1))]);
    let input = NewPullRequest {
        title: "Version of act 1".to_string(),
        head: "final-alternativo".to_string(),
        base: "main".to_string(),
        body: Some("Listo para revisar.".to_string()),
    };
    let pr = client_for(&base)
        .create_pull_request("o", "r", &input)
        .expect("create PR");
    assert_eq!(pr.number, 1);
    let log = recorded.lock().expect("lock").clone();
    let body: serde_json::Value = serde_json::from_str(&log[0].body).expect("json");
    assert_eq!(body["head"], "final-alternativo");
    assert_eq!(body["base"], "main");
    assert_eq!(body["body"], "Listo para revisar.");
}

#[test]
fn unauthorized_and_validation_errors_are_typed_and_redacted() {
    let (base, _) = spawn_server(vec![Reply::json(
        401,
        json!({ "message": "Bad credentials for ghp_testtokennotreal" }),
    )]);
    let error = client_for(&base)
        .authenticated_user()
        .expect_err("401 must fail");
    assert!(
        matches!(error, GitHubError::Unauthorized { .. }),
        "{error:?}"
    );
    assert!(
        !error.to_string().contains("ghp_testtokennotreal"),
        "{error}"
    );

    let (base, _) = spawn_server(vec![Reply::json(
        422,
        json!({ "message": "name already exists on this account" }),
    )]);
    let error = client_for(&base)
        .create_repository(&NewRepository::new("bradbit-demo"))
        .expect_err("422 must fail");
    assert!(matches!(error, GitHubError::Validation { .. }), "{error:?}");
    assert!(error.to_string().contains("already exists"), "{error}");
}

#[test]
fn rate_limit_429_exposes_retry_after() {
    let (base, _) = spawn_server(vec![Reply::json(
        429,
        json!({ "message": "API rate limit exceeded" }),
    )
    .with_header("retry-after", "60".to_string())]);
    let error = client_for(&base)
        .authenticated_user()
        .expect_err("429 must fail");
    match error {
        GitHubError::RateLimited {
            retry_after: Some(after),
            ..
        } => assert_eq!(after, Duration::from_secs(60)),
        other => panic!("unexpected error: {other:?}"),
    }
}

#[test]
fn transport_failures_are_typed() {
    let error = GitHubClient::new(
        GitHubConfig::github_com("ghp_testtokennotreal")
            .with_base_url("http://127.0.0.1:1")
            .with_timeout(Duration::from_millis(500)),
    )
    .authenticated_user()
    .expect_err("connection must fail");
    assert!(matches!(error, GitHubError::Transport { .. }), "{error:?}");
    assert!(
        !error.to_string().contains("ghp_testtokennotreal"),
        "{error}"
    );
}

#[test]
#[ignore = "requiere red; verifica TLS y el 401 real de GitHub"]
fn github_com_rejects_an_invalid_token() {
    let error = GitHubClient::new(GitHubConfig::github_com("ghp_invalid_test_token"))
        .authenticated_user()
        .expect_err("invalid token must fail");
    assert!(
        matches!(error, GitHubError::Unauthorized { .. }),
        "{error:?}"
    );
    assert!(
        !error.to_string().contains("ghp_invalid_test_token"),
        "{error}"
    );
}
