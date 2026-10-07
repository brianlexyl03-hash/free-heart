# MovieBox-TUI Web Stream Relay

This project is a browser-facing adapter for the public MovieBox-TUI ecosystem.

The important fix is at the media transport layer:

**Browser → `/api/stream/:id` → upstream CDN**

The browser never directly requests a protected upstream media URL. The server keeps the source headers and performs the upstream request itself.

## What was fixed

- Uses `GET` with `Range: bytes=0-1` for seekability verification instead of relying on `HEAD`.
- Requires a real `206 Partial Content` response for direct video sources.
- Forwards provider-required `User-Agent`, `Referer`, `Cookie`, `Origin`, and `Authorization` headers server-side.
- Forwards browser byte-range and conditional request headers.
- Preserves `Content-Range`, `Content-Length`, `Accept-Ranges`, `ETag`, `Last-Modified`, and `Content-Type`.
- Keeps HTTP/1.1-style long-lived media behavior at the HTTP transport layer instead of buffering the complete file.
- Rejects HTML/challenge pages being misreported as playable video.
- Handles redirects server-side.
- Selects among supplied stream candidates using seekability rather than blindly retrying the same broken URL.
- If a selected source later returns 403/410/429/5xx or stops honoring `Range`, the relay can move to another already-resolved candidate.
- Client disconnects abort the upstream fetch so dead playback requests do not continue consuming server bandwidth.
- Adds CORS response headers required by browser media clients.
- Uses an expiring server-side stream session so provider URLs and authentication headers are not placed directly in the `<video>` element.

## API

### Resolve sources

`POST /api/streams/resolve`

```json
{
  "sources": [
    {
      "url": "https://cdn.example/video.mp4",
      "quality": "1080p",
      "headers": {
        "User-Agent": "Mozilla/5.0",
        "Referer": "https://provider.example/",
        "Cookie": "session=...",
        "Authorization": "Bearer ..."
      }
    }
  ]
}
```

The endpoint probes candidates using:

```http
Range: bytes=0-1
```

A healthy direct file should return `206 Partial Content` with `Content-Range`.

Successful response:

```json
{
  "ok": true,
  "stream": {
    "id": "...",
    "url": "/api/stream/...",
    "quality": "1080p",
    "contentType": "video/mp4",
    "contentRange": "bytes 0-1/123456789",
    "contentLength": "2",
    "expiresAt": "..."
  }
}
```

### Play

Set the returned `stream.url` as the HTML video `src`.

The relay forwards the browser's `Range` request to the selected upstream source, which is the critical part for normal seeking and resume behavior.

## Running

```bash
npm install
npm start
```

The server binds to `0.0.0.0` and uses `PORT` when supplied by the hosting platform.

## Provider integration

MovieBox-TUI's native clients carry source-specific headers and, for protected/DASH playback, can route media through a loopback proxy. The web version therefore needs the same architectural idea: the browser talks to the relay, not directly to a source that expects native-client headers.

This repository deliberately does not invent a MovieBox JSON API that the upstream project does not expose. The upstream project documents its headless service, providers, playback headers, and relay behavior separately.

## Important limitation

This adapter repairs **transport/playback integration**. It does not invent stream URLs. Your provider layer still needs to return the actual candidate sources (URL + quality + required headers) obtained from the upstream provider/service.

Upstream project:
https://github.com/mesamirh/MovieBox-Tui
