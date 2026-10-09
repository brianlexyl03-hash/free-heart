import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { z, ZodError } from 'zod';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { core, CoreUnavailable, CoreBadResponse, CoreClientError } from './core.js';
import { registerLiveScores } from './live-scores.js';
import { registerLiveAlerts, startLiveAlerts } from './live-alerts.js';
import { hasSubscription, registerPushRoutes, sendToEndpoint } from './push-notifications.js';
import { startAutomaticPush } from './auto-push.js';

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

await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

registerPushRoutes(app);
registerLiveScores(app);
registerLiveAlerts(app, { hasSubscription });
startLiveAlerts({ sendTo: sendToEndpoint, log: app.log });

app.get('/google30f58f739b375061.html', async (_req, reply) => {
  return reply
    .type('text/html; charset=utf-8')
    .send('google-site-verification: google30f58f739b375061.html');
});

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
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const UPSTREAM_REPO = 'mesamirh/MovieBox-TUI';
const UPSTREAM_COMMIT = process.env.UPSTREAM_COMMIT || '';
const SOCIAL_WHATSAPP_URL = process.env.SOCIAL_WHATSAPP_URL || '';
const PUBLIC_SITE_URL = String(process.env.PUBLIC_SITE_URL || '').replace(/\/$/, '');
const AI_BASE_URL = process.env.AI_BASE_URL || '';
const AI_API_KEY = process.env.AI_API_KEY || '';
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';
let adConfig = {
  enabled: Boolean(process.env.AD_URL),
  url: process.env.AD_URL || '',
  durationSeconds: Math.min(9, Math.max(1, Number(process.env.AD_DURATION_SECONDS || 5))),
};

function assertPublicHttp(u) {
  const x = new URL(u);
  if (!['http:', 'https:'].includes(x.protocol)) throw new CoreBadResponse();
  const h = x.hostname;
  if (h === 'localhost' || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1|\[?f[cd])/i.test(h)) throw new CoreBadResponse();
}
function mint(url, headers = {}) {
  assertPublicHttp(url);
  const t = crypto.randomBytes(18).toString('base64url');
  const h = {};
  for (const [k, v] of Object.entries(headers)) if (ALLOWED_HDRS.has(k.toLowerCase())) h[k] = v;
  tokens.set(t, { url, headers: h, exp: Date.now() + TTL });
  return `/api/stream/${t}`;
}

app.get('/api/health', async () => {
  if (!core.enabled()) return { ok: true, core: false };
  try {
    const status = await core.health();
    return { ok: true, core: status.ok, provider: status.core };
  } catch {
    return { ok: true, core: false };
  }
});

app.get('/api/search', async (req) => {
  const { q, page } = z.object({ q: z.string().trim().min(1).max(100), page: z.coerce.number().int().min(1).max(50).default(1) }).parse(req.query);
  return core.search(q, page);
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

app.get('/api/title/:id', async (req) => core.title(Id.parse(req.params.id)));

app.post('/api/resolve', { config: { rateLimit: { max: 90, timeWindow: '1 minute' } } }, async (req) => {
  const b = z.object({ id: Id, episode: z.string().max(64).optional(), resolution: Resolution.nullish() }).parse(req.body);
  const r = await core.resolve(b.id, b.episode, b.resolution ?? undefined);
  const candidates = (r.candidates || [{ url: r.url, kind: r.kind, headers: r.headers }]).map((candidate) => ({
    kind: candidate.kind,
    stream: mint(candidate.url, candidate.headers),
  }));
  return {
    kind: r.kind,
    stream: candidates[0]?.stream || mint(r.url, r.headers),
    candidates,
    subtitles: (r.subtitles || []).map((s) => ({ lang: s.lang, label: s.label, src: mint(s.url, r.headers) })),
    resolutions: r.resolutions || [],
    selectedResolution: r.selectedResolution,
  };
});

app.get('/api/ad-config', async () => ({
  enabled: Boolean(adConfig.enabled && adConfig.url),
  url: adConfig.enabled ? adConfig.url : '',
  durationSeconds: adConfig.durationSeconds,
}));

app.post('/api/admin/check', async (req, reply) => {
  if (!ADMIN_PASSWORD || req.headers['x-admin-password'] !== ADMIN_PASSWORD) {
    return reply.code(401).send({ error: 'unauthorized', message: 'Owner password required' });
  }
  return { ok: true };
});

app.put('/api/admin/ad', async (req, reply) => {
  if (!ADMIN_PASSWORD || req.headers['x-admin-password'] !== ADMIN_PASSWORD) {
    return reply.code(401).send({ error: 'unauthorized', message: 'Admin password required' });
  }
  const body = z.object({
    enabled: z.boolean().default(true),
    url: z.string().url().startsWith('https://'),
    durationSeconds: z.coerce.number().int().min(1).max(9),
  }).parse(req.body);
  adConfig = body;
  return { enabled: adConfig.enabled, durationSeconds: adConfig.durationSeconds };
});

function upstreamMessage(status) {
  if (status === 401) return 'The source needs a sign-in for this file (HTTP 401). Try another quality or title.';
  if (status === 402) return 'The source is asking for payment or a subscription for this file (HTTP 402). Try another quality or title.';
  if (status === 403) return 'The source refused this request (HTTP 403). The link may be blocked or expired. Try another quality.';
  if (status === 404) return 'The source no longer has this file (HTTP 404). Try another quality or title.';
  if (status === 410) return 'This link expired (HTTP 410). Go back and press Play again.';
  return `The source rejected this request (HTTP ${status}). Try another quality or try again later.`;
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
      r = await fetch(e.url, { headers, signal: AbortSignal.any([ac.signal, AbortSignal.timeout(20000)]), redirect: 'follow' });
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
  if (!r.ok && r.status !== 416) {
    try { await r.body?.cancel(); } catch {}
    return reply.code(r.status).send({ error: 'upstream_rejected', message: upstreamMessage(r.status) });
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

function htmlEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
async function seoIndex({ title, description, pathName = '/', body } = {}) {
  let html = await readFile(path.resolve(here, '../../web/index.html'), 'utf8');
  if (PUBLIC_SITE_URL) html = html.replaceAll('__PUBLIC_SITE_URL__', PUBLIC_SITE_URL);
  else html = html.replace(/<meta property="og:url"[^>]*>\n?|<meta property="og:image"[^>]*>\n?|<meta name="twitter:image"[^>]*>\n?|<link rel="canonical"[^>]*>\n?|<script type="application\/ld\+json">[\s\S]*?<\/script>\n?/g, '');
  if (title) html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${htmlEscape(title)}</title>`);
  if (description) html = html.replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${htmlEscape(description)}">`);
  if (PUBLIC_SITE_URL) html = html.replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${PUBLIC_SITE_URL}${pathName}">`).replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${PUBLIC_SITE_URL}${pathName}">`);
  if (body) html = html.replace(/<main id="app">[\s\S]*?<\/main>/, `<main id="app">${body}</main>`);
  return html;
}

app.get('/', async (_req, reply) => reply.type('text/html').send(await seoIndex()));
app.get('/about', async (_req, reply) => reply.type('text/html').send(await seoIndex({ title: 'About free❤️‍🔥 — Private offline playback and Clip Studio', description: 'Learn how free❤️‍🔥 supports streaming, private offline playback, browser-based clipping, and AI captions.', pathName: '/about', body: '<section class="seo-intro"><span class="eyebrow">About free❤️‍🔥</span><h1>Stories, on your terms.</h1><p>Free❤️‍🔥 is a mobile-friendly streaming PWA with browser-private downloads, subtitles, a VLC-style player, and Clip Studio for short-form edits and AI captions.</p><p><a href="/">Back to search</a></p></section>' })));
app.get('/title/:id', async (req, reply) => {
  try {
    const data = await core.title(Id.parse(req.params.id));
    const title = String(data.title || 'Watch this title');
    const description = String(data.overview || `Watch ${title} online with free❤️‍🔥.`).slice(0, 155);
    const id = encodeURIComponent(req.params.id);
    const body = `<article class="seo-intro"><span class="eyebrow">${htmlEscape(data.type || 'Title')}</span><h1>${htmlEscape(title)}</h1><p>${htmlEscape(description)}</p><p><a href="/#/title/${id}">Open ${htmlEscape(title)} in free❤️‍🔥</a></p></article>`;
    const html = await seoIndex({ title: `${title} — free❤️‍🔥`, description, pathName: `/title/${id}`, body });
    return reply.type('text/html').send(html);
  } catch { return reply.code(404).type('text/html').send(await seoIndex({ title: 'Title not found — free❤️‍🔥', description: 'This title could not be found.', pathName: `/title/${encodeURIComponent(req.params.id)}`, body: '<section class="seo-intro"><h1>Title not found</h1><p>Try another search.</p><p><a href="/">Return to free❤️‍🔥</a></p></section>' })); }
});
app.get('/robots.txt', async (_req, reply) => {
  const sitemap = PUBLIC_SITE_URL ? `\nSitemap: ${PUBLIC_SITE_URL}/sitemap.xml` : '';
  return reply.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin\nDisallow: /downloads${sitemap}\n`);
});
app.get('/sitemap.xml', async (_req, reply) => {
  if (!PUBLIC_SITE_URL) return reply.code(503).type('text/plain').send('Set PUBLIC_SITE_URL before exposing a sitemap to crawlers.');
  const urls = ['/', '/about'];
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${PUBLIC_SITE_URL}${u}</loc><changefreq>${u === '/' ? 'daily' : 'monthly'}</changefreq></url>`).join('')}</urlset>`;
  return reply.type('application/xml').send(xml);
});

await app.register(fastifyStatic, { root: path.resolve(here, '../../web') });

app.server.keepAliveTimeout = 120000;
app.server.headersTimeout = 125000;
const port = Number(process.env.PORT || 3000);
startAutomaticPush();

await app.listen({ port, host: process.env.HOST || '0.0.0.0' });


// Render free tier sleeps after ~15 min idle (cold start = 502). Ping ourselves to stay awake.
if (process.env.RENDER_EXTERNAL_URL) {
  setInterval(() => { fetch(`${process.env.RENDER_EXTERNAL_URL}/api/health`, { signal: AbortSignal.timeout(15000) }).catch(() => {}); }, 10 * 60 * 1000).unref();
}
