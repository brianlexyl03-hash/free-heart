# Free Heart: configurable streaming providers

This update keeps the existing Free Heart PWA, Fastify gateway, stream-token proxy, and Rust media core. It exposes the existing MovieBox-TUI Stremio-compatible add-on stream adapter through the web API and lets the owner change configured add-on sources without editing Rust code.

## What changes

- Adds runtime loading for operator-managed Stremio-compatible **direct HTTP/HLS** stream add-ons.
- Includes add-on provider search when at least one configured stream add-on loads successfully.
- Resolves add-on stream results using their provider's season/episode identity and source-provided request headers.
- Keeps the existing MovieBox, 4KHDHub, and Dramachi providers intact.
- Fixes the upstream stream timeout so the 20-second connection/header timeout is cleared after response headers arrive, rather than aborting a healthy video body 20 seconds later.
- Adds an open-licensed Big Buck Bunny playback-test entry. Search `Big Buck Bunny` or `stream test` to exercise Free Heart's `/api/resolve` and `/api/stream/:token` path independently of configured third-party add-ons.

## Configure sources

Set this environment variable on your local process or hosting provider:

```text
STREAM_ADDON_MANIFESTS=https://your-authorized-addon.example/manifest.json;https://another-authorized-addon.example/manifest.json
```

Use only sources you are allowed to access and redistribute. Manifest URLs must use HTTPS and a public DNS hostname. Up to eight entries are accepted; separate them with semicolons or newlines. On startup Free Heart fetches each manifest with an eight-second timeout, keeps only add-ons that advertise a `stream` resource, and writes the validated list to MovieBox-TUI's existing add-on configuration. The built-in Cinemeta metadata/catalog add-on is retained.

To change sources, edit `STREAM_ADDON_MANIFESTS` and restart/redeploy the service. On Render, go to the service's **Environment** settings, change the variable, then save and deploy. If no configured manifest can be loaded, the startup routine leaves the previous on-disk add-on configuration unchanged and logs that no configured stream add-ons were loaded.

### Important compatibility note

A valid manifest does not guarantee that its streams can play in a browser. Free Heart's web proxy currently supports direct HTTP(S) files and HLS URLs. Torrent-only results (`magnet:`/`infoHash`), DRM, protected streams requiring an unsupported player, and inaccessible/private-network sources are not playable through this web adapter. This update does not bypass paywalls, authentication, geo restrictions, DRM, or provider access controls.

The upstream BDIX CircleFTP and DhakaFlix providers use private `172.16.x.x` network addresses; they are intentionally not enabled for a public Render service because those addresses are not internet-facing sources.

## Apply from Termux

Extract the ZIP, then run the included installer against the working checkout:

```sh
cd ~/free-heart
python /path/to/free-heart-stream-updates/apply.py "$PWD"
```

The installer checks all source anchors before writing, creates timestamped backups of modified files, and is safe to re-run. Review the diff before committing:

```sh
git diff --check
git diff --stat
git diff -- core/src/main.rs server/src/index.js
git status --short
```

## Verification

Run local checks from the repository root:

```sh
cargo fmt --check --manifest-path core/Cargo.toml
cargo test --manifest-path core/Cargo.toml
cargo check --locked --manifest-path core/Cargo.toml
node --check server/src/index.js
git diff --check
```

After deploying, run:

```sh
BASE_URL=https://free-heart.de.deplexo.com sh scripts/test-stream-providers.sh
```

That smoke test verifies health, the open-licensed demo search item, resolution, and a byte-range request through the public gateway. It is not a substitute for testing several configured real add-ons and watching a full stream for more than 20 seconds.
