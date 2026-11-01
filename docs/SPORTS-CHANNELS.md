# Sports channels and live-center integration

The live-center channel strip uses official public service pages as region-aware destinations. It does not claim that any broadcaster page is a free stream endpoint, and it does not ingest Cricfy APK pages, scraped tokens, DRM material, VPN workarounds, or unauthorized stream URLs.

## Official channel references

- **beIN SPORTS** — [sports](https://www.bein.com/en/sports/), [US service](https://www.beinsports.com/en-us), [MENA service](https://www.beinsports.com/en-mena), [CONNECT](https://connect.beinsports.com/). Coverage and packages vary by market.
- **DAZN** — [DAZN](https://www.dazn.com/), [availability help](https://www.dazn.com/en-US/help/articles/16293825515165-where-is-dazn-available). Catalogue and event access are country-specific.
- **TNT Sports** — [UK/Ireland](https://www.tntsports.co.uk/), [US](https://www.tntsports.com/). Services and rights differ between territories.
- **Sky Sports** — [watch](https://www.skysports.com/watch), [Sky sports](https://skygroup.sky/en-gb/what-we-do/unmissable-tv/sports). The public schedule is a changing subscription catalogue.
- **Star Sports** — [JioStar](https://www.jiostar.com/), [network announcement](https://www.jiostar.com/news/sports18-channels-rebrand-as-star-sports-expanded-network-ushers-in-a-new-era-of-live-sports-entertainment/). Distribution is primarily India-focused and partner-dependent.
- **Willow by Cricbuzz** — [Willow](https://www.willow.tv/), [TV channel](https://www.willow.tv/tvchannel), [Cricbuzz 2026 announcement](https://www.cricbuzz.com/cricket-news/137559/willow-by-cricbuzz-brings-a-host-of-updates-for-2026-cricket-season-cricbuzzcom). First-party sources describe USA/Canada availability and cricket coverage.
- **FOX Cricket** — [FOX Sports](https://www.foxsports.com.au/), [cricket section](https://www.foxsports.com.au/cricket-), [Kayo](https://kayosports.com.au/en-AU/home/3wx3y3yyxmillzapjvcvz2jjd/jo74ryszmcvd1pzmbzp50q84a). Rights and access are Australia- and subscription-dependent.

ESPN was removed from the visible sports-network strip. The existing server-side score adapter remains configurable through `LIVE_SCORE_API_BASE` so the deployment can use a licensed score provider without changing the client UI.

## Cricfy research boundary

The public Cricfy pages inspected were article/download pages rather than a verified broadcaster player. They make self-reported claims about sports coverage and app features, but do not establish rights ownership or lawful access. Their UI pattern was used only as inspiration for a dark, compact channel rail, clear status tabs, a featured match, and a focused player surface.

## Authorized playback configuration

Public broadcaster pages are not direct HLS/DASH manifests. To enable a channel player, configure the server with manifests that the operator owns or is authorized to distribute:

```sh
LIVE_CHANNEL_SOURCES_JSON='[{"id":"willow","sources":[{"label":"Primary","url":"https://licensed.example/live/willow/index.m3u8"}]}]'
```

The server exposes only configured HTTPS sources through `/api/live/channels/:id/playback`; it never accepts a client-supplied arbitrary URL. The existing tokenized proxy rewrites HLS child playlists and preserves the server-side source headers.
