import { z } from 'zod';

export class CoreUnavailable extends Error {
  constructor(msg = 'Media core is not connected') { super(msg); this.name = 'CoreUnavailable'; }
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
const Resolved = z.object({
  url: z.string().url(),
  kind: z.enum(['file', 'hls']),
  headers: z.record(z.string()).optional(),
  subtitles: z.array(z.object({ lang: z.string(), label: z.string(), url: z.string().url() })).optional(),
  resolutions: z.array(z.number().int().positive()).default([]),
  selectedResolution: z.number().int().positive().optional(),
});
const Health = z.object({ ok: z.boolean(), core: z.string() });

const BASE = process.env.CORE_URL || 'http://127.0.0.1:7070';
async function call(path, opts = {}) {
  let r;
  try { r = await fetch(BASE + path, { ...opts, signal: AbortSignal.timeout(20000) }); }
  catch { throw new CoreUnavailable('Media core is unreachable'); }
  if (!r.ok) throw new CoreBadResponse(`Media core error ${r.status}`);
  return r.json().catch(() => { throw new CoreBadResponse(); });
}
const parse = (schema, v) => { const p = schema.safeParse(v); if (!p.success) throw new CoreBadResponse(); return p.data; };

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
