//! Credential redaction for logs, errors and UI text.
//!
//! Best-effort defense in depth (heuristic, no regex dependency): masks
//! userinfo in URLs (`scheme:user:pass@host`), common token shapes
//! (`ghp_…`, `github_pat_…`, `glpat-…`) and secret-bearing key/value pairs
//! (`Authorization:`, `token=`, `password=`). Callers must still avoid
//! constructing error messages that embed credentials in the first place.

/// Redact credentials from text destined for logs, errors or UI.
pub fn redact_secrets(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut remaining = text;
    while let Some(start) = remaining.find("://") {
        let (before, from_scheme) = remaining.split_at(start + 3);
        out.push_str(before);
        // Authority ends at the first path/query/fragment delimiter or space.
        let authority_end = from_scheme
            .find(['/', '?', '#', ' ', '"', '\'', '\n', '\r', '\t'])
            .unwrap_or(from_scheme.len());
        let (authority, rest) = from_scheme.split_at(authority_end);
        out.push_str(&redact_authority(authority));
        remaining = rest;
    }
    out.push_str(remaining);
    redact_tokenish(&out)
}

fn redact_authority(authority: &str) -> String {
    match authority.rfind('@') {
        Some(at) => {
            let host = &authority[at + 1..];
            format!("***@{host}")
        }
        None => authority.to_string(),
    }
}

/// Mask credential-shaped substrings: known token prefixes plus anything that
/// looks like a long opaque secret assigned to a secret-named key.
///
/// The scan cursor advances monotonically after every replacement, so an
/// already-redacted value (`***`) can never be re-matched into an infinite
/// loop.
fn redact_tokenish(text: &str) -> String {
    const TOKEN_PREFIXES: &[&str] = &[
        "ghp_",
        "gho_",
        "ghu_",
        "ghs_",
        "ghr_",
        "github_pat_",
        "glpat-",
        "glptt-",
        "xoxb-",
    ];
    // Values run to end-of-line for header-style keys (the secret may contain
    // spaces, e.g. `Authorization: Basic <base64>`), and to the next
    // delimiter for query-style keys (`token=…&x=1`).
    const LINE_KEYS: &[&str] = &["authorization:"];

    let mut out = text.to_string();

    for prefix in TOKEN_PREFIXES {
        let mut cursor = 0usize;
        while let Some(offset) = out[cursor..].find(prefix) {
            let at = cursor + offset;
            let end = token_end(&out, at);
            if end <= at {
                break;
            }
            out.replace_range(at..end, "***");
            cursor = at + "***".len();
        }
    }

    for key in ["authorization:", "password=", "token=", "secret="] {
        let mut cursor = 0usize;
        while cursor < out.len() {
            let lowered = out.to_ascii_lowercase();
            let Some(offset) = lowered[cursor..].find(key) else {
                break;
            };
            let mut value_start = cursor + offset + key.len();
            // Skip separator spaces so `key: value` and `key=value` both work.
            value_start += out[value_start..]
                .find(|c: char| !c.is_whitespace())
                .unwrap_or(out.len() - value_start);
            if value_start >= out.len() {
                break;
            }
            let stop: &[char] = if LINE_KEYS.contains(&key) {
                &['\n', '\r']
            } else {
                &[' ', '&', '"', '\'', '\n', '\r', '\t']
            };
            let value_len = out[value_start..]
                .find(stop)
                .unwrap_or(out.len() - value_start);
            if value_len == 0 {
                // Nothing that looks like a value here; move past the key.
                cursor = value_start;
                continue;
            }
            out.replace_range(value_start..value_start + value_len, "***");
            cursor = value_start + "***".len();
        }
    }
    out
}

/// End of a token starting at `at`: run of characters that can appear in a
/// Git credential or PAT.
fn token_end(text: &str, at: usize) -> usize {
    text[at..]
        .char_indices()
        .take_while(|(_, c)| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '+' | '/' | '='))
        .map(|(offset, c)| offset + c.len_utf8())
        .last()
        .map(|end| at + end)
        .unwrap_or(at)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacts_url_userinfo() {
        let text = "fatal: unable to access 'https://alice:hunter2@example.com/repo.git/': refused";
        let redacted = redact_secrets(text);
        assert!(!redacted.contains("hunter2"), "{redacted}");
        assert!(redacted.contains("***@example.com"), "{redacted}");
        assert!(redacted.contains("fatal: unable to access"), "{redacted}");
    }

    #[test]
    fn redacts_tokens_in_any_context() {
        let text = "remote: Valid ghp_abcDEF1234567890abcd tokens only\nuse glpat-XYz9876543210";
        let redacted = redact_secrets(text);
        assert!(!redacted.contains("ghp_"), "{redacted}");
        assert!(!redacted.contains("glpat-"), "{redacted}");
        assert!(redacted.contains("***"), "{redacted}");
    }

    #[test]
    fn redacts_authorization_headers_case_insensitively() {
        let text =
            "POST http://host/x\nAuthorization: Basic dXNlcjpwYXNzd29yZA==\ntoken=abc123&x=1";
        let redacted = redact_secrets(text);
        assert!(!redacted.contains("dXNlcjpwYXNzd29yZA"), "{redacted}");
        assert!(!redacted.contains("abc123"), "{redacted}");
        assert!(redacted.contains("x=1"), "{redacted}");
    }

    #[test]
    fn leaves_plain_text_untouched() {
        let text = "commit 4a9f2c1: fix(intro): adjust scene\n1 file changed";
        assert_eq!(redact_secrets(text), text);
    }

    #[test]
    fn redacts_passwords_inside_redacted_urls_too() {
        // Double pass: userinfo already gone, no accidental re-exposure.
        let text = "https://user:pass@host/a https://host2/b";
        let once = redact_secrets(text);
        let twice = redact_secrets(&once);
        assert!(!once.contains("pass"), "{once}");
        assert_eq!(once, twice);
    }
}
