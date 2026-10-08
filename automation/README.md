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

## Recommended n8n flow

Create a **Webhook** trigger that accepts a multipart clip file plus JSON fields:

- `title`
- `caption`
- `platform` (`youtube`, `instagram`, `tiktok`, or `facebook`)
- `source` (`free-heart`)

Then add a human approval step, upload through the platform's official node/API, and return the published URL. Keep the webhook private with an n8n header secret. Do not expose platform access tokens in the browser or commit them to this repository.

## Current boundary

The client-side editor intentionally does not upload media to an unknown third party. That keeps private downloads private and makes the publishing connection an explicit owner-controlled automation choice. A later server-side webhook adapter can be added once the deployment owner selects n8n/Make/PostWire and configures its secret in Render environment variables.
