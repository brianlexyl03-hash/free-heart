import { z } from 'zod';

export class CoreUnavailable extends Error {
  constructor(msg = 'Media core is not connected') { super(msg); this.name = 'CoreUnavailable'; }
}
export class CoreClientError extends Error {
  constructor(status, kind, msg) { super(msg); this.name = 'CoreClientError'; this.status = status; this.kind = kind; }
}
export class CoreBadResponse extends Error {
  constructor(msg = 'Media core returned an unexpected response') { super(msg); this.name = 'CoreBadResponse'; }
}

const Item = z.object({
  id: z.string(), title: z.string(),
  year: z.union([z.string(), z.number()]).nullish(),
  poster: z.string().url().nullish(), type: z.string().nullish(),
});
const Search = z.object({ results: z.array(Item), page: z.number().optional(), hasMore: z.boolean().optional() });
const Title = Item.extend({
  overview: z.string().nullish(),
  episodes: z.array(z.object({ key: z.string(), label: z.string() })).optional(),
});
const Sub = z.object({ lang: z.string().default(''), label: z.string().default(''), url: z.string().min(1) });
const Resolved = z.object({
  url: z.string().min(1),
  kind: z.enum(['file', 'hls']),
  headers: z.record(z.string()).nullish(),
  subtitles: z.array(z.unknown()).nullish(),
  resolutions: z.array(z.number()).nullish(),
  selectedResolution: z.number().nullish(),
}).transform((r) => ({
  url: r.url,
  kind: r.kind,
  headers: r.headers || {},
  subtitles: (r.subtitles || []).map((x) => Sub.safeParse(x)).filter((x) => x.success).map((x) => x.data),
  resolutions: (r.resolutions || []).filter((n) => Number.isInteger(n) && n > 0),
  selectedResolution: Number.isInteger(r.selectedResolution) && r.selectedResolution > 0 ? r.selectedResolution : undefined,
}));
const Health = z.object({ ok: z.boolean(), core: z.string() });

const BASE = process.env.CORE_URL || 'http://127.0.0.1:7070';
async function call(path, opts = {}) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let r;
    try {
      r = await fetch(BASE + path, { ...opts, signal: AbortSignal.timeout(25000) });
    } catch {
      lastError = new CoreUnavailable('Media core is unreachable');
    }
    if (r?.ok) return r.json().catch(() => { throw new CoreBadResponse(); });
    if (r) {
      if (r.status >= 400 && r.status < 500 && r.status !== 429) {
        const b = await r.json().catch(() => ({}));
        throw new CoreClientError(r.status, b.error || 'core_rejected', b.message || 'Request rejected');
      }
      lastError = new CoreBadResponse(`Media core error ${r.status}`);
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
  }
  throw lastError || new CoreBadResponse();
}
const parse = (schema, v) => {
  const p = schema.safeParse(v);
  if (!p.success) {
    console.error('core schema mismatch:', p.error.issues.map((x) => `${x.path.join('.') || '(root)'}: ${x.message}`).join(' | '));
    throw new CoreBadResponse();
  }
  return p.data;
};

export const core = {
  enabled: () => Boolean(BASE),
  async health() { return parse(Health, await call('/health')); },
  async search(q, page) { return parse(Search, await call(`/search?q=${encodeURIComponent(q)}&page=${page}`)); },
  async title(id) { return parse(Title, await call(`/title/${encodeURIComponent(id)}`)); },
  async resolve(id, episode, resolution) {
    return parse(Resolved, await call('/resolve', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, episode: episode ?? null, resolution: resolution ?? null }),
    }));
  },
};
