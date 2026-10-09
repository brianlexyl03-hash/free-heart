<div align="center">
  <a href="https://github.com/brianlexyl03-hash/free-heart">
    <img src="https://raw.githubusercontent.com/brianlexyl03-hash/free-heart/main/web/icon-512.png" width="112" alt="free-heart icon">
  </a>

  <h1>free❤️‍🔥</h1>
  <p><strong>Watch it. Save it. Shape the moment.</strong></p>
  <p>A mobile-first PWA for discovering stories, watching with resilient playback, clipping short-form edits, generating captions with your preferred AI, and connecting to official publishing workflows.</p>

  <p>
    <a href="https://github.com/brianlexyl03-hash/free-heart/commits/main"><img src="https://img.shields.io/github/last-commit/brianlexyl03-hash/free-heart?style=for-the-badge&color=ff5ea8" alt="Last commit"></a>
    <a href="https://github.com/brianlexyl03-hash/free-heart/blob/main/NOTICE"><img src="https://img.shields.io/badge/attribution-NOTICE-20c997?style=for-the-badge" alt="Attribution notice"></a>
    <img src="https://img.shields.io/badge/Node.js-20%2B-5fa04e?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js 20 or newer">
    <img src="https://img.shields.io/badge/Rust-1.90%2B-dc584c?style=for-the-badge&logo=rust&logoColor=white" alt="Rust 1.90 or newer">
    <a href="https://github.com/brianlexyl03-hash/free-heart"><img src="https://img.shields.io/github/stars/brianlexyl03-hash/free-heart?style=for-the-badge&color=ffc857" alt="GitHub stars"></a>
  </p>
</div>

<p align="center">
  <img src="https://raw.githubusercontent.com/brianlexyl03-hash/free-heart/main/docs/readme-hero.svg" alt="Animated free-heart workflow: discover, clip, connect" width="100%">
</p>

> **A note on the animation:** the hero is a lightweight SVG storyboard designed for GitHub. It shows the product loop without pretending that a screenshot is a live session. For the real application, deploy the included Render blueprint and set `PUBLIC_SITE_URL`.

### Watch the workflow

<p align="center">
  <a href="https://github.com/brianlexyl03-hash/free-heart/blob/main/docs/media/free-heart-walkthrough.mp4">
    <img src="https://raw.githubusercontent.com/brianlexyl03-hash/free-heart/main/docs/readme-hero.svg" alt="Open the free-heart walkthrough video" width="82%">
  </a>
</p>

<p align="center"><a href="https://github.com/brianlexyl03-hash/free-heart/blob/main/docs/media/free-heart-walkthrough.mp4">▶ Open the 12-second product walkthrough video</a></p>

GitHub renders repository video files on their file page rather than reliably playing them inline in every README client. The animated SVG above is the instant preview; the MP4 is the higher-fidelity walkthrough.

## The 30-second story

1. **Discover** a movie, series, episode, or live matchday fixture.
2. **Watch** through the PWA player with subtitles, quality switching, and resilient permitted-source fallback.
3. **Save** authorized file sources for private offline playback.
4. **Clip** a 1–60 second moment in Clip Studio while streaming or from an offline download.
5. **Caption** it with a browser-connected AI provider or a local OpenAI-compatible model.
6. **Share** through native device sharing, download, Postiz, n8n, or the platform’s official API workflow.

## What makes it different

| Capability | What it does | Where to explore |
|---|---|---|
| **Resilient playback** | Keeps all permitted resolver mirrors and rotates after expired, refused, or range-incompatible sources. | [`core/src/main.rs`](core/src/main.rs) · [`web/app.js`](web/app.js) |
| **Offline-first clipping** | Uses MediaRecorder and browser storage for private, local editing without uploading a video by default. | [`web/clipper.js`](web/clipper.js) · [`web/sw.js`](web/sw.js) |
| **AI captions** | Connects OpenAI-compatible gateways, OpenAI, xAI/Grok, OpenRouter, Gemini-friendly presets, Ollama, and LM Studio. | [`web/ai-connectors.js`](web/ai-connectors.js) |
| **Live Match Center** | Cached scores, fixtures, match sheets, legitimate broadcaster listings, follow alerts, and targeted Web Push. | [`docs/LIVE-SECTION.md`](docs/LIVE-SECTION.md) |
| **Official publishing** | Postiz API handoff and documented n8n patterns for platform-compliant publishing. | [`web/postiz.js`](web/postiz.js) · [`automation/README.md`](automation/README.md) |
| **Search-ready shell** | Canonicals, Open Graph, structured data, robots, sitemap, and Google Search Console verification support. | [`web/index.html`](web/index.html) · [`server/src/index.js`](server/src/index.js) |

## How the system fits together

<p align="center">
  <img src="https://raw.githubusercontent.com/brianlexyl03-hash/free-heart/main/docs/readme-architecture.png" alt="free-heart architecture diagram" width="100%">
</p>

- **`web/`** is the installable PWA: browsing, player controls, subtitles, Clip Studio, downloads, AI connectors, Postiz handoff, and Live Match Center.
- **`server/`** is the Fastify gateway: validation, rate limiting, SEO routes, push subscriptions, stream tokens, media proxying, and cached live-score proxying.
- **`core/`** is the Rust sidecar: the provider-facing adapter and resolver contract.
- **`third_party/moviebox-tui/src/`** is pinned to the upstream provider architecture recorded in [`PROVENANCE.md`](PROVENANCE.md).
- **`automation/`** contains the safe integration boundary for n8n, GetLeads.io, AI providers, trend sources, and official publishing APIs.

## Live Match Center

Open `/#/live` after deployment to see:

- Matchday fixtures grouped by league.
- Live, upcoming, finished, and followed filters.
- Local timezone day navigation.
- Match sheets with score, events, venue, countdown, and broadcaster listings.
- In-page alerts while the app is open.
- Optional closed-app Web Push alerts when VAPID is configured.
- Cached/stale fallback behavior if ESPN’s public scoreboard endpoint is slow or unavailable.

The Live section intentionally does **not** import unauthorized stream-finder bridges or re-stream channels. “Where to watch” lists the legitimate broadcaster information returned by the score provider.

## Clip Studio: from playback to short form

```text
streaming source ─┐
                  ├─> Clip Studio ─> trim ─> AI caption ─> download/share/publish
offline OPFS file ┘                    │
                                       ├─> title + hook
                                       ├─> hashtags
                                       └─> Postiz / n8n / official APIs
```

Clip Studio supports:

- 1–60 second selections.
- Same-origin streaming playback.
- Offline OPFS downloads.
- Title, caption, and hashtag editing.
- Browser-local recording with `MediaRecorder`.
- Native device sharing and local download.
- AI caption generation through user-provided keys, owner-managed defaults, or local models.

Only clip media that you own or are licensed to republish. The app does not collect social passwords or depend on unofficial Instagram, TikTok, Facebook, or YouTube scraping.

## AI connections without the maze

Choose a provider preset, then enter the model and key only when required:

- OpenAI-compatible gateways.
- OpenAI.
- xAI/Grok.
- OpenRouter.
- Gemini-compatible endpoints.
- Ollama.
- LM Studio.
- Your own compatible gateway or connector.

Browser-provided keys stay in the browser. Owner-managed server defaults use `AI_BASE_URL`, `AI_MODEL`, and `AI_API_KEY`. Read [`automation/README.md`](automation/README.md) before enabling automated trend collection or publishing.

## Social publishing, the safe way

The project supports a simple handoff to **Postiz** and documents n8n workflows for official platform integrations. Connect the provider, choose the channel, review the caption, and publish through the platform’s permitted API or OAuth flow.

> Automated posting is deliberately not a “scrape and blast” system. Use official APIs, respect rate limits and platform rules, and keep a human review step for third-party material.

## Deploy with Render

This repository includes a production Dockerfile and Render Blueprint.

1. Fork or clone this repository.
2. In Render, create a new **Blueprint** from the repository.
3. Render reads [`render.yaml`](render.yaml), builds the Rust core, and starts the public Node gateway.
4. Set `PUBLIC_SITE_URL` to the real HTTPS URL of your deployed service.
5. Optionally set VAPID keys for push, AI defaults, `SOCIAL_WHATSAPP_URL`, and owner ad settings.
6. Verify `/api/health`, `/robots.txt`, `/sitemap.xml`, and `/#/live`.

Render supplies `PORT` automatically. The Fastify gateway binds to `0.0.0.0`; the Rust sidecar remains private inside the container.

### Important environment variables

| Variable | Purpose |
|---|---|
| `PUBLIC_SITE_URL` | Canonical URLs, Open Graph URLs, robots, sitemap, and search previews. |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Optional targeted Web Push alerts. |
| `AI_BASE_URL` / `AI_MODEL` / `AI_API_KEY` | Optional owner-managed AI caption defaults. |
| `ADMIN_PASSWORD` | Protects owner controls. Keep it in Render Environment settings. |
| `AD_URL` / `AD_DURATION_SECONDS` | Optional owner-managed ad configuration. |
| `SOCIAL_WHATSAPP_URL` | Optional About-page contact link. |
| `UPSTREAM_COMMIT` | Records the pinned provider commit used by the deployment. |

## Local development

Requirements: Node.js 20+, Rust 1.90+, network access, and the upstream vendor checkout.

```sh
sh scripts/vendor-upstream.sh
sh scripts/start.sh
```

Then open <http://localhost:3000>.

For a server-only check:

```sh
cd server
npm ci
npm run check
```

## Project map

```text
free-heart/
├── core/                  Rust media-core adapter
├── server/                Fastify gateway and Web Push
├── web/                   PWA, player, Clip Studio, Live Center
├── automation/            AI, n8n, Postiz, trend-source guidance
├── docs/                  Live Center and README visuals
├── Dockerfile             Multi-stage deployment image
├── render.yaml            Render Blueprint
├── PROVENANCE.md          Upstream commit and attribution
└── TEST_REPORT.md         Commands actually executed
```

## Responsible use

- Use media sources and clips you are authorized to access and republish.
- The app does not bypass paywalls, geo restrictions, authentication, robots rules, or provider access controls.
- HLS streams are playable but are not saved as a single offline file by the browser downloader.
- Browser service workers may be suspended after a full operating-system force-stop.
- Google ranking cannot be guaranteed; submit the generated sitemap through Google Search Console after deployment.

## Attribution and verification

The upstream MIT and Apache-2.0 license files are included. See [`PROVENANCE.md`](PROVENANCE.md) and [`NOTICE`](NOTICE).

See [`TEST_REPORT.md`](TEST_REPORT.md) for the commands executed during verification.

<div align="center">
  <br>
  <sub>Built for people who want the moment—not another maze of tools.</sub>
  <br><br>
  <a href="https://github.com/brianlexyl03-hash/free-heart/issues">Report an issue</a> ·
  <a href="https://github.com/brianlexyl03-hash/free-heart/discussions">Join the discussion</a> ·
  <a href="https://github.com/brianlexyl03-hash/free-heart">Star the repository</a>
</div>
