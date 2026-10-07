# Upstream integration notes

The upstream MovieBox-TUI project documents:

- `MovieBoxService` as its headless provider/service layer.
- Provider-specific stream resolution.
- Playback sources that may require `User-Agent` / `Referer` / cookies.
- A loopback `StreamRelay` for protected DASH/CloudFront playback.
- Seekability validation using HTTP 206 Partial Content.
- Range-based media transport and resume-capable downloads.

This web adapter intentionally mirrors the transport part of that architecture:

Browser -> this relay -> upstream source

The provider integration must pass the stream candidates returned by the provider into:

POST /api/streams/resolve

Do not replace the provider's headers with browser defaults.
Do not test video URLs with HEAD and assume success.
Do not pass an authenticated CDN URL directly into the browser when the
upstream source expects custom headers/cookies.

The current upstream repo is licensed under MIT or Apache-2.0.
