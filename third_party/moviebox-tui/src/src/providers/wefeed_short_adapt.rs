//! Compatibility adapter between the WeFeed Short JSON API and Free Heart's
//! existing strongly typed provider models. The API may return metadata without
//! a playable URL; this adapter never fabricates media URLs.

use crate::providers::models::{
    CatalogItem, Episode, MediaDetails, MediaType, ProviderError, ProviderKind, ProviderMediaId,
    Release, Season, SourceMirror,
};
use crate::providers::wefeed_short::WeFeedShortClient;
use serde_json::Value;
use std::collections::{BTreeMap, HashSet};

const ID_PREFIX: &str = "wefeedshort~";
const MAX_SCAN_DEPTH: usize = 14;

fn api_error(error: impl std::fmt::Display) -> ProviderError {
    ProviderError::Unavailable(error.to_string())
}

fn source_id(value: &str) -> Result<&str, ProviderError> {
    let value = value.trim();
    let value = value.strip_prefix("moviebox:").unwrap_or(value);
    let value = value.strip_prefix(ID_PREFIX).unwrap_or(value).trim();
    if value.is_empty() || value.len() > 256 || value.chars().any(char::is_control) {
        return Err(ProviderError::NotFound);
    }
    Ok(value)
}

fn value_text(value: &Value) -> Option<String> {
    value
        .as_str()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .or_else(|| value.as_i64().map(|n| n.to_string()))
        .or_else(|| value.as_u64().map(|n| n.to_string()))
}

fn text(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(value_text))
}

fn number(value: &Value, keys: &[&str]) -> Option<usize> {
    keys.iter().find_map(|key| {
        let value = value.get(*key)?;
        value
            .as_u64()
            .and_then(|n| usize::try_from(n).ok())
            .or_else(|| {
                value
                    .as_i64()
                    .filter(|n| *n >= 0)
                    .and_then(|n| usize::try_from(n).ok())
            })
            .or_else(|| value.as_str().and_then(|s| s.trim().parse::<usize>().ok()))
    })
}

fn url_text(value: &Value, direct_keys: &[&str]) -> Option<String> {
    for key in direct_keys {
        if let Some(found) = value.get(*key).and_then(value_text) {
            return Some(found);
        }
    }
    for key in [
        "cover",
        "poster",
        "image",
        "videoAddress",
        "video",
        "resource",
    ] {
        if let Some(nested) = value.get(key) {
            if let Some(found) = nested.as_str().map(str::trim).filter(|s| !s.is_empty()) {
                return Some(found.to_string());
            }
            if let Some(found) = text(nested, &["url", "src", "coverUrl", "posterUrl", "videoUrl"])
            {
                return Some(found);
            }
        }
    }
    None
}

fn source_identifier(row: &Value) -> Option<String> {
    text(
        row,
        &["subjectId", "subject_id", "subjectID", "id", "videoId"],
    )
}

fn is_catalog_row(value: &Value) -> bool {
    value.is_object()
        && source_identifier(value).is_some()
        && text(value, &["title", "subjectTitle", "name", "subjectName"]).is_some()
}

fn is_metadata_row(value: &Value) -> bool {
    value.is_object() && text(value, &["title", "subjectTitle", "name", "subjectName"]).is_some()
}

fn has_direct_video_url(value: &Value) -> bool {
    let direct = [
        "url",
        "videoUrl",
        "playUrl",
        "streamUrl",
        "resourceLink",
        "sourceUrl",
    ];
    if direct
        .iter()
        .any(|key| value.get(*key).and_then(Value::as_str).is_some())
    {
        return true;
    }
    ["video", "videoAddress", "resource"].iter().any(|key| {
        value.get(*key).is_some_and(|nested| {
            nested.as_str().is_some()
                || [
                    "url",
                    "videoUrl",
                    "playUrl",
                    "streamUrl",
                    "resourceLink",
                    "sourceUrl",
                ]
                .iter()
                .any(|child| nested.get(*child).and_then(Value::as_str).is_some())
        })
    })
}

fn is_episode_row(value: &Value) -> bool {
    value.is_object()
        && (number(value, &["ep", "episode", "episodeNumber", "number"]).is_some()
            || (has_direct_video_url(value)
                && (source_identifier(value).is_some()
                    || text(value, &["resourceId", "resourceLink", "sourceUrl"]).is_some())))
}

/// Recursively find row-like objects in common response wrappers. Prefer known
/// list keys and cap depth so a malformed response cannot recurse indefinitely.
fn collect_matching(value: &Value, predicate: fn(&Value) -> bool, depth: usize) -> Vec<Value> {
    if depth > MAX_SCAN_DEPTH {
        return Vec::new();
    }
    if predicate(value) {
        return vec![value.clone()];
    }
    match value {
        Value::Array(items) => {
            let direct: Vec<Value> = items
                .iter()
                .filter(|item| predicate(item))
                .cloned()
                .collect();
            if !direct.is_empty() {
                return direct;
            }
            let mut result = Vec::new();
            for item in items {
                result.extend(collect_matching(item, predicate, depth + 1));
                if !result.is_empty() {
                    break;
                }
            }
            result
        }
        Value::Object(map) => {
            for key in [
                "items",
                "list",
                "results",
                "subjects",
                "shorts",
                "episodes",
                "miniList",
                "mini_list",
                "resources",
                "records",
                "data",
                "result",
                "subject",
                "item",
            ] {
                if let Some(child) = map.get(key) {
                    let found = collect_matching(child, predicate, depth + 1);
                    if !found.is_empty() {
                        return found;
                    }
                }
            }
            for child in map.values() {
                let found = collect_matching(child, predicate, depth + 1);
                if !found.is_empty() {
                    return found;
                }
            }
            Vec::new()
        }
        _ => Vec::new(),
    }
}

fn year_from(row: &Value) -> Option<String> {
    text(row, &["year", "releaseYear", "releaseDate", "publishYear"]).and_then(|raw| {
        raw.as_str()
            .get(..4)
            .filter(|prefix| prefix.chars().all(|c| c.is_ascii_digit()))
            .map(str::to_string)
            .or(Some(raw))
    })
}

fn media_type(row: &Value) -> MediaType {
    if number(row, &["totalEpisode", "episodeCount", "totalEpisodes"]).unwrap_or(0) > 0 {
        return MediaType::Series;
    }
    let kind = text(row, &["subjectType", "type", "mediaType"])
        .unwrap_or_default()
        .to_ascii_lowercase();
    if kind.contains("movie") || kind == "1" || kind == "0" {
        // Some source versions use numeric enum values. With no explicit
        // episode count, preserve a declared movie; otherwise default to series.
        if kind.contains("movie") {
            return MediaType::Movie;
        }
    }
    MediaType::Series
}

fn catalog_item(row: &Value) -> Option<CatalogItem> {
    let source_id = source_identifier(row)?;
    let title = text(row, &["title", "subjectTitle", "name", "subjectName"])?;
    let poster_url = url_text(row, &["coverUrl", "posterUrl", "imageUrl", "cover"]);
    Some(CatalogItem {
        id: ProviderMediaId {
            provider: ProviderKind::MovieBox,
            value: format!("{ID_PREFIX}{source_id}"),
        },
        title,
        media_type: media_type(row),
        year: year_from(row),
        poster_url,
        season_count: number(row, &["seasonCount", "totalSeason"]),
    })
}

fn episodes_to_seasons(rows: &[Value]) -> Vec<Season> {
    let mut grouped: BTreeMap<usize, Vec<Episode>> = BTreeMap::new();
    let mut seen = HashSet::new();
    for (index, row) in rows.iter().enumerate() {
        let episode =
            number(row, &["ep", "episode", "episodeNumber", "number"]).unwrap_or(index + 1);
        if episode == 0 {
            continue;
        }
        let season = number(row, &["se", "season", "seasonNumber"])
            .filter(|n| *n > 0)
            .unwrap_or(1);
        if !seen.insert((season, episode)) {
            continue;
        }
        let title = text(row, &["episodeTitle", "epTitle", "title", "name"])
            .or_else(|| Some(format!("Episode {episode}")));
        grouped.entry(season).or_default().push(Episode {
            season,
            number: episode,
            title,
            overview: text(row, &["description", "overview", "intro"]),
        });
    }
    grouped
        .into_iter()
        .map(|(number, mut episodes)| {
            episodes.sort_by_key(|episode| episode.number);
            Season { number, episodes }
        })
        .collect()
}

fn valid_video_url(raw: &str) -> bool {
    let Ok(url) = url::Url::parse(raw.trim()) else {
        return false;
    };
    if url.scheme() != "http" && url.scheme() != "https" {
        return false;
    }
    let path = url.path().to_ascii_lowercase();
    ![
        ".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".avif", ".bmp",
    ]
    .iter()
    .any(|extension| path.ends_with(extension))
}

fn push_valid_url(found: &mut Vec<String>, candidate: Option<String>) {
    if let Some(candidate) = candidate {
        let candidate = candidate.trim().to_string();
        if valid_video_url(&candidate) && !found.iter().any(|existing| existing == &candidate) {
            found.push(candidate);
        }
    }
}

fn video_urls(row: &Value) -> Vec<String> {
    let mut found = Vec::new();
    for key in [
        "url",
        "videoUrl",
        "playUrl",
        "streamUrl",
        "resourceLink",
        "sourceUrl",
    ] {
        push_valid_url(&mut found, row.get(key).and_then(value_text));
    }
    for key in ["video", "videoAddress", "resource", "media"] {
        if let Some(nested) = row.get(key) {
            if let Some(raw) = nested.as_str() {
                push_valid_url(&mut found, Some(raw.to_string()));
            } else {
                for child in [
                    "url",
                    "videoUrl",
                    "playUrl",
                    "streamUrl",
                    "resourceLink",
                    "sourceUrl",
                ] {
                    push_valid_url(&mut found, nested.get(child).and_then(value_text));
                }
                // The APK's common DTO path is video.videoAddress.url.
                for deeper_key in ["videoAddress", "address", "media", "resource"] {
                    if let Some(deeper) = nested.get(deeper_key) {
                        if let Some(raw) = deeper.as_str() {
                            push_valid_url(&mut found, Some(raw.to_string()));
                        } else {
                            for child in [
                                "url",
                                "videoUrl",
                                "playUrl",
                                "streamUrl",
                                "resourceLink",
                                "sourceUrl",
                            ] {
                                push_valid_url(&mut found, deeper.get(child).and_then(value_text));
                            }
                        }
                    }
                }
            }
        }
    }
    found
}

fn releases_from_payload(
    payload: &Value,
    requested_season: usize,
    requested_episode: usize,
) -> Vec<Release> {
    let rows = collect_matching(payload, is_episode_row, 0);
    let mut output = Vec::new();
    let mut seen = HashSet::new();
    for row in rows {
        let row_episode = number(&row, &["ep", "episode", "episodeNumber", "number"]);
        let row_season = number(&row, &["se", "season", "seasonNumber"])
            .filter(|n| *n > 0)
            .unwrap_or(1);
        if requested_episode > 0 && row_episode != Some(requested_episode) {
            continue;
        }
        if requested_season > 0 && row_season != requested_season {
            continue;
        }
        let urls = video_urls(&row);
        if urls.is_empty() {
            continue;
        }
        let resolution = text(&row, &["resolution", "quality", "definition"])
            .or_else(|| {
                row.get("video")
                    .and_then(|v| text(v, &["resolution", "quality"]))
            })
            .map(normalize_quality);
        let episode_label = row_episode
            .map(|n| format!("Episode {n}"))
            .unwrap_or_else(|| "Short drama".to_string());
        for url in urls {
            if !seen.insert(url.clone()) {
                continue;
            }
            output.push(Release {
                provider: ProviderKind::MovieBox,
                filename: text(&row, &["title", "fileName", "name"])
                    .unwrap_or_else(|| episode_label.clone()),
                quality: resolution.clone(),
                codec: text(&row, &["codec", "codecName"]),
                language: text(&row, &["language", "lanName"]),
                size_bytes: number(&row, &["sizeBytes", "size"]).map(|value| value as u64),
                season: Some(row_season),
                episode: row_episode,
                mirrors: vec![SourceMirror {
                    label: "WeFeed Short".to_string(),
                    resolver_url: url,
                    headers: Vec::new(),
                    direct_file: true,
                }],
                resource_id: text(&row, &["resourceId", "resource_id"]),
            });
        }
    }
    output.sort_by(|left, right| right.resolution_u64().cmp(&left.resolution_u64()));
    output
}

fn normalize_quality(value: String) -> String {
    if value.ends_with('p')
        || value.ends_with('P')
        || value.eq_ignore_ascii_case("4k")
        || value.eq_ignore_ascii_case("uhd")
    {
        value
    } else if !value.is_empty() && value.chars().all(|c| c.is_ascii_digit()) {
        format!("{value}p")
    } else {
        value
    }
}

pub async fn search(
    client: &WeFeedShortClient,
    query: &str,
    page: usize,
) -> Result<Vec<CatalogItem>, ProviderError> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    if query.len() > 100 {
        return Err(ProviderError::Unavailable(
            "WeFeed Short search query is too long".to_string(),
        ));
    }
    let payload = client
        .search(query, page.max(1), 20)
        .await
        .map_err(api_error)?;
    let rows = collect_matching(&payload, is_catalog_row, 0);
    Ok(rows.iter().filter_map(catalog_item).collect())
}

pub async fn details(
    client: &WeFeedShortClient,
    namespaced_or_raw_id: &str,
) -> Result<MediaDetails, ProviderError> {
    let id = source_id(namespaced_or_raw_id)?;
    let payload = client.get_info(id).await.map_err(api_error)?;
    let row = collect_matching(&payload, is_metadata_row, 0)
        .into_iter()
        .next()
        .ok_or(ProviderError::NotFound)?;
    let title = text(&row, &["title", "subjectTitle", "name", "subjectName"])
        .ok_or(ProviderError::NotFound)?;
    let mini_list = client.mini_list(id, 0, 500, "0").await.ok();
    let seasons = mini_list
        .as_ref()
        .map(|value| episodes_to_seasons(&collect_matching(value, is_episode_row, 0)))
        .unwrap_or_default();
    let source_id = source_identifier(&row).unwrap_or_else(|| id.to_string());

    Ok(MediaDetails {
        id: ProviderMediaId {
            provider: ProviderKind::MovieBox,
            value: format!("{ID_PREFIX}{source_id}"),
        },
        title,
        media_type: if !seasons.is_empty() {
            MediaType::Series
        } else {
            media_type(&row)
        },
        year: year_from(&row),
        description: text(&row, &["description", "overview", "intro", "content"]),
        tagline: text(&row, &["tagline", "subTitle", "subtitle"]),
        imdb_rating: text(&row, &["imdbRating", "rating", "score"]),
        director: text(&row, &["director"]),
        stars: text(&row, &["stars", "cast", "actors"]),
        prints: None,
        audios: None,
        poster_url: url_text(&row, &["coverUrl", "posterUrl", "imageUrl", "cover"]),
        duration: text(&row, &["duration", "runtime"]),
        genres: match row.get("genres") {
            Some(Value::Array(items)) => items.iter().filter_map(value_text).collect(),
            Some(value) => value_text(value)
                .map(|v| {
                    v.split(',')
                        .map(str::trim)
                        .filter(|s| !s.is_empty())
                        .map(str::to_string)
                        .collect()
                })
                .unwrap_or_default(),
            None => Vec::new(),
        },
        seasons,
        dubs: Vec::new(),
    })
}

pub async fn releases(
    client: &WeFeedShortClient,
    namespaced_or_raw_id: &str,
    season: usize,
    episode: usize,
) -> Result<Vec<Release>, ProviderError> {
    let id = source_id(namespaced_or_raw_id)?;
    if let Ok(payload) = client.mini_list(id, 0, 500, "0").await {
        let releases = releases_from_payload(&payload, season, episode);
        if !releases.is_empty() {
            return Ok(releases);
        }
    }
    // Resource endpoints may carry an explicit URL and an episode number. They
    // are a fallback only; rows without episode identity are not used for an
    // episode-specific request to avoid playing a different episode by mistake.
    if let Ok(payload) = client.resource_page(id, 1, 50, None).await {
        let releases = releases_from_payload(&payload, season, episode);
        if !releases.is_empty() {
            return Ok(releases);
        }
    }
    Err(ProviderError::Unavailable(
        "WeFeed Short returned no directly playable URL for the requested episode".to_string(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn source_ids_accept_namespaced_and_raw_values() {
        assert_eq!(source_id("wefeedshort~drama-7").unwrap(), "drama-7");
        assert_eq!(
            source_id("moviebox:wefeedshort~drama-7").unwrap(),
            "drama-7"
        );
        assert!(source_id("wefeedshort~").is_err());
    }

    #[test]
    fn search_response_maps_catalog_rows() {
        let value = json!({"data":{"items":[
            {"subjectId":"drama-7","title":"Test Drama","cover":"https://cdn.example/poster.jpg","totalEpisode":12}
        ]}});
        let rows = collect_matching(&value, is_catalog_row, 0);
        let items: Vec<CatalogItem> = rows.iter().filter_map(catalog_item).collect();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].id.value, "wefeedshort~drama-7");
        assert_eq!(items[0].media_type, MediaType::Series);
    }

    #[test]
    fn episode_mapping_is_sorted_and_rejects_image_urls() {
        let payload = json!({"data":{"items":[
            {"se":1,"ep":2,"title":"Second","video":{"videoAddress":{"url":"https://cdn.example/e2.m3u8"}}},
            {"se":1,"ep":1,"title":"First","video":{"videoAddress":{"url":"https://cdn.example/e1.m3u8"}}}
        ]}});
        let rows = collect_matching(&payload, is_episode_row, 0);
        let seasons = episodes_to_seasons(&rows);
        assert_eq!(seasons[0].episodes[0].number, 1);
        assert!(!valid_video_url("https://cdn.example/poster.jpg"));
        let releases = releases_from_payload(&payload, 1, 2);
        assert_eq!(releases.len(), 1);
        assert_eq!(releases[0].episode, Some(2));
    }
}
