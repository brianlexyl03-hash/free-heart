mod addon_sources;

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
};
use moviebox_tui::{
    providers::{
        ReleaseProvider,
        models::{
            CatalogItem, MediaDetails, MediaType, ProviderError, ProviderKind, ProviderMediaId, Release,
            SourceMirror,
        },
    },
    service::MovieBoxService,
};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, net::SocketAddr, sync::Arc};

#[derive(Clone)]
struct AppState {
    service: Arc<MovieBoxService>,
}

#[derive(Debug, Serialize)]
struct ErrorBody {
    error: &'static str,
    message: String,
}

struct ApiError {
    status: StatusCode,
    kind: &'static str,
    message: String,
}

impl ApiError {
    fn provider(err: ProviderError) -> Self {
        Self {
            status: match err {
                ProviderError::NotFound => StatusCode::NOT_FOUND,
                ProviderError::RateLimited(_) => StatusCode::TOO_MANY_REQUESTS,
                ProviderError::Network(_) | ProviderError::Unavailable(_) => {
                    StatusCode::BAD_GATEWAY
                }
                ProviderError::Parsing(_) => StatusCode::BAD_GATEWAY,
            },
            kind: "provider_error",
            message: err.to_string(),
        }
    }

    fn bad_request(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            kind: "bad_request",
            message: message.into(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(ErrorBody {
                error: self.kind,
                message: self.message,
            }),
        )
            .into_response()
    }
}

#[derive(Debug, Deserialize)]
struct SearchQuery {
    q: String,
    page: Option<usize>,
}

#[derive(Debug, Serialize)]
struct SearchResponse {
    results: Vec<ItemResponse>,
    page: usize,
    #[serde(rename = "hasMore")]
    has_more: bool,
}

#[derive(Debug, Serialize)]
struct ItemResponse {
    id: String,
    title: String,
    year: Option<String>,
    poster: Option<String>,
    #[serde(rename = "type")]
    media_type: &'static str,
}

#[derive(Debug, Serialize)]
struct EpisodeResponse {
    key: String,
    label: String,
}

#[derive(Debug, Serialize)]
struct TitleResponse {
    id: String,
    title: String,
    year: Option<String>,
    poster: Option<String>,
    #[serde(rename = "type")]
    media_type: &'static str,
    overview: Option<String>,
    episodes: Vec<EpisodeResponse>,
}

#[derive(Debug, Deserialize)]
struct ResolveRequest {
    id: String,
    episode: Option<String>,
    resolution: Option<u32>,
}

#[derive(Debug, Serialize)]
struct SubtitleResponse {
    lang: String,
    label: String,
    url: String,
}

#[derive(Debug, Serialize)]
struct ResolveResponse {
    url: String,
    kind: &'static str,
    headers: HashMap<String, String>,
    candidates: Vec<ResolveCandidate>,
    subtitles: Vec<SubtitleResponse>,
    resolutions: Vec<u32>,
    #[serde(rename = "selectedResolution")]
    selected_resolution: u32,
}

#[derive(Debug, Serialize)]
struct ResolveCandidate {
    url: String,
    kind: &'static str,
    headers: HashMap<String, String>,
}

#[derive(Debug, Serialize)]
struct HealthResponse {
    ok: bool,
    core: &'static str,
}

fn item_response(item: CatalogItem) -> ItemResponse {
    ItemResponse {
        // Keep the provider in the opaque web ID so playback can route to the
        // same provider that produced the search result.
        id: format!("{}:{}", item.id.provider.cache_key(), item.id.value),
        title: item.title,
        year: item.year,
        poster: item.poster_url,
        media_type: match item.media_type {
            MediaType::Movie => "movie",
            MediaType::Series => "series",
        },
    }
}

fn title_response(details: MediaDetails) -> TitleResponse {
    let episodes = details
        .seasons
        .iter()
        .flat_map(|season| {
            season.episodes.iter().map(move |episode| EpisodeResponse {
                key: format!("s{}e{}", season.number, episode.number),
                label: format!(
                    "S{:02}E{:02}{}",
                    season.number,
                    episode.number,
                    episode
                        .title
                        .as_deref()
                        .map(|title| format!(" — {title}"))
                        .unwrap_or_default()
                ),
            })
        })
        .collect();
    TitleResponse {
        id: format!("{}:{}", details.id.provider.cache_key(), details.id.value),
        title: details.title,
        year: details.year,
        poster: details.poster_url,
        media_type: match details.media_type {
            MediaType::Movie => "movie",
            MediaType::Series => "series",
        },
        overview: details.description,
        episodes,
    }
}

fn parse_media_id(raw: &str) -> Result<(ProviderKind, String), ApiError> {
    let Some((provider_name, subject_id)) = raw.split_once(':') else {
        // IDs created by older builds were MovieBox-only IDs.
        return Ok((ProviderKind::MovieBox, raw.to_string()));
    };
    let provider = ProviderKind::parse(provider_name)
        .ok_or_else(|| ApiError::bad_request("Unknown media provider"))?;
    if subject_id.is_empty() {
        return Err(ApiError::bad_request("Invalid media id"));
    }
    Ok((provider, subject_id.to_string()))
}

async fn provider_releases(
    service: &MovieBoxService,
    provider: ProviderKind,
    subject_id: &str,
    season: usize,
    episode: usize,
    is_series: bool,
) -> Result<Vec<Release>, ProviderError> {
    if provider == ProviderKind::MovieBox && subject_id.starts_with("wefeedshort~") {
        return service.wefeed_episode_streams(subject_id, season, episode).await;
    }

    match provider {
        ProviderKind::MovieBox => {
            service
                .client
                .episode_streams(subject_id, season, episode)
                .await
        }
        ProviderKind::FourKHdHub => {
            service
                .fourk_client
                .as_ref()
                .ok_or_else(|| ProviderError::Unavailable("4KHDHub is unavailable".to_string()))?
                .episode_streams(subject_id, season, episode)
                .await
        }
        ProviderKind::Dramachi => service
            .dramachi_client
            .episode_streams(subject_id, season, episode)
            .await
            .map_err(ProviderError::from),
        ProviderKind::Addons => {
            let configured = moviebox_tui::config::load_addons();
            let (releases, _blocked_sources) = moviebox_tui::providers::addons::aggregate_streams(
                &service.addon_client,
                &configured,
                subject_id,
                season,
                episode,
                is_series,
            )
            .await;
            if releases.is_empty() {
                Err(ProviderError::Unavailable(format!(
                    "No direct HTTP/HLS stream was returned by configured add-ons for {subject_id}"
                )))
            } else {
                Ok(releases)
            }
        }
        _ => Err(ProviderError::Unavailable(format!(
            "{provider} playback is not enabled for the web adapter"
        ))),
    }
}

fn episode_parts(value: Option<&str>) -> Result<(usize, usize), ApiError> {
    let Some(value) = value.filter(|value| !value.trim().is_empty()) else {
        return Ok((0, 0));
    };
    let lower = value.trim().to_ascii_lowercase();
    let Some(rest) = lower.strip_prefix('s') else {
        return Err(ApiError::bad_request("Episode must use the s1e2 format"));
    };
    let Some((season, episode)) = rest.split_once('e') else {
        return Err(ApiError::bad_request("Episode must use the s1e2 format"));
    };
    let season = season
        .parse::<usize>()
        .map_err(|_| ApiError::bad_request("Invalid season number"))?;
    let episode = episode
        .parse::<usize>()
        .map_err(|_| ApiError::bad_request("Invalid episode number"))?;
    if season == 0 || episode == 0 {
        return Err(ApiError::bad_request("Season and episode must be positive"));
    }
    Ok((season, episode))
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        ok: true,
        core: "upstream-moviebox-tui",
    })
}

fn is_open_film_demo_query(query: &str) -> bool {
    let q = query.to_ascii_lowercase();
    q.contains("big buck bunny") || q.contains("open film demo") || q.trim() == "stream test"
}

fn public_domain_demo_catalog_item() -> CatalogItem {
    CatalogItem {
        id: ProviderMediaId {
            provider: ProviderKind::Addons,
            value: "movie:tt1254207".to_string(),
        },
        title: "Big Buck Bunny — Open-Licensed Playback Test".to_string(),
        media_type: MediaType::Movie,
        year: Some("2008".to_string()),
        poster_url: Some("https://live.metahub.space/poster/small/tt1254207/img".to_string()),
        season_count: None,
    }
}

fn public_domain_demo_title(id: &str) -> TitleResponse {
    TitleResponse {
        id: id.to_string(),
        title: "Big Buck Bunny — Open-Licensed Playback Test".to_string(),
        year: Some("2008".to_string()),
        poster: Some("https://live.metahub.space/poster/small/tt1254207/img".to_string()),
        media_type: "movie",
        overview: Some("Open-licensed short film by the Blender Foundation, included to test Free Heart playback. Preserve the film's attribution when redistributing.".to_string()),
        episodes: Vec::new(),
    }
}

fn public_domain_demo_release() -> Release {
    Release {
        provider: ProviderKind::Addons,
        filename: "Big Buck Bunny — open-licensed playback test.mp4".to_string(),
        quality: Some("1080p".to_string()),
        codec: Some("H.264".to_string()),
        language: Some("English".to_string()),
        size_bytes: None,
        season: None,
        episode: None,
        mirrors: vec![
            SourceMirror {
                label: "Open film demo · Google sample mirror".to_string(),
                resolver_url: "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4".to_string(),
                headers: Vec::new(),
                direct_file: true,
            },
            SourceMirror {
                label: "Open film demo · Stremio public-domain mirror".to_string(),
                resolver_url: "http://distribution.bbb3d.renderfarming.net/video/mp4/bbb_sunflower_1080p_30fps_normal.mp4".to_string(),
                headers: Vec::new(),
                direct_file: true,
            },
        ],
        resource_id: None,
    }
}

async fn search(
    State(state): State<AppState>,
    Query(query): Query<SearchQuery>,
) -> Result<Json<SearchResponse>, ApiError> {
    let q = query.q.trim();
    if q.is_empty() || q.len() > 100 {
        return Err(ApiError::bad_request("q must contain 1–100 characters"));
    }
    let page = query.page.unwrap_or(1).clamp(1, 50);

    // A known open-licensed test film gives us a deterministic way to verify
    // the complete browser -> resolve -> tokenized byte-range stream path.
    if page == 1 && is_open_film_demo_query(q) {
        return Ok(Json(SearchResponse {
            results: vec![item_response(public_domain_demo_catalog_item())],
            page,
            has_more: false,
        }));
    }

    // Search primary providers and add Stremio-compatible streaming add-ons
    // only when at least one configured stream-capable add-on loaded at boot.
    let mut providers = vec![
        ProviderKind::MovieBox,
        ProviderKind::FourKHdHub,
        ProviderKind::Dramachi,
    ];
    if addon_sources::enabled() {
        providers.push(ProviderKind::Addons);
    }
    // Query all enabled providers concurrently instead of serially.
    let search_results = futures::future::join_all(
        providers.iter().map(|provider| state.service.search_typed(*provider, q, page)),
    ).await;
    let mut results = Vec::new();
    let mut last_error = None;
    let mut has_more = false;
    for result in search_results {
        match result {
            Ok(mut items) => { has_more |= items.len() >= 15; results.append(&mut items); }
            Err(error) => last_error = Some(error),
        }
    }

    // WeFeed Short is optional: an upstream failure must not break other search providers.
    if state.service.wefeed_short_enabled() {
        match tokio::time::timeout(
            std::time::Duration::from_secs(7),
            state.service.search_wefeed(q, page),
        ).await {
            Ok(Ok(mut items)) => {
                    has_more |= items.len() >= 15;
                results.append(&mut items);
            }
            Ok(Err(error)) => eprintln!("WeFeed Short search skipped: {error}"),
            Err(_) => eprintln!("WeFeed Short search timed out"),
        }
    }

    if results.is_empty() {
        if let Some(error) = last_error { return Err(ApiError::provider(error)); }
        return Ok(Json(SearchResponse { results: Vec::new(), page, has_more: false }));
    }
    // Deduplicate by provider-aware ID before sorting; alphabetical sorting
    // does not guarantee duplicate entries are adjacent.
    let mut seen_ids = std::collections::HashSet::new();
    results.retain(|item| seen_ids.insert(item.id.clone()));
    results.sort_by(|left, right| left.title.to_lowercase().cmp(&right.title.to_lowercase()));
    Ok(Json(SearchResponse {
        results: results.into_iter().map(item_response).collect(),
        page,
        has_more,
    }))
}

async fn shorts(
    State(state): State<AppState>,
    Query(query): Query<SearchQuery>,
) -> Result<Json<SearchResponse>, ApiError> {
    let q = query.q.trim();
    if q.is_empty() || q.len() > 100 {
        return Err(ApiError::bad_request("q must contain 1–100 characters"));
    }
    let page = query.page.unwrap_or(1).clamp(1, 50);
    let items = tokio::time::timeout(
        std::time::Duration::from_secs(7),
        state.service.search_wefeed(q, page),
    )
    .await
    .map_err(|_| ApiError {
        status: StatusCode::GATEWAY_TIMEOUT,
        kind: "wefeed_timeout",
        message: "WeFeed Short catalogue timed out".to_string(),
    })?
    .map_err(ApiError::provider)?;
    let has_more = items.len() >= 15;
    Ok(Json(SearchResponse {
        results: items.into_iter().map(item_response).collect(),
        page,
        has_more,
    }))
}

async fn title(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<TitleResponse>, ApiError> {
    if id.is_empty() || id.len() > 96 {
        return Err(ApiError::bad_request("Invalid title id"));
    }
    let (provider, subject_id) = parse_media_id(&id)?;
    if provider == ProviderKind::Addons && subject_id == "movie:tt1254207" {
        return Ok(Json(public_domain_demo_title(&id)));
    }
    let details = (if provider == ProviderKind::MovieBox
            && subject_id.starts_with("wefeedshort~")
        {
            state.service.details_wefeed(&subject_id).await
        } else {
            state.service.details_typed(provider, &subject_id).await
        })
        .map_err(|error| match error {
            ProviderError::NotFound => ApiError {
                status: StatusCode::NOT_FOUND,
                kind: "title_not_found",
                message: "This title is not available from the selected source".to_string(),
            },
            other => ApiError::provider(other),
        })?;
    Ok(Json(title_response(details)))
}

fn allowed_headers(mirror: &SourceMirror) -> HashMap<String, String> {
    mirror
        .headers
        .iter()
        .filter_map(|(name, value)| {
            let key = name.to_ascii_lowercase();
            (key == "referer" || key == "user-agent" || key == "cookie" || key == "origin")
                .then(|| (key, value.clone()))
        })
        .collect()
}

fn resolve_candidates(release: &Release) -> Vec<ResolveCandidate> {
    release
        .mirrors
        .iter()
        .filter(|mirror| {
            mirror.resolver_url.starts_with("http://")
                || mirror.resolver_url.starts_with("https://")
        })
        .map(|mirror| ResolveCandidate {
            url: mirror.resolver_url.clone(),
            kind: if mirror.resolver_url.to_ascii_lowercase().contains(".m3u8") {
                "hls"
            } else {
                "file"
            },
            headers: allowed_headers(mirror),
        })
        .collect()
}

fn open_film_demo_resolve_response() -> Option<ResolveResponse> {
    let candidates = resolve_candidates(&public_domain_demo_release());
    let first = candidates.first()?;
    Some(ResolveResponse {
        url: first.url.clone(),
        kind: first.kind,
        headers: first.headers.clone(),
        candidates,
        subtitles: Vec::new(),
        resolutions: vec![1080],
        selected_resolution: 1080,
    })
}

async fn resolve(
    State(state): State<AppState>,
    Json(request): Json<ResolveRequest>,
) -> Result<Json<ResolveResponse>, ApiError> {
    if request.id.is_empty() || request.id.len() > 96 {
        return Err(ApiError::bad_request("Invalid title id"));
    }
    let (season, episode) = episode_parts(request.episode.as_deref())?;
    let (provider, subject_id) = parse_media_id(&request.id)?;
    if provider == ProviderKind::Addons && subject_id == "movie:tt1254207" {
        return open_film_demo_resolve_response()
            .map(Json)
            .ok_or_else(|| ApiError {
                status: StatusCode::BAD_GATEWAY,
                kind: "stream_unavailable",
                message: "The open-film test stream has no usable mirrors".to_string(),
            });
    }
    let details = (if provider == ProviderKind::MovieBox
            && subject_id.starts_with("wefeedshort~")
        {
            state.service.details_wefeed(&subject_id).await
        } else {
            state.service.details_typed(provider, &subject_id).await
        })
        .map_err(|error| match error {
            ProviderError::NotFound => ApiError {
                status: StatusCode::NOT_FOUND,
                kind: "title_not_found",
                message: "This title is not available from the selected source".to_string(),
            },
            other => ApiError::provider(other),
        })?;
    let releases = provider_releases(
        &state.service,
        provider,
        &subject_id,
        season,
        episode,
        details.is_series(),
    )
    .await
    .map_err(ApiError::provider)?;
    let mut resolutions: Vec<u32> = releases
        .iter()
        .map(|release| release.resolution_u64().min(u32::MAX as u64) as u32)
        .filter(|resolution| *resolution > 0)
        .collect();
    resolutions.sort_unstable_by(|left, right| right.cmp(left));
    resolutions.dedup();
    let release = releases
        .iter()
        .filter(|release| {
            request
                .resolution
                .map(|wanted| release.resolution_u64() as u32 == wanted)
                .unwrap_or(true)
        })
        .find(|release| release.direct_url().is_some())
        .or_else(|| {
            releases
                .iter()
                .find(|release| release.direct_url().is_some())
        })
        .ok_or_else(|| ApiError {
            status: StatusCode::NOT_FOUND,
            kind: "stream_unavailable",
            message: format!("No playable stream is available from {provider}; try another search result or quality"),
        })?;
    let candidates = resolve_candidates(release);
    let first = candidates.first().ok_or_else(|| ApiError {
        status: StatusCode::NOT_FOUND,
        kind: "stream_unavailable",
        message: format!(
            "No playable stream is available from {provider}; try another search result or quality"
        ),
    })?;
    let url = first.url.clone();
    let kind = first.kind;
    let subtitles = if provider == ProviderKind::MovieBox && !subject_id.starts_with("wefeedshort~") {
        if let Some(resource_id) = release.resource_id.as_deref() {
            state
                .service
                .get_ext_captions(
                    &subject_id,
                    resource_id,
                    &details.sibling_ids(),
                    season,
                    episode,
                )
                .await
                .unwrap_or_default()
                .into_iter()
                .filter(|subtitle| {
                    subtitle.url.starts_with("http://") || subtitle.url.starts_with("https://")
                })
                .map(|subtitle| SubtitleResponse {
                    lang: subtitle.name.clone(),
                    label: subtitle.name,
                    url: subtitle.url,
                })
                .collect()
        } else {
            Vec::new()
        }
    } else {
        Vec::new()
    };
    Ok(Json(ResolveResponse {
        url,
        kind,
        headers: first.headers.clone(),
        candidates,
        subtitles,
        selected_resolution: release.resolution_u64().min(u32::MAX as u64) as u32,
        resolutions,
    }))
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let bind = std::env::var("CORE_BIND").unwrap_or_else(|_| "127.0.0.1:7070".to_string());
    let addr: SocketAddr = bind.parse()?;
    let service = Arc::new(MovieBoxService::new());
    // Load configured add-ons before accepting requests; otherwise the first
    // search can be cached without add-on results for several minutes.
    addon_sources::configure(&service).await;
    let state = AppState { service };
    let app = Router::new()
        .route("/health", get(health))
        .route("/search", get(search))
        .route("/shorts", get(shorts))
        .route("/title/{id}", get(title))
        .route("/resolve", post(resolve))
        .with_state(state);
    let listener = tokio::net::TcpListener::bind(addr).await?;
    println!("free-core listening on {addr}");
    axum::serve(listener, app).await?;
    Ok(())
}
