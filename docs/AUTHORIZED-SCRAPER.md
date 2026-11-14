# Authorized direct-stream scraper

`tools/authorized_stremio_scraper.py` is a standalone Python adapter for **authorized** Stremio-compatible manifests. It is independent of MovieBox-TUI internals and uses the standard manifest plus `/stream/{type}/{id}.json` contract.

It accepts repeated `--manifest` URLs, fetches the stream response, and keeps only direct `http://` or `https://` `url` fields. It rejects torrents, `infoHash`, `magnet:` links, `externalUrl`/iframe-style results, HTML pages, non-media content types, empty responses, ad-like URLs, and HLS playlists containing common ad-insertion markers or ad-like segment URLs. It follows redirects only to validate the final URL and preserves only the provider's `Referer`, `Origin`, `User-Agent`, and `Cookie` proxy headers.

```sh
python3 tools/authorized_stremio_scraper.py \
  --manifest https://your-authorized-addon.example/manifest.json \
  --manifest https://another-authorized-addon.example/manifest.json \
  --type movie \
  --id tt0111161 \
  --out /tmp/streams.json
```

The command performs a bounded range probe rather than downloading a movie. It returns JSON with `streams` and `rejected` entries and exits with status `2` when no candidate passes validation. Use only manifests and upstream media sources that you are authorized to access and redistribute.

The filter can remove ad-marked HLS segments and reject ad-like URLs. It cannot remove an advertisement embedded inside an otherwise valid encoded video stream; doing that would require a provider-specific, authorized media-processing workflow.
