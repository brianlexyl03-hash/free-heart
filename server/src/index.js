import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { z, ZodError } from 'zod';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { core, CoreUnavailable, CoreBadResponse } from './core.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = Fastify({
  trustProxy: true,
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
app.addHook('onSend', async (_req, reply) => {
  reply.header('x-content-type-options', 'nosniff');
  reply.header('referrer-policy', 'no-referrer');
});

app.setErrorHandler((err, req, reply) => {
  if (err instanceof ZodError) return reply.code(400).send({ error: 'bad_request', message: 'Invalid input' });
  if (err instanceof CoreUnavailable) return reply.code(503).send({ error: 'core_unavailable', message: err.message });
  if (err instanceof CoreBadResponse) return reply.code(502).send({ error: 'core_bad_response', message: err.message });
  if (err.statusCode === 429) return reply.code(429).send({ error: 'rate_limited', message: 'Too many requests' });
  req.log.error({ name: err.name }, 'unhandled');
  return reply.code(500).send({ error: 'internal', message: 'Something went wrong' });
});

const Id = z.string().regex(/^[\w.:-]{1,96}$/);
const Resolution = z.coerce.number().int().min(144).max(4320);

// short-lived opaque tokens: real media URLs never reach the client or logs
const tokens = new Map();
const TTL = 10 * 60 * 1000;
setInterval(() => { const n = Date.now(); for (const [k, v] of tokens) if (v.exp < n) tokens.delete(k); }, 60000).unref();
// Provider signing headers stay in the server-side token record; none are returned to the browser.
const ALLOWED_HDRS = new Set(['referer', 'user-agent', 'cookie']);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const UPSTREAM_REPO = 'mesamirh/MovieBox-TUI';
const UPSTREAM_COMMIT = process.env.UPSTREAM_COMMIT || '';
const SOCIAL_WHATSAPP_URL = process.env.SOCIAL_WHATSAPP_URL || '';
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

app.get('/api/title/:id', async (req) => core.title(Id.parse(req.params.id)));

app.post('/api/resolve', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
  const b = z.object({ id: Id, episode: z.string().max(64).optional(), resolution: Resolution.nullish() }).parse(req.body);
  const r = await core.resolve(b.id, b.episode, b.resolution ?? undefined);
  return {
    kind: r.kind,
    stream: mint(r.url, r.headers),
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

app.get('/api/stream/:token', async (req, reply) => {
  const { token } = z.object({ token: z.string().regex(/^[\w-]{20,40}$/) }).parse(req.params);
  const e = tokens.get(token);
  if (!e || e.exp < Date.now()) return reply.code(404).send({ error: 'expired', message: 'Stream link expired' });
  const ac = new AbortController();
  req.raw.on('close', () => ac.abort());
  const timer = setTimeout(() => ac.abort(), 30000);
  const headers = { ...e.headers };
  if (req.headers.range) headers.range = String(req.headers.range);
  let r;
  try { r = await fetch(e.url, { headers, signal: ac.signal, redirect: 'follow' }); }
  catch { return reply.code(502).send({ error: 'upstream_failed', message: 'The source could not be reached. Try another quality or try again later.' }); }
  finally { clearTimeout(timer); }
  reply.code(r.status);
  if (!r.ok) {
    return reply.send({ error: 'upstream_rejected', message: `The source rejected this request (HTTP ${r.status}). Try another quality or try again later.` });
  }
  for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
    const v = r.headers.get(h); if (v) reply.header(h, v);
  }
  reply.header('cache-control', 'no-store');
  return reply.send(Readable.fromWeb(r.body));
});

await app.register(fastifyStatic, { root: path.resolve(here, '../../web') });

const port = Number(process.env.PORT || 3000);
await app.listen({ port, host: process.env.HOST || '0.0.0.0' });
