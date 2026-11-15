# Verified news and movie discovery

The site now has a source-aware news wire at `/news`. It reads configured HTTPS RSS or Atom feeds with conditional requests, a short in-memory freshness window, a seven-day persistent recent-item store, XML/Atom parsing, image extraction, deduplication, and source attribution. A headline is labelled `reported` until it is matched across independent publisher names, or `official` when a configured feed is explicitly marked official. The site never presents a single feed item as corroborated fact.

The default feed is BBC Sport football RSS. BBC’s terms allow adding its RSS feed when the feed is not changed, its attribution and a prominent link are retained, and the use is otherwise permitted. Commercial or business use may require permission. Add other sources only when you have permission or an applicable API/feed licence. Configure additional feeds with:

```text
NEWS_RSS_FEEDS="Publisher|https://publisher.example/feed.xml|football|false;League|https://league.example/official.xml|football|true"
```

The server publishes crawler-visible pages at `/news` and `/news/item/:id`. Article pages use a mobile news layout with a top first-party advertisement slot, strong headline, source image and caption, byline/date, concise attributed brief, source links, a visible verification label, canonical metadata, Open Graph metadata inherited from the site shell, and `NewsArticle` structured data when `PUBLIC_SITE_URL` is configured. They do not reproduce a publisher’s full protected article. Movie detail pages now include crawler-visible title, overview, poster, canonical URL, and `Movie` or `TVSeries` structured data. `/sitemap.xml` includes public movie, news, and static pages. `/news-sitemap.xml` includes only news URLs from the previous two days, as required for a news sitemap. `/robots.txt` advertises both sitemaps.

For deployment, set `PUBLIC_SITE_URL` to the real HTTPS domain and keep `NEWS_DB_FILE` on persistent storage if the host is ephemeral. Submit `/sitemap.xml` and `/news-sitemap.xml` in Google Search Console. Google does not guarantee a ranking or News placement from structured data alone; the site still needs original, useful editorial work, clear authorship, accurate sourcing, and compliance with each feed provider’s terms. The implementation intentionally does not copy full articles or scrape pages behind access controls.

The implementation follows Google’s guidance for `NewsArticle` properties, recent-news sitemap entries, crawlable canonical URLs, and people-first content:

- [Google Article structured data](https://developers.google.com/search/docs/appearance/structured-data/article)
- [Google News sitemap requirements](https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap)
- [Google helpful and reliable content guidance](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [BBC terms for metadata and RSS feeds](https://www.bbc.co.uk/usingthebbc/terms-of-use/)
