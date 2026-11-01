# free-heart

A mobile-first web app for discovering media, watching through permitted sources, saving supported content for offline use, creating short clips, and following live sports fixtures.

**Live site:** https://free-heart.de.deplexo.com  
**Repository:** https://github.com/brianlexyl03-hash/free-heart

## What it does

- **Discover:** browse movies, series, episodes, and live matchday fixtures.
- **Watch:** use the web player with subtitle and quality controls, plus fallback between supported sources.
- **Save:** keep supported files for private offline playback.
- **Create clips:** trim short moments in Clip Studio, add a title and caption, then download or share.
- **Follow matches:** view fixtures, scores, match details, and broadcaster information supplied by the score provider.
- **Connect tools:** configure caption providers and hand off publishing through Postiz, n8n, or supported official platform integrations.

## Project layout

| Directory | Responsibility |
|---|---|
| `web/` | Installable PWA, player, Clip Studio, local storage, and Live Match Center |
| `server/` | Fastify API, validation, rate limiting, push subscriptions, and service endpoints |
| `core/` | Rust media-core adapter |
| `automation/` | Integration guidance for AI providers, n8n, and publishing workflows |
| `docs/` | Architecture, setup, and feature documentation |

## Run locally

Requirements: Node.js 20+, Rust 1.90+, and network access for the upstream provider checkout.

```sh
sh scripts/vendor-upstream.sh
sh scripts/start.sh
```

Then open http://localhost:3000.

To check the server separately:

```sh
cd server
npm ci
npm run check
```

## Deploy

The repository includes a Dockerfile and a Render Blueprint.

1. Create a Render Blueprint from this repository.
2. Set `PUBLIC_SITE_URL` to the deployed HTTPS address.
3. Add only the environment variables required by the features you enable.
4. Check `/api/health`, `/robots.txt`, and `/sitemap.xml` after deployment.

Render provides `PORT`. The gateway binds to `0.0.0.0`; the Rust sidecar is intended to remain private within the deployment.

### Configuration

| Variable | Purpose |
|---|---|
| `PUBLIC_SITE_URL` | Canonical URLs, Open Graph metadata, robots, and sitemap |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Optional Web Push delivery |
| `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY` | Optional server-managed caption provider |
| `ADMIN_PASSWORD` | Protects owner controls |
| `AD_URL`, `AD_DURATION_SECONDS` | Optional owner-managed ad configuration |
| `SOCIAL_WHATSAPP_URL` | Optional contact link |
| `UPSTREAM_COMMIT` | Records the pinned upstream provider revision |

Keep secrets in your deployment environment. Do not commit real API keys, passwords, or private credentials.

## Responsible use and current limitations

- Use media sources and clips that you are authorized to access and republish.
- The project does not claim to bypass paywalls, geo restrictions, authentication, or provider access controls.
- HLS playback uses the authenticated relay; downloads use the server-side FFmpeg remux path when FFmpeg is available in the deployment image.
- Browser background work and push delivery depend on device, browser, and deployment configuration.
- Push notifications require valid VAPID configuration.
- Caption generation requires a configured provider or local model.
- Search indexing and ranking depend on the deployed site and external search engines; no ranking position is guaranteed.

## Attribution and licenses

The repository includes MIT and Apache-2.0 license files. Review [PROVENANCE.md](PROVENANCE.md) and [NOTICE](NOTICE) for upstream attribution and licensing details.

## Verification

See [TEST_REPORT.md](TEST_REPORT.md) for the checks recorded by the project.

## Contributing

Issues and pull requests are welcome. Please describe the problem, include reproduction steps where relevant, and run the applicable checks before submitting a change.

## Contact and collaboration

Software engineer open to thoughtful collaboration, engineering discussions and project contributions.

- Email: [brianlexyl03@gmail.com](mailto:brianlexyl03@gmail.com)
- WhatsApp: [+254 769 485 902](https://wa.me/254769485902)

Please include the repository, issue or feature area in your message.

## Developer portfolio and releases

See the [central project, download and achievement index](https://github.com/brianlexyl03-hash/fuskamo/blob/main/PORTFOLIO.md) for verified APK downloads, web-app deployment status, engineering achievements and collaboration details.
