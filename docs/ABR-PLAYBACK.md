# Real-time playback tuning

Free Heart uses native browser playback plus server-side quality switching rather than assuming HLS.js is present in every browser. `web/abr.js` applies the same operational goals as a tuned HLS.js configuration:

- Fast and slow VoD estimates use longer EWMA windows (5 and 15 samples) with a 1.25 Mbps startup estimate to calm radio/network spikes.
- Cellular and Save-Data connections are capped at 720p and 480p respectively.
- The effective buffer decision window is capped at 45 seconds, with a 60-second hard ceiling.
- Quality changes are rate-limited to one every 15 seconds.
- Down-switches are urgent below 8 seconds of buffer or when estimated bandwidth falls below 72% of the current rung.
- Up-switches require at least 35 seconds of buffer and 45% bandwidth headroom.
- `LEVEL_SWITCHED` events are logged with the reason, estimate, and buffer depth for diagnosing flapping.

The server transcoder now creates browser-safe 1080p/720p/540p/480p/360p targets on request, uses a 48-frame minimum GOP with scene-cut suppression and two-second forced keyframe alignment, and flushes fragmented MP4 output for lower startup latency. `TRANSCODE_ENCODER=auto` selects NVENC/QSV only when the matching device is present; otherwise it safely uses libx264. Set `TRANSCODE_ENCODER=libx264` to force software encoding or explicitly select a hardware encoder when the host is known to support it.

This repository does not currently generate a multi-rendition HLS manifest, so HLS.js-only settings such as `maxBufferLength` are represented by the browser-side buffer policy and server quality-switch ladder. It also does not cache video segments: signed media and remux responses remain `no-store`. A CDN/MediaFlow deployment, segment prefetching, cache warming, HTTP/3, and live `start_offset` require a separately operated media proxy and source-specific authorization; they cannot be enabled by changing the website player alone.
