//! GitHub integration: secret storage and REST client.
//!
//! Tokens live in the macOS Keychain through [`secrets`] and never touch
//! project files or settings. [`client`] talks to the GitHub REST API and
//! returns typed errors; the UI layer arrives in T-1.5.4.

pub mod client;
pub mod error;
pub mod secrets;

pub use client::{
    Branch, GitHubClient, GitHubConfig, NewPullRequest, NewRepository, Permissions, PullRequest,
    PullRequestState, Repository, User, GITHUB_API_BASE_URL, GITHUB_API_VERSION,
};
pub use error::GitHubError;
