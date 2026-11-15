# First-party campaign bot

The search-result sponsored placement now has a first-party campaign bot. It rotates between the site’s working features without cookies, account profiles, IP storage, or third-party ad scripts:

- **Live Match Center** → `/#/live`
- **Clip Studio** → `/#/about`
- **Offline Saves** → `/#/downloads`
- **AI captions and hashtags** → `/#/about`

The bot chooses a weighted campaign whenever the search page requests its sponsored tile. The tile appears after every eight movie results, is labelled `From free-heart`, and opens the feature in a new tab. Aggregate in-memory impression and click counters are accepted through `/api/ads/impression` and `/api/ads/click`; no personal identifier is attached and counters reset when the process restarts.

To replace the defaults with separate first-party apps, set a JSON campaign list in deployment:

```env
FIRST_PARTY_CAMPAIGNS_ENABLED=true
FIRST_PARTY_CAMPAIGNS_JSON=[{"id":"my-app","title":"My other app","description":"Open the app","url":"https://my-app.example","image":"https://cdn.example/my-app.jpg","label":"From my apps","weight":2,"enabled":true}]
```

Only HTTPS external URLs or same-site paths beginning with `/` are accepted. Invalid campaigns are discarded. If the rotation is disabled with `FIRST_PARTY_CAMPAIGNS_ENABLED=false`, the legacy `SEARCH_AD_*` configuration is used instead.

The website does not pretend to serve Meta Audience Network inventory. Meta’s current Audience Network documentation describes supported partner mobile-app placements, not a general web-site ad feed. This bot is therefore an owner-controlled cross-promotion system for your own apps and features, not a paid third-party ad exchange.
