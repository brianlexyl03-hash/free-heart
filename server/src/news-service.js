import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PRODUCTION = process.env.NODE_ENV === 'production';
const APP_DIR = path.resolve(process.cwd());
const DATA_DIR = process.env.DATA_DIR || (PRODUCTION ? '/data' : path.join(process.cwd(), 'data'));
const requestedDb = path.resolve(process.env.NEWS_DB_FILE || path.join(DATA_DIR, 'news-items.json'));
const inside = (target, directory) => target === directory || target.startsWith(directory + path.sep);
// Production must never write its cache into the immutable application image or /tmp.
// The /data mount is the durable service volume used by the deployed application.
const DB = PRODUCTION && (inside(requestedDb, APP_DIR) || inside(requestedDb, '/tmp'))
  ? '/data/news-items.json'
  : requestedDb;
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT = 7000;
const cache = new Map();
let stored = loadStored();

// Add only feeds that your use is permitted to display. Extra feeds can be
// supplied as NEWS_RSS_FEEDS="Name|https://example/feed.xml|category|official".
const DEFAULT_FEEDS = [
  { name: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/football/rss.xml', category: 'football', official: false },
  { name: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/football/premier-league/rss.xml', category: 'premier-league', official: false },
  { name: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/football/champions-league/rss.xml', category: 'champions-league', official: false },
  { name: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/football/european/rss.xml', category: 'european', official: false },
  { name: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/football/womens/rss.xml', category: 'womens', official: false },
];

function configuredFeeds() {
  const extra = String(process.env.NEWS_RSS_FEEDS || '').split(';').map((entry) => {
    const [name, url, category = 'football', official = 'false'] = entry.split('|').map((v) => String(v || '').trim());
    return name && /^https:\/\//i.test(url) ? { name, url, category, official: official.toLowerCase() === 'true' } : null;
  }).filter(Boolean);
  return [...DEFAULT_FEEDS, ...extra];
}

function loadStored() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DB, 'utf8'));
    return new Map((Array.isArray(parsed) ? parsed : []).filter((item) => item?.id && Date.now() - Date.parse(item.publishedAt || item.fetchedAt || 0) < MAX_AGE).map((item) => [item.id, item]));
  } catch { return new Map(); }
}

function persist() {
  try {
    fs.mkdirSync(path.dirname(DB), { recursive: true });
    const recent = [...stored.values()].sort((a, b) => Date.parse(b.publishedAt || b.fetchedAt) - Date.parse(a.publishedAt || a.fetchedAt)).slice(0, 500);
    fs.writeFileSync(DB, JSON.stringify(recent, null, 2));
  } catch (error) { console.warn('[news] unable to persist cache:', error.message); }
}

function xmlDecode(value) {
  return String(value || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ').trim();
}
function tag(block, names) {
  for (const name of names) {
    const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
    if (match) return xmlDecode(match[1]);
  }
  return '';
}
function attr(block, names) {
  for (const name of names) {
    const match = block.match(new RegExp(`<[^>]*${name}[^>]*\\b(?:url|href)=["']([^"']+)["']`, 'i'));
    if (match) return match[1];
  }
  return '';
}
function validUrl(value) { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; } }
function sourceId(url) { return crypto.createHash('sha256').update(url).digest('hex').slice(0, 18); }
function words(value) { return new Set(String(value).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((word) => word.length > 2)); }
function similarity(a, b) { const left = words(a); const right = words(b); const overlap = [...left].filter((word) => right.has(word)).length; return overlap / Math.max(1, Math.min(left.size, right.size)); }

function parseFeed(xml, feed) {
  const blocks = [...xml.matchAll(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi)].map((match) => match[0]);
  return blocks.slice(0, 50).map((block) => {
    const title = tag(block, ['title']);
    const link = validUrl(tag(block, ['link']) || attr(block, ['link']));
    const published = tag(block, ['pubDate', 'published', 'updated', 'dc:date']);
    const image = validUrl(attr(block, ['media:content', 'media:thumbnail', 'enclosure'])) || validUrl(tag(block, ['media:content', 'media:thumbnail']));
    if (!title || !link) return null;
    const publishedAt = Number.isNaN(Date.parse(published)) ? new Date().toISOString() : new Date(published).toISOString();
    return {
      id: sourceId(link), title: title.slice(0, 220), summary: tag(block, ['description', 'summary', 'content:encoded']).slice(0, 500),
      link, image, publishedAt, fetchedAt: new Date().toISOString(), source: feed.name, sourceHost: new URL(link).hostname,
      category: feed.category, official: feed.official, sources: [{ name: feed.name, link }],
    };
  }).filter(Boolean);
}

async function fetchFeed(feed) {
  const previous = cache.get(feed.url) || {};
  if (previous.fetchedAt && previous.items && previous.fetchedAt > Date.now() - 60_000) return previous.items;
  const headers = { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9', 'user-agent': 'free-heart-news/1.0 (+configured RSS reader)' };
  if (previous.etag) headers['if-none-match'] = previous.etag;
  if (previous.lastModified) headers['if-modified-since'] = previous.lastModified;
  const response = await fetch(feed.url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT) });
  if (response.status === 304 && previous.items) { previous.fetchedAt = Date.now(); return previous.items; }
  if (!response.ok) throw new Error(`${feed.name} returned HTTP ${response.status}`);
  const items = parseFeed(await response.text(), feed);
  cache.set(feed.url, { etag: response.headers.get('etag') || '', lastModified: response.headers.get('last-modified') || '', fetchedAt: Date.now(), items });
  return items;
}

function mergeCorroboration(items) {
  const groups = [];
  for (const item of items) {
    let group = groups.find((candidate) => candidate.some((existing) => similarity(existing.title, item.title) >= 0.58));
    if (!group) groups.push(group = []);
    group.push(item);
  }
  return groups.flatMap((group) => {
    const primary = group.sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt))[0];
    const sources = [...new Map(group.flatMap((item) => item.sources || []).map((source) => [source.link, source])).values()];
    const independentPublishers = new Set(group.map((item) => item.source));
    const corroborated = independentPublishers.size >= 2;
    const official = group.some((item) => item.official);
    return [{ ...primary, sources, verification: official ? 'official' : corroborated ? 'corroborated' : 'reported', corroborationCount: sources.length }];
  });
}

export async function getNews({ category = 'football', limit = 40 } = {}) {
  const feeds = configuredFeeds().filter((feed) => feed.category === category || (category === 'football' && feed.category === 'football'));
  const selected = feeds.length ? feeds : configuredFeeds().filter((feed) => feed.category === 'football');
  const results = await Promise.allSettled(selected.map(fetchFeed));
  const fresh = results.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
  for (const item of fresh) stored.set(item.id, item);
  const merged = mergeCorroboration([...stored.values()].filter((item) => item.category === category || (category === 'football' && item.category === 'football'))).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, Math.min(100, Math.max(1, limit)));
  for (const item of merged) stored.set(item.id, item);
  persist();
  return { source: selected.map((feed) => feed.name).filter((name, index, list) => list.indexOf(name) === index).join(', '), feed: category, updatedAt: new Date().toISOString(), items: merged };
}

export function getNewsArticle(id) { return stored.get(String(id)) || null; }
export function getNewsSitemapItems() {
  const cutoff = Date.now() - 2 * 24 * 60 * 60 * 1000;
  return [...stored.values()].filter((item) => Date.parse(item.publishedAt) >= cutoff).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}
export function newsIdForLink(link) { return sourceId(link); }

export function startNewsRefresh({ log = console } = {}) {
  const categories = ['football', 'premier-league', 'champions-league', 'european', 'womens'];
  const refresh = () => Promise.allSettled(categories.map((category) => getNews({ category, limit: 40 }))).then((results) => {
    const failed = results.filter((result) => result.status === 'rejected').length;
    if (failed) log.warn?.(`[news] ${failed} feed group(s) could not be refreshed`);
  });
  refresh();
  const timer = setInterval(refresh, 60_000);
  timer.unref?.();
  return () => clearInterval(timer);
}
