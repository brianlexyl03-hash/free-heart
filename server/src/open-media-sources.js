/*
 * Lawful open-media catalog adapters.
 *
 * These adapters only return items with source-level rights metadata and direct
 * media URLs. They do not scrape paywalls, embeds, ads, or access controls.
 */
const UA = 'FreeHeart/1.0 (open-media catalogue; contact owner through site)';
const TTL = 5 * 60 * 1000;
const cache = new Map();
const VIDEO_MIME = /^(video\/|application\/ogg|application\/mp4)/i;

function clean(value, max = 4000) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function cached(key) {
  const hit = cache.get(key);
  return hit && hit.expires > Date.now() ? hit.value : null;
}
function store(key, value) {
  if (cache.size > 250) cache.delete(cache.keys().next().value);
  cache.set(key, { value, expires: Date.now() + TTL });
  return value;
}
async function json(url, init = {}) {
  const response = await fetch(url, { ...init, headers: { accept: 'application/json', 'user-agent': UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Open media source HTTP ${response.status}`);
  return response.json();
}
function pageNumber(page) { return Math.max(1, Math.min(20, Number(page) || 1)); }
function queryText(query) { return String(query || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 100); }
function validHttp(url) { try { const u = new URL(url); return u.protocol === 'https:'; } catch { return false; } }
function ext(url) { try { return new URL(url).pathname.toLowerCase().match(/\.[a-z0-9]{2,5}$/)?.[0] || ''; } catch { return ''; } }
function kind(url) { return /\.m3u8(?:$|\?)/i.test(url) ? 'hls' : 'file'; }
function item(id, title, year, poster, source, rights) {
  return { id: `${source}:${id}`, title: clean(title, 240), year: year ? String(year).slice(0, 4) : null, poster: poster || null, type: 'movie', source, rights: clean(rights, 240) };
}

async function searchCommons(query, page) {
  const q = `${queryText(query)} filetype:video`;
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({ action: 'query', format: 'json', generator: 'search', gsrsearch: q, gsrnamespace: '6', gsrlimit: '20', gsroffset: String((pageNumber(page) - 1) * 20), prop: 'imageinfo', iiprop: 'url|mime|size|mediatype|extmetadata' });
  const data = await json(url);
  return Object.values(data?.query?.pages || {}).map((p) => {
    const info = p.imageinfo?.[0]; const meta = info?.extmetadata || {};
    const mime = String(info?.mime || ''); const license = clean(meta.LicenseShortName?.value || meta.UsageTerms?.value);
    if (!info?.url || !VIDEO_MIME.test(mime) || !/(public domain|creative commons|cc by|cc0)/i.test(license)) return null;
    return item(String(p.pageid), String(p.title || '').replace(/^File:/, ''), meta.DateTimeOriginal?.value, '', 'commons', license);
  }).filter(Boolean);
}
async function commonsTitle(pageid) {
  const data = await json(`https://commons.wikimedia.org/w/api.php?action=query&format=json&pageids=${encodeURIComponent(pageid)}&prop=imageinfo&iiprop=url%7Cmime%7Csize%7Cduration%7Cextmetadata`);
  const p = Object.values(data?.query?.pages || {})[0]; const info = p?.imageinfo?.[0]; const meta = info?.extmetadata || {};
  if (!info?.url || !VIDEO_MIME.test(String(info.mime || '')) || !/(public domain|creative commons|cc by|cc0)/i.test(clean(meta.LicenseShortName?.value || meta.UsageTerms?.value))) throw new Error('Commons item has no approved per-file license');
  return { ...item(String(pageid), String(p.title || '').replace(/^File:/, ''), meta.DateTimeOriginal?.value, '', 'commons', meta.LicenseShortName?.value || meta.UsageTerms?.value), overview: clean(meta.ImageDescription?.value) || null, episodes: [], media: [{ url: info.url.split('?')[0], kind: kind(info.url), headers: { referer: `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title || '')}` } }] };
}

async function searchLoc(query, page) {
  const known = [{ id: '00694131', title: 'May Irwin kiss', year: '1896', media: 'https://tile.loc.gov/storage-services/service/mbrs/ntscrm/00047798/00047798.mp4' }];
  if (pageNumber(page) === 1 && known.some((x) => x.title.toLowerCase().includes(queryText(query).toLowerCase()))) {
    return known.map((x) => item(x.id, x.title, x.year, '', 'loc', 'Library of Congress item; no known restrictions stated in item record'));
  }
  const url = new URL('https://www.loc.gov/search/');
  url.search = new URLSearchParams({ q: queryText(query), fa: 'partof:national screening room', fo: 'json', c: '20', sp: String(pageNumber(page)) });
  const data = await json(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
  return (data?.results || []).map((r) => {
    const id = String(r.id || '').match(/item\/([^/?#]+)/i)?.[1] || String(r.id || '').replace(/\W+/g, '-').slice(-80);
    if (!id || !r.title) return null;
    return item(id, r.title, r.date, r.image_url || r.url, 'loc', 'Item-level rights review required; National Screening Room');
  }).filter(Boolean);
}
async function locTitle(id) {
  const known = { '00694131': { title: 'May Irwin kiss', year: '1896', media: 'https://tile.loc.gov/storage-services/service/mbrs/ntscrm/00047798/00047798.mp4', rights: 'Library of Congress item record states no known restrictions in the vast majority of National Screening Room materials; verify before redistribution.' } };
  if (known[id]) {
    const x = known[id];
    return { ...item(id, x.title, x.year, '', 'loc', x.rights), overview: 'National Screening Room film from the Library of Congress.', episodes: [], media: [{ url: x.media, kind: 'file', headers: { referer: 'https://www.loc.gov/item/00694131/' } }] };
  }
  const data = await json(`https://www.loc.gov/item/${encodeURIComponent(id)}/?fo=json`);
  const rights = clean(data?.rights || data?.notes || data?.description);
  if (/permission|required|copyrighted|restricted/i.test(rights) && !/public domain|no known restrictions|free to use/i.test(rights)) throw new Error('Library of Congress item requires rights review');
  const resources = Array.isArray(data?.resources) ? data.resources : [];
  const video = resources.map((r) => r.video || r.url).find((u) => validHttp(u) && /\.mp4(?:$|\?)/i.test(u));
  if (!video) throw new Error('Library of Congress item has no direct MP4');
  return { ...item(id, data.title, data.date, data.image_url, 'loc', rights || 'National Screening Room; item-level review'), overview: clean(data.description) || null, episodes: [], media: [{ url: video, kind: 'file', headers: { referer: `https://www.loc.gov/item/${encodeURIComponent(id)}/` } }] };
}

async function searchNasa(query, page) {
  const url = new URL('https://images-api.nasa.gov/search');
  url.search = new URLSearchParams({ q: queryText(query), media_type: 'video', page_size: '20', page: String(pageNumber(page)) });
  const data = await json(url);
  return (data?.collection?.items || []).map((r) => { const d = r.data?.[0]; if (!d?.nasa_id || !d.title) return null; const img = r.links?.find((l) => l.render === 'image')?.href || ''; return item(d.nasa_id, d.title, d.date_created, img, 'nasa', 'NASA media; screen each item for third-party rights and endorsement restrictions'); }).filter(Boolean);
}
async function nasaTitle(id) {
  const data = await json(`https://images-api.nasa.gov/asset/${encodeURIComponent(id)}`);
  const files = Array.isArray(data?.collection?.items) ? data.collection.items.map((x) => String(x.href || '').replace(/^http:/i, 'https:')).filter(validHttp) : [];
  const video = files.find((u) => /~(?:orig|medium|small)\.mp4(?:$|\?)/i.test(u)) || files.find((u) => /\.mp4(?:$|\?)/i.test(u));
  if (!video) throw new Error('NASA item has no direct MP4 rendition');
  const search = await searchNasa(id, 1).catch(() => []); const found = search[0] || item(id, id, null, '', 'nasa', 'NASA media; item-level rights screening');
  return { ...found, overview: null, episodes: [], media: [{ url: video, kind: 'file', headers: { referer: 'https://images.nasa.gov' } }] };
}

const BLENDER = [{ id: '1065', title: 'Sintel', year: '2010', poster: '', license: 'Blender Open Movie; verify project CC license before reuse' }];
async function searchBlender(query) {
  if (!/(sintel|blender|open movie|animated film)/i.test(queryText(query))) return [];
  return BLENDER.map((x) => item(x.id, x.title, x.year, x.poster, 'blender', x.license));
}
async function blenderTitle(id) {
  if (!BLENDER.some((x) => x.id === id)) throw new Error('Unknown Blender Open Movie asset');
  const html = await (await fetch(`https://studio.blender.org/projects/api/assets/${encodeURIComponent(id)}/?site_context=featured_artwork`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(12000) })).text();
  const matches = [...html.matchAll(/https:\/\/studio\.blender\.org\/files\/[^"'&<> ]+?\.mp4\?[^"'<> ]+/g)].map((m) => m[0].replace(/&amp;/g, '&'));
  const video = matches.find(validHttp);
  if (!video) throw new Error('Blender asset did not return a current signed MP4');
  const found = BLENDER.find((x) => x.id === id);
  return { ...item(found.id, found.title, found.year, found.poster, 'blender', found.license), overview: 'Official Blender Open Movie asset. Preserve the project attribution and verify its current license before redistribution.', episodes: [], media: [{ url: video, kind: 'file', headers: { referer: 'https://studio.blender.org/' } }] };
}

export function isOpenMediaId(id) { return /^(commons|blender|loc|nasa):[^:]+$/i.test(String(id || '')); }
export async function searchOpenMedia(query, page = 1) {
  const cleanQuery = queryText(query); if (!cleanQuery) return [];
  const key = `search:${cleanQuery.toLowerCase()}:${pageNumber(page)}`; const hit = cached(key); if (hit) return hit;
  const results = await Promise.allSettled([searchCommons(cleanQuery, page), searchLoc(cleanQuery, page), searchNasa(cleanQuery, page), searchBlender(cleanQuery)]);
  const merged = results.flatMap((r) => r.status === 'fulfilled' ? r.value : []);
  const seen = new Set(); return store(key, merged.filter((x) => !seen.has(x.id) && seen.add(x.id)).slice(0, 60));
}
export async function getOpenMediaTitle(id) {
  const [source, value] = String(id).split(':', 2);
  if (!value) throw new Error('Invalid open media id');
  if (source === 'commons') return commonsTitle(value);
  if (source === 'loc') return locTitle(value);
  if (source === 'nasa') return nasaTitle(value);
  if (source === 'blender') return blenderTitle(value);
  throw new Error('Unknown open media source');
}
export async function resolveOpenMedia(id) {
  const title = await getOpenMediaTitle(id);
  return { streams: title.media || [], expectedDurationSeconds: null, title };
}
