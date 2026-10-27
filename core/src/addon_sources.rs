//! Operator-managed Stremio-compatible direct HTTP/HLS provider setup.
//!
//! Set STREAM_ADDON_MANIFESTS to a semicolon-separated list of HTTPS manifest
//! URLs for sources you are authorized to use. The config is rebuilt on boot so
//! changing the environment variable cleanly switches the active source set.

use moviebox_tui::{
    providers::addons::{client::AddonClient, models::InstalledAddon},
    service::MovieBoxService,
};
use std::{
    net::IpAddr,
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};

static ACTIVE: AtomicBool = AtomicBool::new(false);
const MAX_CONFIGURED_MANIFESTS: usize = 8;
const MANIFEST_TIMEOUT: Duration = Duration::from_secs(8);

/// True only after at least one configured streaming-capable add-on was loaded.
pub fn enabled() -> bool {
    ACTIVE.load(Ordering::Relaxed)
}

/// Load, validate and persist the configured add-ons before the API begins serving.
pub async fn configure(service: &MovieBoxService) {
    let raw = match std::env::var("STREAM_ADDON_MANIFESTS") {
        Ok(value) if !value.trim().is_empty() => value,
        _ => {
            ACTIVE.store(false, Ordering::Relaxed);
            return;
        }
    };

    let mut seen = std::collections::HashSet::new();
    let configured: Vec<(usize, String)> = raw
        .split(|ch| ch == ';' || ch == '\n' || ch == '\r')
        .map(str::trim).filter(|value| !value.is_empty())
        .take(MAX_CONFIGURED_MANIFESTS).enumerate()
        .filter_map(|(index, raw_url)| {
            if !is_public_https_manifest(raw_url) {
                eprintln!("[addon-sources] ignored manifest {}: only public HTTPS hostnames are accepted", index + 1);
                return None;
            }
            let url = AddonClient::normalize_manifest_url(raw_url);
            seen.insert(url.clone()).then_some((index + 1, url))
        }).collect();
    // Parallel manifest fetches keep configured add-ons from adding up to
    // eight sequential 8-second delays during startup.
    let checks = futures::future::join_all(configured.iter().map(|(index, url)| async move {
        let result = tokio::time::timeout(MANIFEST_TIMEOUT, service.addon_client.fetch_manifest(url)).await;
        (*index, url.clone(), result)
    })).await;
    let mut discovered: Vec<InstalledAddon> = Vec::new();
    for (index, manifest_url, fetched) in checks {
        match fetched {
            Ok(Ok(manifest)) if manifest.provides_stream() || manifest.provides_catalog() || manifest.provides_meta() => {
                discovered.push(InstalledAddon::from_manifest(manifest_url, &manifest));
            }
            Ok(Ok(_)) => eprintln!("[addon-sources] ignored manifest {}: it advertises no catalog, metadata, or stream resource", index),
            Ok(Err(_)) => eprintln!("[addon-sources] manifest {} could not be loaded", index),
            Err(_) => eprintln!("[addon-sources] manifest {} timed out", index),
        }
    }

    if discovered.is_empty() {
        ACTIVE.store(false, Ordering::Relaxed);
        eprintln!(
            "[addon-sources] no configured catalog/metadata/stream add-ons loaded; existing local add-on config was left unchanged"
        );
        return;
    }

    // Environment-managed sources replace prior non-Cinemeta entries. This makes
    // changing STREAM_ADDON_MANIFESTS a predictable provider switch on restart.
    let existing = moviebox_tui::config::load_addons();
    let mut active: Vec<InstalledAddon> = existing
        .into_iter()
        .filter(InstalledAddon::is_core)
        .collect();
    if !active.iter().any(InstalledAddon::is_core) {
        active.push(InstalledAddon::cinemeta_default());
    }
    active.extend(discovered.iter().cloned());
    moviebox_tui::config::save_addons(&active);

    ACTIVE.store(true, Ordering::Relaxed);
    eprintln!(
        "[addon-sources] loaded {} configured catalog/metadata/stream add-on(s)",
        discovered.len()
    );
}

/// Accept DNS hostnames over HTTPS and reject literal IPs/private/local targets.
/// These URLs are operator configuration, never client-supplied request values.
fn is_public_https_manifest(raw: &str) -> bool {
    let Some(rest) = raw
        .strip_prefix("https://")
        .or_else(|| raw.strip_prefix("HTTPS://"))
    else {
        return false;
    };

    let authority = rest.split(['/', '?', '#']).next().unwrap_or_default();
    if authority.is_empty() || authority.contains('@') || authority.starts_with('[') {
        return false;
    }

    let host = authority.split(':').next().unwrap_or_default();
    if host.is_empty()
        || !host.contains('.')
        || host.starts_with('.')
        || host.ends_with('.')
        || host.contains("..")
        || host.chars().any(|ch| !(ch.is_ascii_alphanumeric() || ch == '.' || ch == '-'))
    {
        return false;
    }

    let lower = host.to_ascii_lowercase();
    if lower == "localhost"
        || lower.ends_with(".localhost")
        || lower.ends_with(".local")
        || lower.ends_with(".internal")
        || host.parse::<IpAddr>().is_ok()
    {
        return false;
    }

    true
}

#[cfg(test)]
mod tests {
    use super::is_public_https_manifest;

    #[test]
    fn accepts_public_https_manifest_urls() {
        assert!(is_public_https_manifest(
            "https://addon.example.org/manifest.json"
        ));
        assert!(is_public_https_manifest("HTTPS://addon.example.org"));
    }

    #[test]
    fn rejects_insecure_or_local_manifest_urls() {
        assert!(!is_public_https_manifest("http://addon.example.org/manifest.json"));
        assert!(!is_public_https_manifest("https://localhost/manifest.json"));
        assert!(!is_public_https_manifest("https://addon.local/manifest.json"));
        assert!(!is_public_https_manifest("https://127.0.0.1/manifest.json"));
        assert!(!is_public_https_manifest("https://192.168.1.10/manifest.json"));
        assert!(!is_public_https_manifest("https://user:pass@addon.example.org/manifest.json"));
    }
}
