# Test report

Executed on 2026-10-04.

- `cargo fmt --check` in `core/`: PASS.
- `cargo check` in `core/`: PASS; compiled `free-core` against upstream `moviebox-tui` v0.1.26.
- `cargo test` in `core/`: PASS; 0 sidecar tests, upstream dependency compiled successfully.
- `npm install --no-audit --no-fund` in `server/`: PASS; 107 packages installed.
- `node --check server/src/index.js`: PASS.
- `node --check server/src/core.js`: PASS.
- `node --check web/app.js`: PASS.
- `node --check web/sw.js`: PASS.
- `scripts/start.sh`: PASS; release sidecar and Fastify gateway started.
- `GET /api/health`: PASS; returned `{ "ok": true, "core": true, "provider": "upstream-moviebox-tui" }`.
- Live `GET /api/search?q=matrix&page=1`: PASS; returned 10 real upstream results, including `Matrix`.
- Live `GET /api/title/:id`: PASS; returned real `Matrix` metadata.
- Live `POST /api/resolve`: PASS; returned HTTP 200, a `file` stream, and a tokenized `/api/stream/...` URL. Provider headers were not returned to the browser.
- Live `GET /api/stream/:token` with a one-byte range: gateway reached the resolved upstream URL, which returned HTTP 403 from its CDN in this sandbox; no fake success was recorded. Direct access with the same upstream headers produced the same HTTP 403.
- Real upstream quality selection: PASS for a title returning `1080p`, `720p`, and `480p`; each requested quality selected the matching upstream release.
- Netflix-style UI smoke check: PASS; hero, poster rows, player quality selector, ad gate, downloads, and owner-controls markers served successfully.
- Owner ad API without password: PASS; returned HTTP 401.
- Invalid search and stream-token requests: PASS; returned HTTP 400.
- PNG icon generation: PASS; `icon-192.png` and `icon-512.png` are valid PNG files.
- `sh -n scripts/start.sh`: PASS.
- `sh -n scripts/render-start.sh`: PASS.
- Render production defaults reviewed: public gateway binds `0.0.0.0:$PORT`; sidecar remains private on `127.0.0.1:7070`.
- Docker image build: NOT RUN; Docker/Podman is not installed in this sandbox.

Not executed: automated browser UI testing, OPFS download in a real browser, native HLS playback testing, and the optional name-conflict search for `free❤️‍🔥`.
