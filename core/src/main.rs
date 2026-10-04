use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
};
use moviebox_tui::{
    providers::{
        Provider, ReleaseProvider,
        models::{CatalogItem, MediaDetails, MediaType, ProviderError, ProviderKind, Release},
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
    subtitles: Vec<SubtitleResponse>,
    resolutions: Vec<u32>,
    #[serde(rename = "selectedResolution")]
    selected_resolution: u32,
}

#[derive(Debug, Serialize)]
struct HealthResponse {
    ok: bool,
    core: &'static str,
}

fn item_response(item: CatalogItem) -> ItemResponse {
    ItemResponse {
        id: item.id.value,
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
        id: details.id.value,
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

async fn search(
    State(state): State<AppState>,
    Query(query): Query<SearchQuery>,
) -> Result<Json<SearchResponse>, ApiError> {
    let q = query.q.trim();
    if q.is_empty() || q.len() > 100 {
        return Err(ApiError::bad_request("q must contain 1–100 characters"));
    }
    let page = query.page.unwrap_or(1).clamp(1, 50);
    let items = Provider::search(&state.service.client, q, page)
        .await
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
    let details = state
        .service
        .details_typed(ProviderKind::MovieBox, &id)
        .await
        .map_err(ApiError::provider)?;
    Ok(Json(title_response(details)))
}

fn allowed_headers(release: &Release) -> HashMap<String, String> {
    release
        .mirrors
        .first()
        .into_iter()
        .flat_map(|mirror| mirror.headers.iter())
        .filter_map(|(name, value)| {
            let key = name.to_ascii_lowercase();
            (key == "referer" || key == "user-agent" || key == "cookie")
                .then(|| (key, value.clone()))
        })
        .collect()
}

async fn resolve(
    State(state): State<AppState>,
    Json(request): Json<ResolveRequest>,
) -> Result<Json<ResolveResponse>, ApiError> {
    if request.id.is_empty() || request.id.len() > 96 {
        return Err(ApiError::bad_request("Invalid title id"));
    }
    let (season, episode) = episode_parts(request.episode.as_deref())?;
    let details = state
        .service
        .details_typed(ProviderKind::MovieBox, &request.id)
        .await
        .map_err(ApiError::provider)?;
    let releases = state
        .service
        .client
        .episode_streams(&request.id, season, episode)
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
            status: StatusCode::BAD_GATEWAY,
            kind: "no_stream",
            message: "The upstream provider returned no playable stream".to_string(),
        })?;
    let url = release.direct_url().unwrap_or_default().to_string();
    let kind = if url.to_ascii_lowercase().contains(".m3u8") {
        "hls"
    } else {
        "file"
    };
    let subtitles = if let Some(resource_id) = release.resource_id.as_deref() {
        state
            .service
            .get_ext_captions(
                &request.id,
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
    };
    Ok(Json(ResolveResponse {
        url,
        kind,
        headers: allowed_headers(release),
        subtitles,
        selected_resolution: release.resolution_u64().min(u32::MAX as u64) as u32,
        resolutions,
    }))
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let bind = std::env::var("CORE_BIND").unwrap_or_else(|_| "127.0.0.1:7070".to_string());
    let addr: SocketAddr = bind.parse()?;
    let state = AppState {
        service: Arc::new(MovieBoxService::new()),
    };
    let app = Router::new()
        .route("/health", get(health))
        .route("/search", get(search))
        .route("/title/{id}", get(title))
        .route("/resolve", post(resolve))
        .with_state(state);
    let listener = tokio::net::TcpListener::bind(addr).await?;
    println!("free-core listening on {addr}");
    axum::serve(listener, app).await?;
    Ok(())
}
