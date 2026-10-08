# Short-form publishing automation

`free-heart` now includes a browser-local **Clip Studio**. It can trim a currently playing stream or an offline OPFS download, render up to 60 seconds with `MediaRecorder`, create a title/caption/hashtag package, download the clip, and use the browser's native share sheet.

## Why the app does not fake a free social login

Instagram, YouTube, TikTok, and Facebook require their own OAuth/app credentials and impose different upload rules. Unofficial credential scraping is unsafe and can lock an account. The app therefore uses:

1. **Official creator tools** for direct publishing after the user downloads/shares a clip.
2. **Native share** where the device/browser supports file sharing.
3. **n8n handoff** as the automation seam for an owner who connects one provider with official credentials.

The reviewed `awesome-n8n-templates` catalog contains useful reference patterns, especially:

- `Instagram_Twitter_Social_Media/Publish one video natively to TikTok Instagram and YouTube with PostWire.json`
- `Instagram_Twitter_Social_Media/FlowScribe Lite - AI Content Repurposing 4 Platforms.json`
- `OpenAI_and_LLMs/AI Social Media Content Generator with Ollama.json`

Those templates are third-party workflows and may require PostWire, Ollama, or other service accounts. They are not copied into this repository; use them as a starting point and verify their license/credential requirements before importing.

## AI captions and model connectors

Clip Studio now has a one-click AI connector panel. It supports a preset or any OpenAI-compatible endpoint by changing only the URL, model ID, and key:

| Connector | Example endpoint | Typical use |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | Captions, titles, hashtags |
| xAI/Grok | `https://api.x.ai/v1` | Alternative cloud model |
| OpenRouter | `https://openrouter.ai/api/v1` | Route across many model vendors |
| Ollama | `http://localhost:11434/v1` | Local/offline caption generation |
| LM Studio | `http://localhost:1234/v1` | Local model server |
| Custom gateway | Your `/v1` endpoint | Enterprise, Manus, or self-hosted gateways |

This is intentionally **model-ID based**, so the app is not limited to a fixed list of vendors. Anthropic, Gemini, Claude, Manus, and other models can be used through an OpenAI-compatible gateway or an n8n/MCP adapter. User keys are kept in browser storage and are not committed to the repository; an owner can instead set `AI_BASE_URL`, `AI_MODEL`, and `AI_API_KEY` in Render.

## GetLeads.io and MCP

GetLeads.io is a B2B contact/enrichment service, not a video-trend source. Its official docs provide REST endpoints and MCP tools for contact search, enrichment, signals, profile monitoring, and website-visitor workflows. To connect it, use the official GetLeads MCP server in the user's MCP client or route it through n8n; never paste a GetLeads key into a public frontend or use it to scrape social platforms. Lead data should remain a separate marketing automation workflow from video editing.

## Trend Radar and self-improvement boundary

For trending thumbnails and metadata, use official platform APIs, RSS feeds, licensed stock APIs, or user-provided feeds. Do not bypass rate limits, authentication, robots rules, or platform terms with an autonomous scraper. A compliant Trend Radar can improve over time by storing only local feedback—selected clips, rejected suggestions, caption style, and publishing results—and using that feedback to rank future candidates. It should keep a review/approval step before downloading or republishing third-party media.

OpenCut is a useful future integration target because its project describes an Editor API, plugin architecture, headless mode, and MCP server. OpenReel is another strong reference: it is MIT licensed, local-first, model-agnostic, supports OpenAI-compatible endpoints, and exposes agent tools with dry-run and undo guardrails. The current browser Clip Studio remains deliberately smaller and offline-safe; these tools can later be connected through a desktop/MCP bridge rather than copied into the streaming service.

## Recommended n8n flow

Create a **Webhook** trigger that accepts a multipart clip file plus JSON fields:

- `title`
- `caption`
- `platform` (`youtube`, `instagram`, `tiktok`, or `facebook`)
- `source` (`free-heart`)

Then add a human approval step, upload through the platform's official node/API, and return the published URL. Keep the webhook private with an n8n header secret. Do not expose platform access tokens in the browser or commit them to this repository.

## Postiz integration applied

Postiz was reviewed and cloned separately because its open-source monorepo is **AGPL-3.0** and should not be embedded into this Apache/MIT application. Its official public API is the safer integration boundary. Clip Studio now includes a **Publish with Postiz** panel that can:

1. Accept a Postiz Cloud or self-hosted Public API URL and API key.
2. Load connected channels/integrations.
3. Upload the rendered clip.
4. Create an immediate post for the selected channel.

Postiz supports Instagram, YouTube, TikTok, Facebook, and many other channels. Its public API is beta and rate-limited, so review the post in Postiz before turning on unattended automation. The browser stores the user-provided Postiz key locally; it is not placed in the repository or server logs. See the [Postiz Public API docs](https://docs.postiz.com/public-api).

## Search visibility applied

The app now serves crawler-visible homepage, About, and `/title/:id` pages instead of only an empty client-rendered shell. It also serves:

- Per-page titles and descriptions.
- Open Graph and Twitter metadata.
- JSON-LD `WebSite` structured data.
- `robots.txt` with API/download exclusions.
- `sitemap.xml` for public routes when `PUBLIC_SITE_URL` is configured.
- Clean crawlable title URLs while preserving the existing hash-based player.

Set `PUBLIC_SITE_URL` to the real HTTPS domain in Render before submitting `/sitemap.xml` to Google Search Console. Search engines cannot be guaranteed to rank a site, but these changes make the intended public content indexable and shareable.

## Current boundary

The client-side editor intentionally does not upload media to an unknown third party. That keeps private downloads private and makes the publishing connection an explicit owner-controlled automation choice. A later server-side webhook adapter can be added once the deployment owner selects n8n/Make/PostWire and configures its secret in Render environment variables.
