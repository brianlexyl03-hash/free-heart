import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { registerRemux, haveFfmpeg, probe } from './remux.js';
import fastifyStatic from '@fastify/static';
import { z, ZodError } from 'zod';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { core, CoreUnavailable, CoreBadResponse, CoreClientError } from './core.js';
import { searchArchive, getArchiveTitle, resolveArchive } from './archive-org.js';
import { searchOpenMedia, getOpenMediaTitle, resolveOpenMedia, isOpenMediaId } from './open-media-sources.js';
import { registerLiveScores } from './live-scores.js';
import { registerLiveAlerts, startLiveAlerts } from './live-alerts.js';
import { hasSubscription, registerPushRoutes, sendToEndpoint, sendToEndpoints } from './push-notifications.js';
import { startAutomaticPush } from './auto-push.js';
import { getNews, getNewsArticle, getNewsSitemapItems, rankNewsForQuery, startNewsRefresh } from './news-service.js';
import { nextCampaign, recordCampaignEvent } from './first-party-campaigns.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = Fastify({
  trustProxy: true,
  maxParamLength: 400,
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    // never log URLs/queries/tokens: only method + route pattern + status
    serializers: {
      req: (r) => ({ method: r.method, route: r.routeOptions?.url }),
      res: (r) => ({ status: r.statusCode }),
    },
  },
});

// SiteGuard-inspired operational telemetry. It stays in memory and never stores
// visitor IPs, titles, cookies, or full URLs.
const siteGuard = { startedAt: Date.now(), requests: 0, responses: 0, errors: 0, blocked: 0, lastEventAt: null };
app.addHook('onRequest', async () => { siteGuard.requests += 1; siteGuard.lastEventAt = new Date().toISOString(); });
app.addHook('onResponse', async (_req, reply) => {
  siteGuard.responses += 1;
  if (reply.statusCode >= 500) siteGuard.errors += 1;
  if (reply.statusCode === 429) siteGuard.blocked += 1;
});

await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

registerPushRoutes(app);
registerLiveScores(app);
registerLiveAlerts(app, { hasSubscription });
startLiveAlerts({ sendTo: sendToEndpoint, sendMany: sendToEndpoints, log: app.log });

async function startAutomaticPushRecommendations() {
  try {
    const { sendToAll } = await import('./push-notifications.js');
    const { chooseRecommendation, randomDelayMs } = await import('../push-scheduler.js');

    const recent = [];

    const scheduleNext = async () => {
      const delay = randomDelayMs();

      setTimeout(async () => {
        try {
          // Use the existing media core to obtain live candidates.
          // No movie title is stored or hard-coded here.
          const queries = ['trending', 'popular', 'latest movies'];
          const responses = await Promise.allSettled(
            queries.map(q => core.search(q, 1))
          );

          const candidates = [];
          const seen = new Set();

          for (const r of responses) {
            if (r.status !== 'fulfilled') continue;
            for (const item of (r.value?.results || [])) {
              if (!item?.id || !item?.title) continue;
              const id = String(item.id);
              if (seen.has(id)) continue;
              seen.add(id);
              candidates.push(item);
            }
          }

          const pick = chooseRecommendation(candidates, recent);

          if (pick) {
            const poster =
              pick.movie.poster ||
              pick.movie.image ||
              pick.movie.posterUrl ||
              pick.movie.backdrop ||
              undefined;

            await sendToAll({
              title: pick.title,
              body: pick.body,
              url: pick.url,
              image: poster,
              tag: `free-heart-${pick.movie.id}`
            });

            recent.push(String(pick.movie.id));
            while (recent.length > 20) recent.shift();
          }
        } catch (error) {
          app.log.error({ err: error }, 'Automatic recommendation push failed');
        } finally {
          scheduleNext();
        }
      }, delay);
    };

    scheduleNext();
    app.log.info('Automatic recommendation push scheduler started');
  } catch (error) {
    app.log.error({ err: error }, 'Could not start recommendation push scheduler');
  }
}

app.addHook('onSend', async (_req, reply) => {
  reply.header('x-content-type-options', 'nosniff');
  reply.header('referrer-policy', 'no-referrer');
});

app.setErrorHandler((err, req, reply) => {
  if (err instanceof ZodError) { const f = [...new Set((err.issues || []).map((i) => i.path.join('.')).filter(Boolean))].join(', '); req.log.warn({ fields: f }, 'validation failed'); return reply.code(400).send({ error: 'bad_request', message: `Invalid input${f ? ` (${f})` : ''}` }); }
  if (err instanceof CoreUnavailable) return reply.code(503).send({ error: 'core_unavailable', message: err.message });
  if (err instanceof CoreClientError) return reply.code(err.status).send({ error: err.kind, message: err.message });
  if (err instanceof CoreBadResponse) return reply.code(502).send({ error: 'core_bad_response', message: err.message });
  if (err.statusCode === 429) return reply.code(429).send({ error: 'rate_limited', message: 'Too many requests' });
  req.log.error({ name: err.name }, 'unhandled');
  return reply.code(500).send({ error: 'internal', message: 'Something went wrong' });
});

const Id = z.string().regex(/^[\w.:/~%@+=,&()!*$\[\]-]{1,300}$/);
const Resolution = z.coerce.number().int().min(144).max(4320);

// short-lived opaque tokens: real media URLs never reach the client or logs
const tokens = new Map();
const TTL = 6 * 60 * 60 * 1000; // long enough for full movies; refreshed on every use
setInterval(() => { const n = Date.now(); for (const [k, v] of tokens) if (v.exp < n) tokens.delete(k); }, 60000).unref();
// Provider signing headers stay in the server-side token record; none are returned to the browser.
const ALLOWED_HDRS = new Set(['referer', 'user-agent', 'cookie', 'origin']);
let liveChannelSources = [];
try {
  const parsed = JSON.parse(process.env.LIVE_CHANNEL_SOURCES_JSON || '[]');
  liveChannelSources = Array.isArray(parsed) ? parsed : [];
} catch {
  liveChannelSources = [];
}
const UPSTREAM_REPO = 'mesamirh/MovieBox-TUI';
const UPSTREAM_COMMIT = process.env.UPSTREAM_COMMIT || '';
const SOCIAL_WHATSAPP_URL = process.env.SOCIAL_WHATSAPP_URL || '';
const PUBLIC_SITE_URL = String(process.env.PUBLIC_SITE_URL || '').replace(/\/$/, '');
const AI_BASE_URL = process.env.AI_BASE_URL || '';
const AI_API_KEY = process.env.AI_API_KEY || '';
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';

function assertPublicHttp(u) {
  const x = new URL(u);
  if (!['http:', 'https:'].includes(x.protocol)) throw new CoreBadResponse();
  const h = x.hostname;
  if (h === 'localhost' || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1|\[?f[cd])/i.test(h)) throw new CoreBadResponse();
}
function mint(url, headers = {}, options = {}) {
  assertPublicHttp(url);
  const t = crypto.randomBytes(18).toString('base64url');
  const h = {};
  for (const [k, v] of Object.entries(headers)) if (ALLOWED_HDRS.has(k.toLowerCase())) h[k] = v;
  tokens.set(t, { url, headers: h, targetResolution: Number(options.targetResolution) || null, expectedDuration: Number(options.expectedDuration) || null, exp: Date.now() + TTL });
  return `/api/stream/${t}`;
}
function mintSmart(url, headers, kind, res, targetResolution, expectedDuration) {
  const m = mint(url, headers, { targetResolution, expectedDuration });
  // Let the remux planner inspect every file. Compatible files are redirected
  // straight back to the range-preserving stream; HEVC, 10-bit video, unusual
  // containers, and incompatible audio get a browser-safe FFmpeg path.
  // This prevents low-resolution HEVC files from bypassing compatibility checks.
  // Keep an untouched multivariant HLS stream for Auto mode. An explicit
  // quality request must enter the same FFmpeg path as file sources, because
  // a single-variant HLS response has no browser-selectable 1080p–360p ladder.
  return kind !== 'hls' || targetResolution ? m.replace('/api/stream/', '/api/remux/') : m;
}
async function passesRuntimeCheck(candidate, expectedDuration) {
  if (!haveFfmpeg()) return true;
  const info = await probe(candidate.url, candidate.headers || {}, 5000);
  // A probe timeout is unknown, not proof that a valid signed CDN URL is bad.
  if (!info) return true;
  if (!info.video || !Number.isFinite(info.duration) || info.duration <= 0) return false;
  if (info.duration >= 8 && info.duration <= 30) return false;
  if (expectedDuration && info.duration < Math.max(45, expectedDuration * 0.45)) return false;
  return true;
}
function authorizedManifestUrls() {
  return String(process.env.STREAM_ADDON_MANIFESTS || '')
    .split(/[;\r\n]/).map((value) => value.trim()).filter(Boolean).slice(0, 30);
}
async function runAuthorizedScraper(mediaId, mediaType, episode) {
  const manifests = authorizedManifestUrls();
  const script = path.resolve(here, '../../tools/authorized_stremio_scraper.py');
  if (!manifests.length) return { streams: [], rejected: [] };
  const id = episode ? `${mediaId}:${episode}` : mediaId;
  return await new Promise((resolve) => {
    const args = [script, '--type', mediaType, '--id', id];
    for (const manifest of manifests) args.push('--manifest', manifest);
    const child = spawn(process.env.PYTHON_BIN || 'python3', args, { stdio: ['ignore', 'pipe', 'ignore'] });
    let output = '';
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} resolve({ streams: [], rejected: ['authorized scraper timed out'] }); }, 20000);
    child.stdout.on('data', (chunk) => { output += chunk; if (output.length > 2_000_000) { try { child.kill('SIGKILL'); } catch {} } });
    child.on('error', () => { clearTimeout(timer); resolve({ streams: [], rejected: ['python scraper unavailable'] }); });
    child.on('close', () => {
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(output);
        resolve({ streams: Array.isArray(parsed.streams) ? parsed.streams : [], rejected: Array.isArray(parsed.rejected) ? parsed.rejected : [] });
      } catch { resolve({ streams: [], rejected: ['authorized scraper returned invalid JSON'] }); }
    });
  });
}
app.get('/api/live/channels/:id/playback', async (req, reply) => {
  const id = z.string().regex(/^[a-z0-9-]{1,50}$/i).parse(req.params.id);
  const channel = liveChannelSources.find((item) => String(item?.id) === id);
  const sources = (channel?.sources || []).filter((source) => {
    try { return ['http:', 'https:'].includes(new URL(String(source?.url || '')).protocol); } catch { return false; }
  }).map((source) => ({
    label: String(source.label || 'Authorized source').slice(0, 80),
    url: mint(String(source.url), source.headers || {}),
  }));
  if (!sources.length) return reply.code(404).send({ error: 'channel_unavailable', message: 'No authorized playback source is configured for this channel.' });
  reply.header('cache-control', 'no-store');
  return { id, sources };
});
registerRemux(app, { tokens, TTL });
function remuxExt(u) { try { return /\.(mpd|mkv|avi|mov|ts|flv|wmv)$/i.test(new URL(u).pathname); } catch { return false; } }
function mintFor(url, headers = {}) { const m = mint(url, headers); return remuxExt(url) ? m.replace('/api/stream/', '/api/play/') : m; }

app.get('/api/health', async () => {
  if (!core.enabled()) return { ok: true, core: false };
  try {
    const status = await core.health();
    return { ok: true, core: status.ok, provider: status.core };
  } catch {
    return { ok: true, core: false };
  }
});

app.get('/api/siteguard/status', async () => ({
  ok: siteGuard.errors < 10,
  service: 'SiteGuard',
  mode: 'embedded-defensive-monitor',
  uptimeSeconds: Math.floor((Date.now() - siteGuard.startedAt) / 1000),
  requests: siteGuard.requests,
  responses: siteGuard.responses,
  errors: siteGuard.errors,
  blocked: siteGuard.blocked,
  lastEventAt: siteGuard.lastEventAt,
  protections: ['global rate limiting', 'opaque stream tokens', 'private-network URL blocking', 'security response headers', 'resolver failover'],
}));

app.get('/api/search', async (req) => {
  const { q, page } = z.object({ q: z.string().trim().min(1).max(100), page: z.coerce.number().int().min(1).max(50).default(1) }).parse(req.query);
  const [coreResult, archiveResult, openMediaResult, newsResult] = await Promise.allSettled([core.search(q, page), searchArchive(q, page), searchOpenMedia(q, page), getNews({ category: 'football', limit: 60 })]);
  const archiveItems = archiveResult.status === 'fulfilled' ? archiveResult.value : [];
  const openMediaItems = openMediaResult.status === 'fulfilled' ? openMediaResult.value : [];
  const freshNews = newsResult.status === 'fulfilled' ? newsResult.value.items : [];
  if (coreResult.status === 'rejected' && !archiveItems.length && !openMediaItems.length && !freshNews.length) throw coreResult.reason;
  const base = coreResult.status === 'fulfilled' ? coreResult.value : { results: [], page, hasMore: false };
  const seen = new Set();
  const results = [...(base.results || []), ...archiveItems, ...openMediaItems].filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  const queryWords = q.toLowerCase().split(/\s+/).filter((word) => word.length > 2);
  const news = rankNewsForQuery(freshNews.filter((item) => queryWords.some((word) => `${item.title} ${item.summary}`.toLowerCase().includes(word))), q).slice(0, 10);
  const related = [...new Set([`${q} news`, `${q} latest`, `${q} profile`, `${q} official website`])];
  const searchUrl = (site, extra = '') => `https://www.google.com/search?q=${encodeURIComponent(`${q}${extra} ${site}`.trim())}`;
  const web = [
    { kind: 'Web', source: 'Google', title: `Search the web for ${q}`, url: searchUrl('') , description: 'Open broader web results for this query.' },
    { kind: 'Knowledge', source: 'Wikipedia', title: `${q} — Wikipedia`, url: `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(q)}`, description: 'Look for an encyclopedia profile and background.' },
    { kind: 'Social', source: 'Instagram', title: `${q} on Instagram`, url: searchUrl('Instagram'), description: 'Search Instagram results; verify the account before treating it as official.' },
    { kind: 'Social', source: 'X', title: `${q} on X`, url: searchUrl('X'), description: 'Search public posts and profiles on X.' },
  ];
  return { ...base, results, page, hasMore: Boolean(base.hasMore || archiveItems.length >= 20 || openMediaItems.length >= 20), news, related, web };
});

function publicHttpsUrl(value) {
  try { const url = new URL(String(value || '')); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
}
app.get('/api/ads/search', async () => {
  const campaign = nextCampaign();
  if (campaign) return { enabled: true, campaignId: campaign.id, label: campaign.label, title: campaign.title, description: campaign.description, image: campaign.image, url: campaign.url };
  return { enabled: Boolean(publicHttpsUrl(process.env.SEARCH_AD_URL)), campaignId: 'legacy-search-ad', label: String(process.env.SEARCH_AD_LABEL || 'Sponsored').slice(0, 40), title: String(process.env.SEARCH_AD_TITLE || '').slice(0, 120), description: String(process.env.SEARCH_AD_DESCRIPTION || '').slice(0, 220), image: publicHttpsUrl(process.env.SEARCH_AD_IMAGE), url: publicHttpsUrl(process.env.SEARCH_AD_URL) };
});
app.post('/api/ads/impression', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req, reply) => {
  const { campaignId } = z.object({ campaignId: z.string().trim().min(1).max(50) }).parse(req.body || {});
  recordCampaignEvent(campaignId, 'impression');
  return reply.code(204).send();
});
app.post('/api/ads/click', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
  const { campaignId } = z.object({ campaignId: z.string().trim().min(1).max(50) }).parse(req.body || {});
  recordCampaignEvent(campaignId, 'click');
  return reply.code(204).send();
});

app.get('/api/shorts', async (req) => {
  const { q, page } = z.object({ q: z.string().trim().min(1).max(100), page: z.coerce.number().int().min(1).max(50).default(1) }).parse(req.query);
  return core.shorts(q, page);
});

// Recommendations use only short-lived, client-supplied taste seeds. No
// watch history, identity, or notification profile is stored on the server.
app.post('/api/recommendations', async (req) => {
  const { seeds } = z.object({
    seeds: z.array(z.string().trim().min(1).max(100)).max(4).default([]),
  }).parse(req.body || {});
  if (!seeds.length) return { results: [], reason: 'search-or-watch-a-title-first' };
  const responses = await Promise.allSettled(seeds.map((seed) => core.search(seed, 1)));
  const seen = new Set();
  const results = [];
  for (const response of responses) {
    if (response.status !== 'fulfilled') continue;
    for (const item of response.value.results || []) {
      if (seen.has(item.id) || results.length >= 6) continue;
      seen.add(item.id);
      results.push(item);
    }
  }
  return { results, generatedAt: new Date().toISOString() };
});

app.get('/api/upstream-status', async () => {
  try {
    const response = await fetch(`https://api.github.com/repos/${UPSTREAM_REPO}/commits/main`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'free-heart-upstream-check' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { checked: false, updateAvailable: false };
    const data = await response.json();
    const latestCommit = typeof data.sha === 'string' ? data.sha : '';
    return {
      checked: Boolean(latestCommit),
      repository: UPSTREAM_REPO,
      pinnedCommit: UPSTREAM_COMMIT || null,
      latestCommit: latestCommit || null,
      updateAvailable: Boolean(UPSTREAM_COMMIT && latestCommit && latestCommit !== UPSTREAM_COMMIT),
      message: data.commit?.message?.split('\n')[0] || null,
    };
  } catch {
    return { checked: false, updateAvailable: false };
  }
});

app.get('/api/social', async () => ({
  instagram: 'https://instagram.com/try_it_nah',
  whatsapp: SOCIAL_WHATSAPP_URL || null,
}));

function aiBaseUrl(value) {
  const raw = String(value || AI_BASE_URL || '').replace(/\/$/, '');
  if (!raw) throw new CoreClientError(400, 'ai_not_configured', 'Connect an AI provider first.');
  const u = new URL(raw);
  if (!['http:', 'https:'].includes(u.protocol)) throw new CoreClientError(400, 'bad_ai_url', 'The AI endpoint must use HTTP or HTTPS.');
  if (/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1)/i.test(u.hostname) && !['localhost', '127.0.0.1'].includes(u.hostname)) throw new CoreClientError(400, 'bad_ai_url', 'Private network AI endpoints are not reachable from this deployment.');
  return raw;
}

app.post('/api/ai/caption', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
  const body = z.object({
    title: z.string().trim().min(1).max(160),
    context: z.string().trim().max(1200).default(''),
    style: z.enum(['punchy', 'cinematic', 'funny', 'educational', 'minimal']).default('punchy'),
    language: z.string().trim().min(2).max(40).default('English'),
    baseUrl: z.string().url().optional(),
    model: z.string().trim().min(1).max(120).optional(),
  }).parse(req.body || {});
  const key = String(req.headers['x-ai-api-key'] || AI_API_KEY || '').trim();
  if (!key) return reply.code(401).send({ error: 'ai_key_required', message: 'Add an AI API key in Clip Studio or configure AI_API_KEY on the server.' });
  const endpoint = `${aiBaseUrl(body.baseUrl)}/chat/completions`;
  const prompt = `Create metadata for a short-form video clip. Return JSON only with keys title and caption. The caption must be under 280 characters, attractive but not misleading, and include 3-6 relevant hashtags. Do not claim facts not present in the context. Language: ${body.language}. Style: ${body.style}. Video title: ${body.title}. Context: ${body.context}`;
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: body.model || AI_MODEL, temperature: 0.8, messages: [{ role: 'system', content: 'You write concise, platform-safe social video metadata.' }, { role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(30000),
    });
  } catch { return reply.code(502).send({ error: 'ai_unreachable', message: 'The selected AI endpoint could not be reached.' }); }
  const upstream = await response.json().catch(() => ({}));
  if (!response.ok) return reply.code(response.status === 429 ? 429 : 502).send({ error: 'ai_provider_error', message: upstream.error?.message || 'The AI provider rejected the request.' });
  const content = upstream.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) return reply.code(502).send({ error: 'ai_empty', message: 'The AI provider returned no caption.' });
  let parsed;
  try { parsed = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, '').trim()); } catch { parsed = { title: body.title, caption: content.trim() }; }
  return { title: String(parsed.title || body.title).slice(0, 100), caption: String(parsed.caption || content).slice(0, 500), model: body.model || AI_MODEL };
});

app.get('/api/title/:id', async (req) => {
  const id = Id.parse(req.params.id);
  if (isOpenMediaId(id)) {
    try { return await getOpenMediaTitle(id); }
    catch { throw new CoreClientError(404, 'open_media_item_unavailable', 'This authorized open-media item is unavailable or failed its rights/media checks.'); }
  }
  if (id.startsWith('archive:')) {
    try { return await getArchiveTitle(id.slice('archive:'.length)); }
    catch { throw new CoreClientError(404, 'archive_item_unavailable', 'This Internet Archive item is unavailable.'); }
  }
  return core.title(id);
});

app.post('/api/resolve', { config: { rateLimit: { max: 90, timeWindow: '1 minute' } } }, async (req) => {
  const b = z.object({ id: Id, episode: z.string().max(64).optional(), resolution: Resolution.nullish() }).parse(req.body);
  let r;
  let coreError;
  const isArchive = b.id.startsWith('archive:');
  const isOpenMedia = isOpenMediaId(b.id);
  const scraperPromise = isArchive || isOpenMedia
    ? Promise.resolve({ streams: [], rejected: [] })
    : runAuthorizedScraper(b.id, b.episode ? 'series' : 'movie', b.episode);

  if (isArchive) {
    try {
      const resolved = await resolveArchive(b.id.slice('archive:'.length));
      if (!resolved.streams.length) {
        throw new CoreClientError(404, 'archive_video_not_found', 'This Internet Archive item has no directly playable video file.');
      }
      r = {
        kind: resolved.streams[0].kind,
        candidates: resolved.streams,
        expectedDurationSeconds: resolved.expectedDurationSeconds,
        selectedResolution: 0,
        resolutions: [],
        subtitles: [],
      };
    } catch (err) {
      if (err instanceof CoreClientError) throw err;
      throw new CoreClientError(404, 'archive_item_unavailable', 'The Internet Archive item or its downloadable media is unavailable.');
    }
  } else if (isOpenMedia) {
    try {
      const resolved = await resolveOpenMedia(b.id);
      if (!resolved.streams.length) throw new CoreClientError(404, 'open_media_video_not_found', 'This authorized source has no directly playable media.');
      r = { kind: resolved.streams[0].kind, candidates: resolved.streams, expectedDurationSeconds: resolved.expectedDurationSeconds, selectedResolution: 0, resolutions: [], subtitles: [] };
    } catch (err) {
      if (err instanceof CoreClientError) throw err;
      throw new CoreClientError(404, 'open_media_item_unavailable', 'The authorized source item or its downloadable media is unavailable.');
    }
  } else {
    try { r = await core.resolve(b.id, b.episode, b.resolution ?? undefined); } catch (err) {
      coreError = err;
      const clean = (v) => String(v || '').replace(/https?:\/\/\S+/g, '[url]').slice(0, 400);
      lastErrors.unshift({ at: new Date().toISOString(), name: err?.name, status: err?.statusCode || err?.status, message: clean(err?.message), kind: err?.kind, cause: clean(err?.cause?.message || err?.cause) });
      lastErrors.length = Math.min(lastErrors.length, 8);
    }
  }

  const scraped = await scraperPromise;
  const sourceCandidates = [
    ...(r?.candidates || (r?.url ? [{ url: r.url, kind: r.kind, headers: r.headers }] : [])),
    ...scraped.streams.map((stream) => ({ url: stream.url, kind: stream.kind, headers: stream.headers || {} })),
  ];
  if (!sourceCandidates.length && coreError) throw coreError;
  if (!sourceCandidates.length) throw new CoreClientError(404, 'no_playable_stream', 'No directly playable media was found for this title.');
  req.log.info({ wanted: b.resolution, selected: r?.selectedResolution, kind: r?.kind, coreCandidates: r?.candidates?.length || 0, authorizedCandidates: scraped.streams.length, archive: isArchive, openMedia: isOpenMedia }, 'resolve debug');
  const checkedCandidates = (await Promise.all(sourceCandidates.map(async (candidate) => ({
    candidate,
    valid: await passesRuntimeCheck(candidate, r?.expectedDurationSeconds),
  })))).filter((item) => item.valid).map((item) => item.candidate);
  if (!checkedCandidates.length) throw new CoreClientError(502, 'no_verified_media', 'No source passed video and runtime verification.');
  const candidates = checkedCandidates.map((candidate) => ({
    kind: candidate.kind,
    stream: mintSmart(candidate.url, candidate.headers, candidate.kind, r?.selectedResolution || 0, b.resolution ?? null, r?.expectedDurationSeconds ?? null),
  }));
  const withDownloads = candidates.map((candidate) => ({
    ...candidate,
    download: candidate.kind === 'hls' ? candidate.stream.replace('/api/stream/', '/api/remux/') : candidate.stream,
  }));
  return {
    kind: r?.kind || candidates[0]?.kind || 'file',
    stream: withDownloads[0]?.stream || mint(sourceCandidates[0].url, sourceCandidates[0].headers),
    download: withDownloads[0]?.download || withDownloads[0]?.stream,
    candidates: withDownloads,
    subtitles: (r?.subtitles || []).map((subtitle) => ({ lang: subtitle.lang, label: subtitle.label, src: mint(subtitle.url, r.headers) })),
    resolutions: r?.resolutions || [],
    selectedResolution: r?.selectedResolution || 0,
  };
});

app.post('/api/verify', { config: { rateLimit: { max: 180, timeWindow: '1 minute' } } }, async (req, reply) => {
  const body = z.object({
    stream: z.string().regex(/^\/api\/(?:stream|remux|play)\/[\w-]{20,40}$/),
    allowShortMedia: z.boolean().default(false),
  }).parse(req.body || {});
  const token = body.stream.split('/').pop();
  const entry = tokens.get(token);
  if (!entry || entry.exp < Date.now()) return reply.code(404).send({ verified: false, message: 'The stream link expired.' });
  entry.exp = Date.now() + TTL;
  if (!haveFfmpeg()) return { verified: null, playable: true, reason: 'probe_unavailable' };
  const info = await probe(entry.url, entry.headers || {}, 7000);
  // Signed CDNs and some HLS manifests can be valid while refusing an
  // out-of-band ffprobe request. Do not turn an inconclusive probe into a
  // false "ad-only" verdict; the streamed response is still checked below
  // by the downloader for HTML, empty data, and tiny non-video payloads.
  if (!info) return { verified: null, playable: null, reason: 'probe_inconclusive' };
  const shortInterstitial = !body.allowShortMedia && Number.isFinite(info?.duration) && info.duration >= 8 && info.duration <= 30;
  const runtimeMismatch = entry.expectedDuration && Number.isFinite(info?.duration)
    && info.duration < Math.max(45, entry.expectedDuration * 0.45);
  const playable = Boolean(info?.video) && Number.isFinite(info?.duration) && info.duration > 0 && !shortInterstitial && !runtimeMismatch;
  return {
    verified: playable,
    playable,
    duration: info?.duration || 0,
    height: info?.height || 0,
    codec: info?.video || '',
    reason: !info ? 'media_probe_failed' : shortInterstitial ? 'short_interstitial' : runtimeMismatch ? 'runtime_mismatch' : playable ? 'ok' : 'no_video_stream',
  };
});

function upstreamMessage(status) {
  if (status === 401) return 'The source needs a sign-in for this file (HTTP 401). Try another quality or title.';
  if (status === 402) return 'The source is asking for payment or a subscription for this file (HTTP 402). Try another quality or title.';
  if (status === 403) return 'The source refused this request (HTTP 403). The link may be blocked or expired. Try another quality.';
  if (status === 404) return 'The source no longer has this file (HTTP 404). Try another quality or title.';
  if (status === 410) return 'This link expired (HTTP 410). Go back and press Play again.';
  return `The source rejected this request (HTTP ${status}). Try another quality or try again later.`;
}
function isAdRedirectTarget(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return /(^|\\.)((doubleclick|googlesyndication|googleadservices|adservice|adserver|popads|propellerads|exoclick|trafficjunky)\\.)/.test(host);
  } catch {
    return true;
  }
}
function isHlsResponse(response, sourceUrl) {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('mpegurl') || contentType.includes('vnd.apple.mpegurl')) return true;
  try { return new URL(sourceUrl).pathname.toLowerCase().endsWith('.m3u8'); } catch { return false; }
}
function proxyHlsUri(value, baseUrl, headers) {
  if (!value || /^(data:|https?:\/\/[^\s]+\/api\/stream\/)/i.test(value)) return value;
  try { return mint(new URL(value, baseUrl).toString(), headers); } catch { return value; }
}
function rewriteHlsManifest(text, baseUrl, headers) {
  return String(text).split(/(\r?\n)/).map((line) => {
    if (/^#/.test(line) || !line.trim()) {
      return line.replace(/URI="([^"]+)"/gi, (_match, uri) => `URI="${proxyHlsUri(uri, baseUrl, headers)}"`);
    }
    return proxyHlsUri(line.trim(), baseUrl, headers);
  }).join('');
}

app.get('/api/stream/:token', { config: { rateLimit: { max: 1500, timeWindow: '1 minute' } } }, async (req, reply) => {
  const { token } = z.object({ token: z.string().regex(/^[\w-]{20,40}$/) }).parse(req.params);
  const e = tokens.get(token);
  if (!e || e.exp < Date.now()) return reply.code(404).send({ error: 'expired', message: 'Stream link expired' });
  e.exp = Date.now() + TTL;

  // Abort upstream only if the client really disconnects before we finish.
  // (req.raw 'close' fires right after a GET is read on Node 16+, which killed every stream -> 502.)
  const ac = new AbortController();
  reply.raw.on('close', () => { if (!reply.raw.writableFinished) ac.abort(); });

  const headers = {
    'user-agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
    accept: '*/*',
    'accept-encoding': 'identity',
    connection: 'keep-alive',
    ...e.headers,
  };
  if (req.headers.range) headers.range = String(req.headers.range);

  let r;
  let lastStatus = 0;
  let lastErr = '';
  for (let attempt = 0; attempt < 2 && !ac.signal.aborted; attempt += 1) {
    try {
      const attemptController = new AbortController();
      const upstreamTimeout = setTimeout(() => {
        attemptController.abort(
          new DOMException('Upstream response headers timed out', 'TimeoutError')
        );
      }, 20000);

      try {
        r = await fetch(e.url, {
          headers,
          signal: AbortSignal.any([ac.signal, attemptController.signal]),
          redirect: 'follow'
        });
      } finally {
        // Limit the timeout to connecting and receiving response headers.
        // Do not abort a healthy response while its video body is streaming.
        clearTimeout(upstreamTimeout);
      }
      if (r.ok || (r.status >= 400 && r.status < 500 && r.status !== 429 && r.status !== 408)) break;
      lastStatus = r.status;
      try { await r.body?.cancel(); } catch {}
      r = undefined;
    } catch (err) {
      r = undefined;
      lastErr = err?.cause?.code || err?.code || (err?.name === 'TimeoutError' ? 'timeout' : err?.name) || 'network';
      if (ac.signal.aborted) break;
    }
    if (attempt < 1) await new Promise((res) => setTimeout(res, 800));
  }
  if (!r) {
    if (ac.signal.aborted) return reply;
    req.log.warn({ status: lastStatus, err: lastErr }, 'stream upstream failed');
    return reply.code(502).send({ error: 'upstream_failed', message: `The source could not be reached (${lastStatus ? `HTTP ${lastStatus}` : lastErr}). Try another quality or try again.` });
  }
  const finalUrl = r.url || e.url;
  const finalType = String(r.headers.get('content-type') || '').toLowerCase();
  if (isAdRedirectTarget(finalUrl) || finalType.includes('text/html') || finalType.includes('application/xhtml+xml')) {
    try { await r.body?.cancel(); } catch {}
    return reply.code(502).send({
      error: 'non_media_redirect',
      message: 'The selected source redirected to an advertising or web page instead of a media stream. Choose another source.',
    });
  }

  if (!r.ok && r.status !== 416) {
    try { await r.body?.cancel(); } catch {}
    return reply.code(r.status).send({ error: 'upstream_rejected', message: upstreamMessage(r.status) });
  }

  if (r.ok && isHlsResponse(r, e.url)) {
    const manifest = await r.text().catch(() => '');
    if (!manifest || manifest.length > 2_000_000) {
      return reply.code(502).send({ error: 'invalid_manifest', message: 'The source returned an empty or oversized HLS manifest.' });
    }
    reply.code(200).type('application/vnd.apple.mpegurl; charset=utf-8');
    reply.header('cache-control', 'no-store');
    return reply.send(rewriteHlsManifest(manifest, e.url, e.headers));
  }

  reply.code(r.status);
  for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag']) {
    const v = r.headers.get(h); if (v) reply.header(h, v);
  }
  if (!r.headers.get('accept-ranges')) reply.header('accept-ranges', 'bytes');
  reply.header('cache-control', 'no-store');
  reply.header('x-accel-buffering', 'no');
  if (!r.body) return reply.send();
  const stream = Readable.fromWeb(r.body);
  stream.on('error', () => { try { reply.raw.destroy(); } catch {} });
  return reply.send(stream);
});

let ffOk = null;
let ffActive = 0;
async function hasFfmpeg() {
  if (ffOk === null) { const { spawnSync } = await import('node:child_process'); ffOk = spawnSync('ffmpeg', ['-version']).status === 0; }
  return ffOk;
}
app.get('/api/play/:token', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
  const { token } = z.object({ token: z.string().regex(/^[\w-]{20,40}$/) }).parse(req.params);
  const e = tokens.get(token);
  if (!e || e.exp < Date.now()) return reply.code(404).send({ error: 'expired', message: 'Stream link expired' });
  if (!(await hasFfmpeg())) return reply.code(501).send({ error: 'no_ffmpeg', message: 'This source needs the converter, which is not installed on the server yet.' });
  if (ffActive >= 2) return reply.code(503).send({ error: 'busy', message: 'The converter is busy. Try again in a moment.' });
  e.exp = Date.now() + TTL;
  const { spawn } = await import('node:child_process');
  const hdrs = e.headers || {};
  const ua = hdrs['user-agent'] || hdrs['User-Agent'] || 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
  const extra = Object.entries(hdrs).filter(([k]) => k.toLowerCase() !== 'user-agent').map(([k, v]) => `${k}: ${v}`).join('\r\n');
  const args = ['-hide_banner', '-loglevel', 'error', '-user_agent', ua];
  if (extra) args.push('-headers', extra + '\r\n');
  args.push('-i', e.url, '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-f', 'mp4', 'pipe:1');
  const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'ignore'] });
  ffActive += 1;
  let done = false;
  const end = () => { if (!done) { done = true; ffActive -= 1; } try { ff.kill('SIGKILL'); } catch {} };
  ff.on('error', end);
  ff.on('close', (code) => { if (code) req.log.warn({ code }, 'ffmpeg exit'); end(); });
  reply.raw.on('close', end);
  reply.header('content-type', 'video/mp4');
  reply.header('cache-control', 'no-store');
  reply.header('x-accel-buffering', 'no');
  return reply.send(ff.stdout);
});

let clipFf = null; let clipActive = 0;
async function clipHasFfmpeg() { if (clipFf === null) { const { spawnSync } = await import('node:child_process'); clipFf = spawnSync('ffmpeg', ['-version']).status === 0; } return clipFf; }
app.get('/api/clip/:token', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
  const { token } = z.object({ token: z.string().regex(/^[\w-]{20,40}$/) }).parse(req.params);
  const q = z.object({ start: z.coerce.number().min(0).max(86400), dur: z.coerce.number().min(1).max(60) }).parse(req.query);
  const e = tokens.get(token);
  if (!e || e.exp < Date.now()) return reply.code(404).send({ error: 'expired', message: 'Stream link expired' });
  if (!(await clipHasFfmpeg())) return reply.code(501).send({ error: 'no_ffmpeg', message: 'The clip cutter is not installed on the server yet.' });
  if (clipActive >= 2) return reply.code(503).send({ error: 'busy', message: 'The clip cutter is busy. Try again in a moment.' });
  const { spawn } = await import('node:child_process');
  const h = e.headers || {};
  const ua = h['user-agent'] || h['User-Agent'] || 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
  const extra = Object.entries(h).filter(([k]) => k.toLowerCase() !== 'user-agent').map(([k, v]) => `${k}: ${v}`).join('\r\n');
  const args = ['-hide_banner', '-loglevel', 'error', '-user_agent', ua];
  if (extra) args.push('-headers', extra + '\r\n');
  args.push('-ss', String(q.start), '-i', e.url, '-t', String(q.dur), '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-ac', '2', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-f', 'mp4', 'pipe:1');
  const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'ignore'] });
  clipActive += 1; let done = false;
  const end = () => { if (!done) { done = true; clipActive -= 1; } try { ff.kill('SIGKILL'); } catch {} };
  const guard = setTimeout(end, 120000);
  ff.on('error', end); ff.on('close', () => { clearTimeout(guard); end(); }); reply.raw.on('close', end);
  reply.header('content-type', 'video/mp4'); reply.header('content-disposition', 'attachment; filename="clip.mp4"'); reply.header('cache-control', 'no-store');
  return reply.send(ff.stdout);
});
const NEWS_FEEDS = { football: 'football', 'premier-league': 'premier-league', 'champions-league': 'champions-league', european: 'european', womens: 'womens' };
async function footballNews(feed) { return getNews({ category: NEWS_FEEDS[feed] ? feed : 'football', limit: 40 }); }
function newsStatusLabel(item) { return item.verification === 'official' ? 'Official source' : item.verification === 'corroborated' ? `${item.corroborationCount} sources` : 'Reported · awaiting corroboration'; }
function newsCard(item) {
  return `<a href="/news/item/${encodeURIComponent(item.id)}" style="display:flex;gap:12px;margin:12px 0;padding:10px;border:1px solid #24242c;border-radius:12px;text-decoration:none;color:inherit">${item.image ? `<img src="${htmlEscape(item.image)}" alt="" width="120" height="68" loading="lazy" style="object-fit:cover;border-radius:8px">` : ''}<span><b>${htmlEscape(item.title)}</b><br><small>${htmlEscape(newsStatusLabel(item))} · ${htmlEscape(item.source)}</small><br><small>${htmlEscape(item.summary)}</small></span></a>`;
}
app.get('/api/football-news', async (req, reply) => {
  try { return await footballNews(String(req.query?.feed || 'football')); } catch { return reply.code(502).send({ error: 'news_unavailable', message: 'News sources are unavailable right now. Try again shortly.' }); }
});
app.get('/news/item/:id', async (req, reply) => {
  const item = getNewsArticle(req.params.id);
  if (!item) return reply.code(404).type('text/html').send(await seoIndex({ title: 'News story not found — free❤️‍🔥', description: 'This news story is no longer in the verified news index.', pathName: `/news/item/${encodeURIComponent(req.params.id)}`, body: '<section class="seo-intro"><h1>News story not found</h1><p>Return to the latest news.</p><p><a href="/news">Latest news</a></p></section>' }));
  const description = String(item.summary || `Latest ${item.category} report from ${item.source}.`).slice(0, 155);
  const sourceLinks = item.sources.map((source) => `<li><a href="${htmlEscape(source.link)}" rel="nofollow noopener noreferrer">${htmlEscape(source.name)}</a></li>`).join('');
  const campaign = nextCampaign();
  const ad = campaign ? `<aside class="news-ad-slot" aria-label="Advertisement"><span>ADVERTISEMENT</span><a href="${htmlEscape(campaign.url)}" target="_blank" rel="sponsored noopener noreferrer"><b>${htmlEscape(campaign.title)}</b><small>${htmlEscape(campaign.description)}</small><em>${htmlEscape(campaign.label)} ↗</em></a></aside>` : '';
  const published = new Date(item.publishedAt);
  const dateLabel = Number.isNaN(published.getTime()) ? item.publishedAt : published.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const body = `<article class="news-article seo-intro">${ad}<span class="eyebrow">${htmlEscape(item.category)} · ${htmlEscape(newsStatusLabel(item))}</span><h1>${htmlEscape(item.title)}</h1>${item.image ? `<figure><img src="${htmlEscape(item.image)}" alt="${htmlEscape(item.title)}" width="960" height="540" loading="eager"><figcaption>Image supplied by ${htmlEscape(item.source)} through its feed.</figcaption></figure>` : ''}<p class="news-byline"><b>${htmlEscape(item.source)}</b><span> · </span>${htmlEscape(dateLabel)}</p><p class="news-lead"><strong>${htmlEscape(description)}</strong></p><p>This is a concise, source-linked news brief. The original publisher may update its report as more information becomes available.</p><p class="news-source-note">Read the original reporting and any later updates from the source below.</p><h2>Sources</h2><ul>${sourceLinks}</ul><p><a class="news-back" href="/news?feed=${encodeURIComponent(item.category)}">← More ${htmlEscape(item.category)} news</a></p></article>`;
  const schema = { '@context': 'https://schema.org', '@type': 'NewsArticle', headline: item.title, image: item.image ? [item.image] : undefined, datePublished: item.publishedAt, dateModified: item.fetchedAt, author: { '@type': 'Organization', name: item.source }, publisher: { '@type': 'Organization', name: 'free❤️‍🔥' }, mainEntityOfPage: `${PUBLIC_SITE_URL || ''}/news/item/${encodeURIComponent(item.id)}` };
  return reply.type('text/html').send(await seoIndex({ title: `${item.title} — free❤️‍🔥`, description, pathName: `/news/item/${encodeURIComponent(item.id)}`, body, schema }));
});
app.get('/news', async (req, reply) => {
  const feed = NEWS_FEEDS[req.query?.feed] ? String(req.query.feed) : 'football';
  let data; try { data = await footballNews(feed); } catch { data = { source: 'configured RSS sources', feed, items: [] }; }
  const tabs = Object.keys(NEWS_FEEDS).map((key) => `<a href="/news?feed=${key}" style="padding:6px 12px;border-radius:99px;border:1px solid #888;text-decoration:none;color:inherit;${key === feed ? 'background:#d6303e;color:#fff;border-color:#d6303e;' : ''}">${key}</a>`).join(' ');
  const cards = data.items.map(newsCard).join('') || '<p>News is unavailable right now. Try again shortly.</p>';
  const body = `<section class="seo-intro"><span class="eyebrow">Fast, attributed news</span><h1>Latest ${htmlEscape(feed)} news</h1><p>Headlines are collected from permitted RSS sources, deduplicated, and marked as reported, corroborated, or official. Read the original reporting through the source links.</p><p style="display:flex;flex-wrap:wrap;gap:8px">${tabs}</p>${cards}<p><small>Sources: ${htmlEscape(data.source)}. Last refreshed ${htmlEscape(data.updatedAt)}.</small></p></section>`;
  return reply.type('text/html').send(await seoIndex({ title: `Latest ${feed} news — free❤️‍🔥`, description: `Fast, attributed ${feed} news with source links and corroboration labels.`, pathName: `/news?feed=${encodeURIComponent(feed)}`, body }));
});
const lastErrors = [];
app.get('/api/last-error', async () => ({ errors: lastErrors }));
function htmlEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function xmlEscape(value) { return htmlEscape(value); }
async function seoIndex({ title, description, pathName = '/', body, schema } = {}) {
  let html = await readFile(path.resolve(here, '../../web/index.html'), 'utf8');
  if (PUBLIC_SITE_URL) html = html.replaceAll('__PUBLIC_SITE_URL__', PUBLIC_SITE_URL);
  else html = html.replace(/<meta property="og:url"[^>]*>\n?|<meta property="og:image"[^>]*>\n?|<meta name="twitter:image"[^>]*>\n?|<link rel="canonical"[^>]*>\n?|<script type="application\/ld\+json">[\s\S]*?<\/script>\n?/g, '');
  if (title) html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${htmlEscape(title)}</title>`);
  if (description) html = html.replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${htmlEscape(description)}">`);
  if (PUBLIC_SITE_URL) html = html.replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${PUBLIC_SITE_URL}${pathName}">`).replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${PUBLIC_SITE_URL}${pathName}">`);
  if (body) html = html.replace(/<main id="app">[\s\S]*?<\/main>/, `<main id="app">${body}</main>`);
  if (schema && PUBLIC_SITE_URL) html = html.replace('</head>', `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script></head>`);
  return html;
}

app.get('/', async (_req, reply) => reply.type('text/html').send(await seoIndex()));
app.get('/about', async (_req, reply) => reply.type('text/html').send(await seoIndex({ title: 'About free❤️‍🔥 — Private offline playback and Clip Studio', description: 'Learn how free❤️‍🔥 supports streaming, private offline playback, browser-based clipping, and AI captions.', pathName: '/about', body: '<section class="seo-intro"><span class="eyebrow">About free❤️‍🔥</span><h1>Stories, on your terms.</h1><p>Free❤️‍🔥 is a mobile-friendly streaming PWA with browser-private downloads, subtitles, a VLC-style player, and Clip Studio for short-form edits and AI captions.</p><p><a href="/">Back to search</a></p></section>' })));
app.get('/title/:id', async (req, reply) => {
  try {
    const parsedId = Id.parse(req.params.id);
    const data = isOpenMediaId(parsedId)
      ? await getOpenMediaTitle(parsedId)
      : parsedId.startsWith('archive:')
        ? await getArchiveTitle(parsedId.slice('archive:'.length))
        : await core.title(parsedId);
    const title = String(data.title || 'Watch this title');
    const description = String(data.overview || `Watch ${title} online with free❤️‍🔥.`).slice(0, 155);
    const id = encodeURIComponent(req.params.id);
    const poster = [data.poster, data.posterUrl, data.image, data.backdrop].find((value) => /^https:\/\//i.test(String(value || '')));
    const body = `<article class="seo-intro"><span class="eyebrow">${htmlEscape(data.type || 'Title')}</span><h1>${htmlEscape(title)}</h1>${poster ? `<img src="${htmlEscape(poster)}" alt="${htmlEscape(title)} poster" width="342" height="513" style="max-width:100%;height:auto;border-radius:14px;object-fit:cover">` : ''}<p>${htmlEscape(description)}</p><p><a href="/#/title/${id}">Open ${htmlEscape(title)} in free❤️‍🔥</a></p></article>`;
    const schema = { '@context': 'https://schema.org', '@type': String(data.type || '').toLowerCase().includes('series') ? 'TVSeries' : 'Movie', name: title, description, image: poster ? [poster] : undefined, url: `${PUBLIC_SITE_URL || ''}/title/${id}` };
    const html = await seoIndex({ title: `${title} — free❤️‍🔥`, description, pathName: `/title/${id}`, body, schema });
    return reply.type('text/html').send(html);
  } catch { return reply.code(404).type('text/html').send(await seoIndex({ title: 'Title not found — free❤️‍🔥', description: 'This title could not be found.', pathName: `/title/${encodeURIComponent(req.params.id)}`, body: '<section class="seo-intro"><h1>Title not found</h1><p>Try another search.</p><p><a href="/">Return to free❤️‍🔥</a></p></section>' })); }
});
app.get('/robots.txt', async (_req, reply) => {
  const sitemap = PUBLIC_SITE_URL ? `\nSitemap: ${PUBLIC_SITE_URL}/sitemap.xml\nSitemap: ${PUBLIC_SITE_URL}/news-sitemap.xml` : '';
  return reply.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin\nDisallow: /downloads${sitemap}\n`);
});
async function publicMovieUrls() {
  const responses = await Promise.allSettled(['popular', 'trending', 'latest movies'].map((query) => core.search(query, 1)));
  const seen = new Set();
  const providerItems = responses.flatMap((response) => response.status === 'fulfilled' ? response.value.results || [] : []);
  const lawfulSamples = ['archive:BigBuckBunny_124', 'commons:20022660', 'blender:1065', 'loc:00694131', 'nasa:KSC-19850101-MH-NAS01-0001-Apollo_11_Buzz_Aldrin_Experts-B_2141'].map((id) => ({ id }));
  return [...providerItems, ...lawfulSamples].filter((item) => item?.id && !seen.has(String(item.id)) && seen.add(String(item.id))).slice(0, 505).map((item) => `/title/${encodeURIComponent(item.id)}`);
}
app.get('/news-sitemap.xml', async (_req, reply) => {
  if (!PUBLIC_SITE_URL) return reply.code(503).type('text/plain').send('Set PUBLIC_SITE_URL before exposing a news sitemap.');
  try { await footballNews('football'); } catch { /* serve the last persisted set */ }
  const urls = getNewsSitemapItems().slice(0, 1000).map((item) => `<url><loc>${xmlEscape(`${PUBLIC_SITE_URL}/news/item/${encodeURIComponent(item.id)}`)}</loc><news:news><news:publication><news:name>free❤️‍🔥</news:name><news:language>en</news:language></news:publication><news:publication_date>${xmlEscape(item.publishedAt)}</news:publication_date><news:title>${xmlEscape(item.title)}</news:title></news:news></url>`).join('');
  return reply.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">${urls}</urlset>`);
});
app.get('/sitemap.xml', async (_req, reply) => {
  if (!PUBLIC_SITE_URL) return reply.code(503).type('text/plain').send('Set PUBLIC_SITE_URL before exposing a sitemap.');
  let movieUrls = []; try { movieUrls = await publicMovieUrls(); } catch { /* keep static URLs available */ }
  const newsUrls = getNewsSitemapItems().map((item) => `/news/item/${encodeURIComponent(item.id)}`);
  const urls = ['/', '/about', '/news', ...movieUrls, ...newsUrls].filter((url, index, list) => list.indexOf(url) === index);
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${xmlEscape(`${PUBLIC_SITE_URL}${u}`)}</loc><changefreq>${u === '/' ? 'daily' : u.startsWith('/news') ? 'hourly' : 'weekly'}</changefreq></url>`).join('')}</urlset>`;
  return reply.type('application/xml').send(xml);
});

// The SPA only needs exact static assets because application navigation uses
// hash routes. Disable the static plugin's catch-all so it cannot intercept
// server-rendered /news/item/* and /title/* pages before their SEO handlers.
await app.register(fastifyStatic, { root: path.resolve(here, '../../web'), wildcard: false, index: false });

app.server.keepAliveTimeout = 120000;
app.server.headersTimeout = 125000;
const port = Number(process.env.PORT || 3000);
startAutomaticPush();
startNewsRefresh({ log: app.log });
await app.listen({ port, host: process.env.HOST || '0.0.0.0' });


// Render free tier sleeps after ~15 min idle (cold start = 502). Ping ourselves to stay awake.
if (process.env.RENDER_EXTERNAL_URL) {
  setInterval(() => { fetch(`${process.env.RENDER_EXTERNAL_URL}/api/health`, { signal: AbortSignal.timeout(15000) }).catch(() => {}); }, 10 * 60 * 1000).unref();
}
