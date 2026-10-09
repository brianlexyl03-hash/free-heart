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

### Recommendations and updates

Recommendations are opt-in and online-only. The browser keeps up to four recent search/title seeds locally, then checks at most once in each morning, noon, evening, and night window. The server receives those short-lived seeds only to return matching search results; it does not store an account, watch profile, or notification history. Browser notifications require the visitor to tap **Notify me of picks**. The About page also checks the pinned `UPSTREAM_COMMIT` against the upstream MovieBox-TUI GitHub main branch once per day and shows one owner update notice when a newer commit is detected.

The static PWA shell is cacheable by a CDN/service worker, while `/api/*` and stream responses remain uncached and personalized. Set `SOCIAL_WHATSAPP_URL` in Render if a WhatsApp contact link is desired; Instagram is `@try_it_nah`.

Owner controls are not linked in the public navigation. Direct access to `/#/admin` shows only a password prompt; the ad form is rendered only after `/api/admin/check` verifies the owner password, and publishing remains protected by the same server-side password.

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

Downloads use a service-worker queue and Origin Private File System storage. Up to three file downloads run concurrently, progress is persisted locally, and returning to the PWA restores queued/downloading/completed states. The queue continues while the page is backgrounded or the user navigates within the app. Browser engines may suspend service workers when the browser is fully force-closed; no web app can guarantee work after an operating-system force-stop. HLS sources remain playable but cannot be saved as a single file.

### Clip Studio and short-form publishing

The player and offline Downloads page include **Clip Studio**. It renders a user-selected 1–60 second segment in the browser using `MediaRecorder`, so it works while watching a same-origin stream and while playing an offline OPFS download. The editor creates a title, suggested caption, and hashtags, then supports local download, native device sharing, and copying the caption. See [`automation/README.md`](automation/README.md) for the reviewed n8n patterns and the recommended official-API publishing flow.

The app does not collect social passwords or use unofficial Instagram/TikTok/Facebook/YouTube scraping. Direct publishing requires the selected platform’s official OAuth/app credentials in an owner-controlled automation service such as n8n, Make, or PostWire. Only clip media that you own or are licensed to republish.

Clip Studio also includes one-click **AI captions**. Users can connect OpenAI, xAI/Grok, OpenRouter, Ollama, LM Studio, or any OpenAI-compatible gateway by choosing a preset, model, endpoint, and API key. The key stays in the browser unless the owner configures a server-side default with `AI_BASE_URL`, `AI_MODEL`, and `AI_API_KEY`. See [`automation/README.md`](automation/README.md) for MCP, GetLeads.io, trend-source, OpenCut, and OpenReel integration guidance.

Clip Studio can also publish rendered clips through the official **Postiz Public API**: load connected channels, choose Instagram/YouTube/TikTok/Facebook or another Postiz integration, upload the clip, and post it immediately. Configure `PUBLIC_SITE_URL` in deployment for crawlable homepage/About/title routes, canonical URLs, Open Graph previews, `robots.txt`, and `sitemap.xml`. This improves discoverability but cannot guarantee Google rankings; submit the sitemap through Google Search Console after deployment.

The attached `free-live-classic` package is integrated as the **Live Match Center** at `#/live`. It provides cached ESPN scoreboards, fixtures, local-day navigation, match details, follow alerts while the app is open, and legitimate broadcaster listings. It deliberately does not import unauthorized stream-finder bridges or re-stream sports channels. See [`docs/LIVE-SECTION.md`](docs/LIVE-SECTION.md).

The latest Live Match Center update also supports **targeted closed-app Web Push alerts**. When VAPID push is configured and a user enables notifications, the server stores that browser’s followed match/team list and sends goal, kick-off, half-time, full-time, postponed, and reminder alerts only to that subscription. Without VAPID configuration, the feature safely falls back to in-page alerts.

For movie playback and downloads, the gateway now preserves all resolver mirrors and their provider headers. If one allowed source is expired, blocked, or temporarily unavailable, the player and offline downloader try the next resolver mirror before requesting a fresh resolution. This improves reliability without bypassing a source’s access controls.

### VLC-style player controls

The player includes volume and mute, visual brightness, Fit/Fill sizing, fullscreen, Picture-in-Picture, keyboard shortcuts (`Space`, `F`, and `M`), and Screen Wake Lock through the browser. Wake Lock prevents supported devices from dimming or locking while the user is watching; the operating system may still release it for battery or policy reasons. A website cannot change Android or iOS hardware brightness directly, so the brightness control adjusts the video’s visual brightness instead.

### Captions

MovieBox captions come from the same resolved MovieBox resource and episode, including sibling audio/dub IDs when the upstream service provides them. The adapter keeps the raw subject ID separate from the provider-qualified web ID, deduplicates language tracks, preserves the original caption URLs behind short-lived tokens, and exposes browser-native language selection. It does not mix a subtitle from a different title or episode. Timing remains the source provider’s responsibility; the browser consumes the provider’s WebVTT/SRT track against the exact stream resource.

## API contract

The private sidecar exposes `/health`, `/search`, `/title/:id`, and `POST /resolve`. The public Fastify gateway exposes the corresponding `/api/*` routes and retains the existing short-lived stream proxy.

## Provenance

Upstream MIT and Apache-2.0 license files are included. See `PROVENANCE.md` for the pinned commit and `NOTICE` for attribution.

## Verification

See `TEST_REPORT.md`; it lists only commands actually executed in the development environment. The Render image uses the same release build path and exposes `/api/health` as its health check.
