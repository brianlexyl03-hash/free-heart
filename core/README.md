# free-core

This Rust sidecar exposes the web contract by reusing the pinned upstream MovieBox-Tui provider/service implementation. It does not implement a second scraper.

## Routes

- `GET /health` → `{ ok, core }`
- `GET /search?q=&page=` → `{ results, page, hasMore }`
- `GET /title/:id` → title metadata and series episode keys
- `POST /resolve` with `{ id, episode, resolution? }` → selected upstream stream, allowed headers, upstream subtitles, `resolutions`, and `selectedResolution`

The sidecar binds to `127.0.0.1:7070` by default (`CORE_BIND` overrides this). The Fastify gateway should be the public boundary: it validates requests, removes sensitive provider details, tokenizes stream URLs, and proxies media responses.

Authorized sources only. Geo-unblocking, VPN functionality, proxy bypasses, TUI/mpv code paths, and provider credentials are not exposed by this adapter.
