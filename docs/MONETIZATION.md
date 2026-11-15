# Search-result monetization

The website now supports an optional, clearly labelled sponsored tile in the movie search results. It appears after every eight results and is disabled unless `SEARCH_AD_URL` is a valid HTTPS URL. Configure it in deployment:

```env
SEARCH_AD_URL=https://your-advertiser-landing-page.example/offer
SEARCH_AD_LABEL=Sponsored
SEARCH_AD_TITLE=Your offer title
SEARCH_AD_DESCRIPTION=Short, accurate description
SEARCH_AD_IMAGE=https://your-cdn.example/creative.jpg
```

The tile opens the configured landing page in a new tab with `rel="sponsored noopener noreferrer"`. The app does not inject arbitrary scripts, obscure the sponsored label, or collect click identifiers. Use a campaign URL created in Meta Ads Manager as the landing destination if Meta is buying traffic to your site.

Meta’s current Audience Network documentation describes ads served inside partner mobile apps. It is not a general web-site ad feed that this server can legally or reliably pull into arbitrary search results. Therefore the site does not pretend to be a Meta publisher or invent a Meta placement ID. If Meta approves a supported publisher/app placement for this project, integrate it through Meta’s official SDK and policy review rather than scraping Meta ads. For a normal website, use an approved web publisher network or the owner-configured sponsored tile above.

Any real ad campaign must comply with Meta’s advertising standards, privacy/consent requirements, children’s and mature-content rules, and the laws applicable to the site’s visitors. Do not place ads inside a playback control, disguise ads as movie results, or use forced clicks.
