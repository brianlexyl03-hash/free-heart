#!/usr/bin/env python3
"""Collect and validate direct HTTP/HLS streams from authorized Stremio add-ons.

This intentionally does not scrape watch pages, bypass anti-bot controls, resolve
iframe embeds, or handle torrents/debrid services. It uses the public Stremio
manifest/stream contract and accepts only sources the operator is authorized to use.

Example:
  python tools/authorized_stremio_scraper.py \
    --manifest https://authorized-addon.example/manifest.json \
    --type movie --id tt0111161
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass
from html import unescape
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import Request, build_opener, HTTPRedirectHandler

USER_AGENT = "FreeHeartAuthorizedStreamAdapter/1.0"
MAX_MANIFEST_BYTES = 512 * 1024
MAX_PLAYLIST_BYTES = 2 * 1024 * 1024
TIMEOUT = 10

# This is deliberately conservative. A false positive removes one candidate;
# allowing a page/ad URL can poison playback and expose the user to a redirect.
AD_TOKENS = (
    "advert", "advertisement", "adserver", "adservice", "adbreak", "adstart",
    "adend", "preroll", "midroll", "postroll", "vast", "vmap", "doubleclick",
    "googlesyndication", "popunder", "clickunder", "banner", "sponsor",
    "tracking", "analytics", "pixel.gif", "beacon", "promo",
)
PAGE_CONTENT_TYPES = ("text/html", "application/xhtml", "application/json", "text/xml")
MEDIA_CONTENT_TYPES = ("video/", "audio/", "application/vnd.apple.mpegurl", "application/x-mpegurl")


class SafeRedirectHandler(HTTPRedirectHandler):
    """Keep redirects enabled; each final URL is checked again before acceptance."""


OPENER = build_opener(SafeRedirectHandler())


@dataclass
class Candidate:
    source: str
    title: str
    url: str
    kind: str
    quality: str | None
    headers: dict[str, str]
    duration: int | None = None
    reason: str | None = None


def fetch(url: str, *, headers: dict[str, str] | None = None, max_bytes: int = MAX_MANIFEST_BYTES) -> tuple[str, dict[str, str], bytes]:
    request = Request(url, headers={"User-Agent": USER_AGENT, **(headers or {})})
    with OPENER.open(request, timeout=TIMEOUT) as response:
        content = response.read(max_bytes + 1)
        if len(content) > max_bytes:
            raise ValueError(f"response exceeds {max_bytes} bytes")
        return response.geturl(), {k.lower(): v for k, v in response.headers.items()}, content


def public_https(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme in {"http", "https"} and bool(parsed.hostname) and "@" not in parsed.netloc


def looks_like_ad(url: str) -> bool:
    value = unescape(url).lower()
    parsed = urlparse(value)
    host_path = f"{parsed.hostname or ''}{parsed.path}?{parsed.query}"
    return any(token in host_path for token in AD_TOKENS)


def is_page_content(content_type: str) -> bool:
    return any(content_type.startswith(item) for item in PAGE_CONTENT_TYPES)


def stream_endpoint(manifest_url: str, media_type: str, media_id: str) -> str:
    base = manifest_url.rsplit("/", 1)[0] + "/"
    return urljoin(base, f"stream/{media_type}/{media_id}.json")


def manifest_is_stream_capable(manifest: dict[str, Any]) -> bool:
    resources = manifest.get("resources") or []
    for resource in resources:
        name = resource.get("name") if isinstance(resource, dict) else resource
        if name == "stream":
            return True
    return False


def playlist_is_clean(final_url: str, body: bytes) -> tuple[bool, str | None]:
    text = body.decode("utf-8", "replace")
    if not text.lstrip().startswith("#EXTM3U"):
        return False, "HLS response is not an M3U8 playlist"
    if any(marker in text.upper() for marker in ("#EXT-X-CUE-OUT", "#EXT-X-CUE-IN", "#EXT-X-SCTE35", "#EXT-X-AD")):
        return False, "playlist contains an ad insertion marker"
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        segment = urljoin(final_url, line)
        if looks_like_ad(segment):
            return False, "playlist contains an ad-like segment URL"
    return True, None


def validate_direct_url(url: str, supplied_headers: dict[str, str]) -> tuple[str, str | None]:
    if not public_https(url):
        return "", "not an HTTP(S) URL"
    if looks_like_ad(url):
        return "", "ad-like URL"
    try:
        probe_headers = {**supplied_headers, "Range": "bytes=0-65535"}
        final_url, response_headers, body = fetch(url, headers=probe_headers, max_bytes=MAX_PLAYLIST_BYTES)
    except (HTTPError, URLError, TimeoutError, ValueError) as exc:
        return "", f"upstream validation failed: {exc}"
    if not public_https(final_url):
        return "", "redirected to a non-HTTP(S) URL"
    content_type = response_headers.get("content-type", "").split(";", 1)[0].lower()
    if is_page_content(content_type):
        return "", f"page response ({content_type or 'unknown content type'})"
    is_hls = ".m3u8" in urlparse(final_url).path.lower() or "mpegurl" in content_type
    if is_hls:
        clean, reason = playlist_is_clean(final_url, body)
        return (final_url, None) if clean else ("", reason)
    if content_type and not any(content_type.startswith(item) for item in MEDIA_CONTENT_TYPES) and content_type != "application/octet-stream":
        return "", f"non-media response ({content_type})"
    # A range body is enough to establish that a direct file endpoint returns
    # bytes; do not download the movie during discovery.
    if not body:
        return "", "empty media response"
    return final_url, None


def quality_from_stream(stream: dict[str, Any]) -> str | None:
    for key in ("quality", "title", "name"):
        value = stream.get(key)
        if value is not None:
            match = re.search(r"(?:^|\D)(\d{3,4}p)(?:\D|$)", str(value), re.I)
            if match:
                return match.group(1).lower()
    return None


def collect(manifest_url: str, media_type: str, media_id: str) -> tuple[list[Candidate], list[str]]:
    errors: list[str] = []
    candidates: list[Candidate] = []
    if not public_https(manifest_url):
        return [], ["manifest must use HTTP(S) with a public hostname"]
    try:
        final_manifest, _, raw_manifest = fetch(manifest_url)
        manifest = json.loads(raw_manifest.decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, ValueError, json.JSONDecodeError) as exc:
        return [], [f"manifest failed: {exc}"]
    if not manifest_is_stream_capable(manifest):
        return [], ["manifest does not advertise a stream resource"]
    endpoint = stream_endpoint(final_manifest, media_type, media_id)
    try:
        _, _, raw_streams = fetch(endpoint)
        payload = json.loads(raw_streams.decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, ValueError, json.JSONDecodeError) as exc:
        return [], [f"stream endpoint failed: {exc}"]
    for item in payload.get("streams") or []:
        if not isinstance(item, dict):
            continue
        raw_url = item.get("url")
        # Ignore externalUrl, ytId, infoHash, magnet, and embed/page fields.
        if not isinstance(raw_url, str) or not public_https(raw_url):
            continue
        headers = {
            str(k): str(v)
            for k, v in (item.get("behaviorHints", {}).get("proxyHeaders", {}) or {}).items()
            if str(k).lower() in {"referer", "origin", "user-agent", "cookie"}
        }
        validated, reason = validate_direct_url(raw_url, headers)
        title = str(item.get("title") or item.get("name") or "")
        if not validated:
            errors.append(f"{raw_url}: {reason}")
            continue
        candidates.append(Candidate(
            source=manifest_url,
            title=title,
            url=validated,
            kind="hls" if ".m3u8" in validated.lower() else "file",
            quality=quality_from_stream(item),
            headers=headers,
        ))
    return candidates, errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", action="append", required=True, help="Authorized HTTPS Stremio manifest; repeat for multiple sources")
    parser.add_argument("--type", choices=("movie", "series"), required=True)
    parser.add_argument("--id", required=True, help="Movie IMDb/TMDB ID or series ID with season/episode handled by the add-on")
    parser.add_argument("--out", help="Write JSON results to this file instead of stdout")
    args = parser.parse_args()
    all_candidates: list[Candidate] = []
    errors: list[str] = []
    for manifest in args.manifest:
        found, rejected = collect(manifest, args.type, args.id)
        all_candidates.extend(found)
        errors.extend(f"{manifest}: {message}" for message in rejected)
    # Stable de-duplication prevents several manifests from returning the same URL.
    unique: dict[str, Candidate] = {candidate.url: candidate for candidate in all_candidates}
    result = {
        "media_type": args.type,
        "id": args.id,
        "count": len(unique),
        "streams": [asdict(candidate) for candidate in unique.values()],
        "rejected": errors,
    }
    encoded = json.dumps(result, indent=2, ensure_ascii=False)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as handle:
            handle.write(encoded + "\n")
    else:
        print(encoded)
    return 0 if unique else 2


if __name__ == "__main__":
    sys.exit(main())
