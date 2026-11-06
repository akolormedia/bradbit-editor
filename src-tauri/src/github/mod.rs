//! GitHub integration: secret storage and REST client.
//!
//! Tokens live in the macOS Keychain through [`secrets`] and never touch
//! project files or settings. The REST client arrives in T-1.5.2.

pub mod secrets;
