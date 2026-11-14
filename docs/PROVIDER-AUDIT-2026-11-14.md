# Provider repository audit — 2026-11-14

## Decision

No candidate passed as an unconditional, production-ready movie source. The repositories generally contain reusable **code**, but their licenses do not grant rights to redistribute or stream the third-party movie/TV catalogs, websites, embeds, or CDN content that the code targets. A provider can be added to Free Heart only when the operator is authorized to use that source and the source returns a current direct HTTP/HLS media URL.

The audit found three recurring failure modes: dead or archived upstream endpoints, adapters that return torrent/debrid metadata rather than direct browser media, and scrapers that return iframe/landing-page URLs with ad or interstitial risk. The existing resolver’s direct HTTP/HLS boundary is therefore intentional.

## Results

| Repository | License | Provider code | Result |
|---|---|---:|---|
| [stremify](https://github.com/stremify/stremify) | MIT | Yes | Conditional only; archived, third-party scrapers, high embed risk |
| [NuvioStreamsAddon](https://github.com/tapframe/NuvioStreamsAddon) | MIT | Yes | Conditional adapter port; archived and endpoint health is mixed |
| [animeflv-stremio-addon](https://github.com/Pigamer37/animeflv-stremio-addon) | MIT | Yes | Anime-only; several browser/embed or unavailable sources |
| [piratebay-stremio-addon](https://github.com/ThanosDi/piratebay-stremio-addon) | MIT | Yes | Not suitable; stale torrent/infoHash output, no direct media |
| [jackettio](https://github.com/arvida42/jackettio) | Apache-2.0 | Yes | Optional credentialed debrid adapter only; license metadata conflict |
| [davio](https://github.com/arvida42/davio) | Apache-2.0 | Yes | Optional user-configured WebDAV provider; requires credentials |
| [Amatsu](https://github.com/mralanbourne/Amatsu) | MIT | Yes | Conditional torrent/debrid adapter; archived and credentials required |
| [moisa-addon](https://github.com/peronecode/moisa-addon) | MIT | Yes | Conditional TorrServer adapter; not a public direct source |
| [Persian-Stream-Stremio-Addon](https://github.com/AbolfazlFarzadmehr/Persian-Stream-Stremio-Addon) | MIT | Yes | Defer; provider configuration and live streams unverified |
| [Magnetio](https://github.com/peterdsp/Magnetio) | Apache-2.0 | Yes | Conditional torrent/debrid adapter; mixed provider health |
| [Persian-Streams](https://github.com/alirostami01/Persian-Streams) | Apache-2.0 | Yes | Defer; live route returned no streams and parser has redirect risk |
| [torrodle](https://github.com/tnychn/torrodle) | MIT | Yes | Not suitable; torrent/magnet aggregator, archived and stale endpoints |
| [wajik-anime-api](https://github.com/wajik45/wajik-anime-api) | MIT | Yes | Anime-only; iframe/embed paths require strict validation |
| [anime-scraper](https://github.com/areebbeigh/anime-scraper) | Apache-2.0 | Yes | Do not integrate; stale browser automation and popup risk |
| [anime-dl-core](https://github.com/ialakey/anime-dl-core) | MIT | Yes | Conditional anime adapter; direct HLS/MP4 shape is useful |
| [ani-cli-ar](https://github.com/nobynoooob/ani-cli-ar) | GPL-3.0 | Yes | Conditional only; GPL obligations and mixed endpoint health |
| [Kitty-cli](https://github.com/fampep/Kitty-cli) | GPL-3.0 | No | Reject; remote API is dead/unrelated and code has no providers |
| [kuro](https://github.com/surya758/kuro) | MIT | Yes | Conditional anime/donghua adapters; embed and yt-dlp fallbacks |
| [AniKoKo](https://github.com/jesusmedrandam/AniKoKo) | MIT | Yes | Conditional anime adapter; iframe/ad risk and partial health |
| [hianime-api](https://github.com/VoidX3D/hianime-api) | MIT | Yes | Defer; hosted API is dead and upstream scraper is brittle |
| [HACHI-API](https://github.com/Pal-droid/HACHI-API) | MIT | Yes | Reject; archived/discontinued and returns embeds |
| [Fetch-Stream-API](https://github.com/Unrated-Coder/Fetch-Stream-API) | MIT | Yes | Reject for now; hosted API is 404 and can return embeds |
| [animetsu-scraper](https://github.com/sherenmalik93-create/animetsu-scraper) | MIT | Yes | Conditional anime adapter; current health is mixed |
| [stremio-anime-resolver](https://github.com/Suplic0z05/stremio-anime-resolver) | GPL-3.0-or-later | Yes | Conditional GPL component; anime-only and title-dependent |
| [stremio-source-resolver](https://github.com/owenps/stremio-source-resolver) | MIT | No | Reject as provider; generic addon client, no provider code |
| [YggPocket](https://github.com/Telkaoss/YggPocket) | MIT | Yes | Conditional credentialed debrid adapter; default indexer unavailable |
| [SafakStream-Extensions](https://github.com/SafakStream/SafakStream-Extensions) | GPL-3.0 | Yes | Conditional GPL component; CloudStream-specific and high embed risk |
| [mixue](https://github.com/cugucugu/mixue) | GPL-3.0 | Yes | Conditional GPL component; CloudStream-specific and mixed health |
| [stream-bypass](https://github.com/bytedream/stream-bypass) | MIT | Yes | Not a drop-in; browser-extension extraction and stale hosts |
| [skystream](https://github.com/akashdh11/skystream) | GPL-3.0 | No | Reject; bundled provider is only a test/example plugin |

## Implemented safe change

Free Heart now accepts up to **30 operator-authorized HTTPS Stremio manifests** through `STREAM_ADDON_MANIFESTS`. Each manifest is fetched with a timeout, restricted to public HTTPS hostnames, and accepted only when it advertises a supported catalog, metadata, or stream resource. This is the correct integration boundary for sources that the operator is authorized to use; it does not silently import unknown third-party scrapers or their upstream content.

## License note

MovieBox-TUI is dual-licensed MIT or Apache-2.0 for its own source code. That permits compatible forks of that code while preserving the required notices. It does not grant a blanket license to copy the target websites, bypass access controls, redistribute movies, or use every provider endpoint discovered in another repository. GPL candidates also require a GPL-compatible distribution and corresponding-source obligations before any code port.

## Sources

The repository links above are the primary audit sources. Each candidate was checked against its GitHub metadata, license file, README, provider/resolver implementation, and available endpoint evidence. Endpoint availability is time-sensitive and must be re-tested at deployment time.
