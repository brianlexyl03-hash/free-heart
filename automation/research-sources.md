# Research sources used

- Postiz repository: https://github.com/gitroomhq/postiz-app
  - README identifies the project as AGPL-3.0, self-hostable, and a social scheduling/automation platform.
  - Native channel coverage includes Instagram, YouTube, TikTok, Facebook, and many other providers.
  - README links its Public API, Node SDK, n8n node, Make integration, and MCP/agent connectors.
- Postiz Public API: https://docs.postiz.com/public-api
  - Hosted API base: `https://api.postiz.com/public/v1`.
  - Authentication uses the `Authorization` header with the API key.
  - Relevant endpoints: `GET /integrations`, `POST /upload`, and `POST /posts`.
  - API docs describe a 30-requests-per-hour limit and beta status.
- GetLeads API/MCP docs: https://www.getleads.io/docs/
  - GetLeads provides REST and MCP tools for B2B contacts, enrichment, signals, profile monitoring, and website visitors.
  - It is not a video-trend provider and should remain a separate lead-automation connector.
- OpenCut: https://github.com/opencut-app/opencut
  - README describes an MIT-licensed open-source editor under rewrite with an Editor API, plugin architecture, headless mode, scripting, and planned MCP support.
- OpenReel: https://openreel.video/
  - Site describes a MIT-licensed, local-first, model-agnostic editor with OpenAI-compatible endpoints, MCP/tool access, dry-run, and undo guardrails.
- SEO skill guidance: public HTML should contain meaningful content, route-specific metadata, canonical URLs, Open Graph/Twitter tags, correct status codes, robots, and sitemap. `PUBLIC_SITE_URL` is therefore required before publishing absolute SEO URLs.
