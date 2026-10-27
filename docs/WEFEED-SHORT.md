# WeFeed Short integration

The Short Dramas page is available at `#/shorts`.

The page uses `/api/search` and filters results whose IDs include `wefeedshort~`.
The backend routes namespaced IDs to the WeFeed details and episode-resolution
adapters.

`WEFEED_SHORT_ENABLED=false` disables the integration if supported by the service
configuration. Upstream availability, authentication requirements, and playable
episode URLs still depend on the live WeFeed service; a successful compile alone
does not verify playback.
