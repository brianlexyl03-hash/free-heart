# free❤️‍🔥

An online, mobile-friendly PWA and Fastify API gateway around the upstream [MovieBox-Tui](https://github.com/mesamirh/MovieBox-Tui) Rust provider architecture.

## Deploy online with Render

This repository includes a production `Dockerfile` and `render.yaml` Blueprint. In Render:

1. Create a new **Blueprint** from this repository.
2. Render reads `render.yaml`, builds the Rust core in a multi-stage image, and starts the public web service.
3. Open the `https://<your-service>.onrender.com` URL after the health check becomes healthy.

Render supplies the public `PORT` automatically. The Fastify gateway binds to `0.0.0.0`; the Rust process binds to `127.0.0.1:7070` only as a private in-container service. That localhost address is never the public app URL.

### Owner-managed ads

Set `ADMIN_PASSWORD`, `AD_URL` (an HTTPS MP4/WebM ad URL you control), and `AD_DURATION_SECONDS` from `1` to `9` as Render environment variables. Visitors receive the same enabled ad before downloads and after 50 minutes of playback. The **Owner controls** page is available at `/#/admin`; enter the password and ad URL to publish a new global ad without rebuilding the app. Keep the password only in Render Environment settings.

## Local development

For local development only, with Node >= 20, Rust >= 1.90, and network access:

```sh
sh scripts/vendor-upstream.sh
sh scripts/start.sh
```

Then open `http://localhost:3000`.

## Architecture

- `core/` is a thin Axum HTTP adapter over upstream `MovieBoxService`, `Provider`, and `ReleaseProvider` interfaces.
- `third_party/moviebox-tui/src/` is pinned to the exact upstream commit recorded in `PROVENANCE.md`.
- `server/` validates and translates the sidecar contract, keeps rate limiting/log scrubbing, and tokenizes media URLs before browser delivery.
- `web/` is the PWA with search, title details, playback, subtitles, OPFS downloads, service worker, and PNG/SVG icons.
- `Dockerfile` builds the Rust core once and runs the public Node gateway plus private sidecar in one Render web service.
- Geo-unblocking, VPN behavior, proxy bypasses, and alternate scraping code paths are intentionally absent.

The player exposes every resolution returned by the live provider—for example 4K/2160p, 1080p, 720p, 480p, or 360p—without inventing unavailable qualities for a title.

## API contract

The private sidecar exposes `/health`, `/search`, `/title/:id`, and `POST /resolve`. The public Fastify gateway exposes the corresponding `/api/*` routes and retains the existing short-lived stream proxy.

## Provenance

Upstream MIT and Apache-2.0 license files are included. See `PROVENANCE.md` for the pinned commit and `NOTICE` for attribution.

## Verification

See `TEST_REPORT.md`; it lists only commands actually executed in the development environment. The Render image uses the same release build path and exposes `/api/health` as its health check.
