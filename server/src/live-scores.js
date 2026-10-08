// Cached, rate-friendly proxy for ESPN's public soccer scoreboard.
// One browser request returns many leagues, so a refresh costs the client 1 call (not 20+) and ESPN sees at most
// one upstream call per league per ~15 s no matter how many people are watching.
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const LEAGUE = /^[a-z0-9._-]{2,40}$/;
const DATES = /^\d{8}(-\d{8})?$/;
const cache = new Map();     // key -> { t, body }
const inflight = new Map();  // key -> Promise<body>

const ymd = (d) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
function isRecent(dates, now = new Date()) {
  const lo = ymd(new Date(now.getTime() - 2 * 86400000)), hi = ymd(new Date(now.getTime() + 2 * 86400000));
  return dates.split('-').some((d) => d >= lo && d <= hi);
}

export async function fetchScoreboard(league, dates, { fetchImpl = fetch, now = Date.now } = {}) {
  const key = `${league}|${dates}`;
  const ttl = isRecent(dates, new Date(now())) ? 15000 : 300000;
  const hit = cache.get(key);
  if (hit && now() - hit.t < ttl) return { body: hit.body, stale: false };
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    try {
      const res = await fetchImpl(`${ESPN}/${encodeURIComponent(league)}/scoreboard?dates=${dates}&limit=300`, {
        headers: { accept: 'application/json', 'user-agent': 'free-live/1.0' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw Object.assign(new Error(`ESPN HTTP ${res.status}`), { status: res.status });
      const body = await res.json();
      cache.set(key, { t: now(), body });
      if (cache.size > 600) cache.delete(cache.keys().next().value);
      return { body, stale: false };
    } catch (e) {
      if (hit && now() - hit.t < 30 * 60 * 1000) return { body: hit.body, stale: true }; // serve the last good answer for up to 30 min
      throw e;
    } finally { inflight.delete(key); }
  })();
  inflight.set(key, p);
  return p;
}

async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const n = i; i += 1; out[n] = await fn(items[n]); }
  }));
  return out;
}

export function registerLiveScores(app, opts = {}) {
  app.get('/api/live/scoreboards', { config: { rateLimit: { max: 240, timeWindow: '1 minute' } } }, async (req, reply) => {
    const dates = String(req.query?.dates || '');
    const leagues = String(req.query?.leagues || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!DATES.test(dates) || !leagues.length || leagues.length > 40 || !leagues.every((l) => LEAGUE.test(l))) {
      return reply.code(400).send({ error: 'bad_request', message: 'Invalid leagues or dates' });
    }
    const results = {}, errors = {};
    let stale = false;
    await pool(leagues, 6, async (l) => {
      try { const r = await fetchScoreboard(l, dates, opts); results[l] = r.body; stale = stale || r.stale; }
      catch (e) { errors[l] = e.status ? `HTTP ${e.status}` : (e.name === 'TimeoutError' ? 'timeout' : 'unreachable'); }
    });
    if (!Object.keys(results).length) return reply.code(502).send({ error: 'upstream_failed', message: 'The score provider is not answering right now.', errors });
    reply.header('cache-control', 'public, max-age=5');
    return { results, errors, stale, generatedAt: Date.now() };
  });
}
