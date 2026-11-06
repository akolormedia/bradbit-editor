//! Typed GitHub REST failures.
//!
//! Every detail string is already redacted: provider messages are surfaced
//! verbatim so the writer sees GitHub's own diagnosis, never a token.

use std::fmt;
use std::time::Duration;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GitHubError {
    /// 401: the token is missing, expired or invalid.
    Unauthorized { detail: String },
    /// 403: authenticated but not allowed (and not a rate limit).
    Forbidden { detail: String },
    /// 404: GitHub masks some insufficient-permission cases as 404.
    NotFound { detail: String },
    /// 400/422: the provider rejected the request itself.
    Validation { detail: String },
    /// 429, or a secondary-limit 403 with `Retry-After`.
    RateLimited {
        detail: String,
        retry_after: Option<Duration>,
    },
    /// 409: state conflict.
    Conflict { detail: String },
    /// 5xx: provider-side failure.
    Server { status: u16, detail: String },
    /// The provider answered, but not in a shape we can trust.
    Decode { detail: String },
    /// Network/DNS/connection failure before a response existed.
    Transport { detail: String },
}

impl fmt::Display for GitHubError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            GitHubError::Unauthorized { detail } => {
                write!(f, "GitHub rechazó el token: {detail}")
            }
            GitHubError::Forbidden { detail } => write!(f, "GitHub denegó el permiso: {detail}"),
            GitHubError::NotFound { detail } => {
                write!(f, "GitHub no encontró el recurso: {detail}")
            }
            GitHubError::Validation { detail } => {
                write!(f, "GitHub rechazó la solicitud: {detail}")
            }
            GitHubError::RateLimited {
                detail,
                retry_after,
            } => match retry_after {
                Some(after) => write!(
                    f,
                    "límite de GitHub alcanzado: {detail} (reintenta en {after:?})"
                ),
                None => write!(f, "límite de GitHub alcanzado: {detail}"),
            },
            GitHubError::Conflict { detail } => write!(f, "conflicto en GitHub: {detail}"),
            GitHubError::Server { status, detail } => {
                write!(f, "error del servidor de GitHub ({status}): {detail}")
            }
            GitHubError::Decode { detail } => write!(f, "respuesta inesperada de GitHub: {detail}"),
            GitHubError::Transport { detail } => write!(f, "fallo de red con GitHub: {detail}"),
        }
    }
}

impl std::error::Error for GitHubError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_never_adds_secrets() {
        let error = GitHubError::Unauthorized {
            detail: "Bad credentials".to_string(),
        };
        assert!(!error.to_string().contains("ghp_"));
        assert!(error.to_string().contains("Bad credentials"));
    }
}
