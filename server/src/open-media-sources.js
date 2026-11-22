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
  const response = await fetch(url, { ...init, headers: { accept: 'application/json', 'user-agent': UA, ...(init.headers || {}) }, signal: init.signal || AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Open media source HTTP ${response.status}`);
  return response.json();
}
function pageNumber(page) { return Math.max(1, Math.min(20, Number(page) || 1)); }
function queryText(query) { return String(query || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 100); }
function validHttp(url) { try { const u = new URL(url); return u.protocol === 'https:'; } catch { return false; } }
function ext(url) { try { return new URL(url).pathname.toLowerCase().match(/\.[a-z0-9]{2,5}$/)?.[0] || ''; } catch { return ''; } }
function kind(url) { return /\.m3u8(?:$|\?)/i.test(url) ? 'hls' : 'file'; }
export function isCommerciallyReusableLicense(value) {
  const license = clean(value, 240).toLowerCase();
  if (!license || /non[- ]?commercial|noncommercial|no[- ]?derivatives|no derivatives|fair use|all rights reserved|permission required|copyrighted|restricted|-(?:nc|nd)\b|\b(?:nc|nd)\b/.test(license)) return false;
  return /public domain|public-domain|cc0|creative commons zero|cc by(?:[- ]?sa)?(?:\b|\s)|creative commons attribution/.test(license);
}
export function rightsPolicy(source) {
  const key = String(source || '').toLowerCase();
  if (key === 'commons') return { status: 'review-required', basis: 'per-file public-domain or compatible free license', sourceUrl: 'https://commons.wikimedia.org/wiki/Commons:Licensing' };
  if (key === 'loc') return { status: 'review-required', basis: 'item-level Library of Congress rights advisory', sourceUrl: 'https://www.loc.gov/collections/national-screening-room/about-this-collection/rights-and-access/' };
  if (key === 'nasa') return { status: 'review-required', basis: 'asset-level NASA credits and third-party rights screening', sourceUrl: 'https://www.nasa.gov/nasa-brand-center/images-and-media/' };
  if (key === 'blender' || key === 'openmovie') return { status: 'review-required', basis: 'project/file license and third-party-content review', sourceUrl: 'https://studio.blender.org/terms-and-conditions/' };
  return { status: 'unknown', basis: 'source rights not classified', sourceUrl: null };
}
export function qualityLabel(width, height) {
  const pixels = Math.max(Number(width) || 0, Number(height) || 0);
  if (pixels >= 3840) return '4K';
  if (pixels >= 2160) return '2160p';
  if (pixels >= 1920) return '1080p';
  if (pixels >= 1280) return '720p';
  if (pixels >= 854) return '480p';
  if (pixels > 0) return `${pixels}p`;
  return 'unknown';
}
function technicalInfo(info = {}) {
  const width = Number(info.width) || 0;
  const height = Number(info.height) || 0;
  const size = Number(info.size) || 0;
  const duration = Number(info.duration) || 0;
  return { label: qualityLabel(width, height), width: width || null, height: height || null, sizeBytes: size || null, durationSeconds: duration || null, mime: clean(info.mime, 80) || null };
}
function item(id, title, year, poster, source, rights, extra = {}) {
  const policy = rightsPolicy(source);
  return { id: `${source}:${id}`, title: clean(title, 240), year: year ? String(year).slice(0, 4) : null, poster: poster || null, type: 'movie', source, rights: clean(rights, 240), rightsStatus: extra.rightsStatus || policy.status, rightsBasis: extra.rightsBasis || policy.basis, rightsUrl: extra.rightsUrl || policy.sourceUrl, canonicalUrl: extra.canonicalUrl || null, attribution: clean(extra.attribution, 500) || null, quality: extra.quality || { label: 'unknown' }, availability: extra.availability || 'source-hosted', ...extra };
}

async function searchCommons(query, page) {
  const q = `${queryText(query)} filetype:video`;
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({ action: 'query', format: 'json', generator: 'search', gsrsearch: q, gsrnamespace: '6', gsrlimit: '20', gsroffset: String((pageNumber(page) - 1) * 20), prop: 'imageinfo', iiprop: 'url|descriptionurl|mime|size|width|height|duration|mediatype|extmetadata' });
  const data = await json(url);
  return Object.values(data?.query?.pages || {}).map((p) => {
    const info = p.imageinfo?.[0]; const meta = info?.extmetadata || {};
    const mime = String(info?.mime || ''); const license = clean(meta.LicenseShortName?.value || meta.UsageTerms?.value);
    if (!info?.url || !VIDEO_MIME.test(mime) || !isCommerciallyReusableLicense(license)) return null;
    return item(String(p.pageid), String(p.title || '').replace(/^File:/, ''), meta.DateTimeOriginal?.value, '', 'commons', license, { canonicalUrl: info.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title || '')}`, rightsUrl: meta.LicenseUrl?.value || 'https://commons.wikimedia.org/wiki/Commons:Licensing', attribution: meta.Attribution?.value || meta.Artist?.value || null, quality: technicalInfo(info) });
  }).filter(Boolean);
}
async function commonsTitle(pageid) {
  const data = await json(`https://commons.wikimedia.org/w/api.php?action=query&format=json&pageids=${encodeURIComponent(pageid)}&prop=imageinfo&iiprop=url%7Cdescriptionurl%7Cmime%7Csize%7Cwidth%7Cheight%7Cduration%7Cextmetadata`);
  const p = Object.values(data?.query?.pages || {})[0]; const info = p?.imageinfo?.[0]; const meta = info?.extmetadata || {};
  if (!info?.url || !VIDEO_MIME.test(String(info.mime || '')) || !isCommerciallyReusableLicense(meta.LicenseShortName?.value || meta.UsageTerms?.value)) throw new Error('Commons item has no approved per-file license');
  return { ...item(String(pageid), String(p.title || '').replace(/^File:/, ''), meta.DateTimeOriginal?.value, '', 'commons', meta.LicenseShortName?.value || meta.UsageTerms?.value, { canonicalUrl: info.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title || '')}`, rightsUrl: meta.LicenseUrl?.value || 'https://commons.wikimedia.org/wiki/Commons:Licensing', attribution: meta.Attribution?.value || meta.Artist?.value || null, quality: technicalInfo(info) }), overview: clean(meta.ImageDescription?.value) || null, episodes: [], media: [{ url: info.url.split('?')[0], kind: kind(info.url), headers: { referer: info.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title || '')}` } }] };
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
    return item(id, r.title, r.date, r.image_url || r.url, 'loc', 'Item-level rights review required; National Screening Room', { canonicalUrl: r.id || `https://www.loc.gov/item/${encodeURIComponent(id)}/`, rightsUrl: 'https://www.loc.gov/collections/national-screening-room/about-this-collection/rights-and-access/', quality: technicalInfo({ width: r.width, height: r.height, duration: r.duration, mime: r.original_format }) });
  }).filter(Boolean);
}
async function locTitle(id) {
  const known = { '00694131': { title: 'May Irwin kiss', year: '1896', media: 'https://tile.loc.gov/storage-services/service/mbrs/ntscrm/00047798/00047798.mp4', rights: 'Library of Congress item record states no known restrictions in the vast majority of National Screening Room materials; verify before redistribution.' } };
  if (known[id]) {
    const x = known[id];
    return { ...item(id, x.title, x.year, '', 'loc', x.rights, { canonicalUrl: 'https://www.loc.gov/item/00694131/', rightsUrl: 'https://www.loc.gov/collections/national-screening-room/about-this-collection/rights-and-access/' }), overview: 'National Screening Room film from the Library of Congress.', episodes: [], media: [{ url: x.media, kind: 'file', headers: { referer: 'https://www.loc.gov/item/00694131/' } }] };
  }
  const data = await json(`https://www.loc.gov/item/${encodeURIComponent(id)}/?fo=json`);
  const record = data?.item && typeof data.item === 'object' ? data.item : data;
  const rights = clean([
    record?.rights,
    record?.rights_advisory,
    record?.restriction,
    record?.access_advisory,
    data?.rights,
    data?.notes,
  ].filter(Boolean).join(' | '));
  if (/permission|required|copyrighted|restricted/i.test(rights) && !/public domain|no known restrictions|free to use/i.test(rights)) throw new Error('Library of Congress item requires rights review');
  const resources = Array.isArray(data?.resources) ? data.resources : [];
  const candidates = resources.flatMap((resource) => [
    resource?.video,
    resource?.video_stream,
    resource?.url,
    ...(Array.isArray(resource?.files) ? resource.files.flatMap((file) => [file?.video, file?.video_stream, file?.url, file?.download, file?.filename]) : []),
  ]).filter((value) => typeof value === 'string');
  const videoStream = candidates.find((u) => validHttp(u) && /\.m3u8(?:$|\?)/i.test(u));
  const video = candidates.find((u) => validHttp(u) && /\.(?:mp4|mov|webm)(?:$|\?)/i.test(u));
  if (!videoStream && !video) throw new Error('Library of Congress item has no documented playable video resource');
  const mediaUrl = videoStream || video;
  return { ...item(id, record?.title || data.title, record?.date || data.date, record?.image_url || data.image_url, 'loc', rights || 'National Screening Room; item-level review', { canonicalUrl: data.id || `https://www.loc.gov/item/${encodeURIComponent(id)}/`, rightsUrl: 'https://www.loc.gov/collections/national-screening-room/about-this-collection/rights-and-access/', quality: technicalInfo({ width: record?.width || data.width, height: record?.height || data.height, duration: record?.duration || data.duration }) }), overview: clean(record?.description || data.description) || null, episodes: [], media: [{ url: mediaUrl, kind: kind(mediaUrl), headers: { referer: `https://www.loc.gov/item/${encodeURIComponent(id)}/` } }] };
}

async function searchNasa(query, page) {
  const url = new URL('https://images-api.nasa.gov/search');
  url.search = new URLSearchParams({ q: queryText(query), media_type: 'video', page_size: '20', page: String(pageNumber(page)) });
  const data = await json(url);
  return (data?.collection?.items || []).map((r) => { const d = r.data?.[0]; if (!d?.nasa_id || !d.title) return null; const img = r.links?.find((l) => l.render === 'image')?.href || ''; return item(d.nasa_id, d.title, d.date_created, img, 'nasa', 'NASA media; screen each item for third-party rights and endorsement restrictions', { canonicalUrl: `https://images.nasa.gov/details/${encodeURIComponent(d.nasa_id)}`, rightsUrl: 'https://www.nasa.gov/nasa-brand-center/images-and-media/' }); }).filter(Boolean);
}
async function nasaTitle(id) {
  const data = await json(`https://images-api.nasa.gov/asset/${encodeURIComponent(id)}`);
  const files = Array.isArray(data?.collection?.items) ? data.collection.items.map((x) => String(x.href || '').replace(/^http:/i, 'https:')).filter(validHttp) : [];
  const video = files.find((u) => /~(?:orig|medium|small)\.mp4(?:$|\?)/i.test(u)) || files.find((u) => /\.mp4(?:$|\?)/i.test(u));
  if (!video) throw new Error('NASA item has no direct MP4 rendition');
  const search = await searchNasa(id, 1).catch(() => []); const found = search[0] || item(id, id, null, '', 'nasa', 'NASA media; item-level rights screening');
  return { ...found, canonicalUrl: `https://images.nasa.gov/details/${encodeURIComponent(id)}`, rightsUrl: 'https://www.nasa.gov/nasa-brand-center/images-and-media/', quality: { label: files.some((u) => /~orig\.mp4(?:$|\?)/i.test(u)) ? 'original' : 'unknown', renditions: files.filter((u) => /\.mp4(?:$|\?)/i.test(u)).map((u) => u.match(/~(orig|large|medium|small)\.mp4/i)?.[1] || 'unknown') }, overview: null, episodes: [], media: [{ url: video, kind: 'file', headers: { referer: 'https://images.nasa.gov' } }] };
}

const BLENDER = [{ id: '1065', title: 'Elephants Dream', year: '2006', poster: '', license: 'CC BY 2.5; preserve the Elephants Dream credit scroll and attribution', licenseUrl: 'https://orange.blender.org/blog/creative-commons-license-2/' }];
const OPEN_MOVIES = [
  ['40108642', 'Big Buck Bunny 4K', '2008', 'Big Buck Bunny 4K.webm'],
  ['77900952', 'Spring', '2019', 'Spring - Blender Open Movie.webm'],
].map(([id, title, year, filename]) => ({ id, title, year, filename, license: 'Blender Open Movie; check the item license and preserve attribution' }));

async function searchOpenMovies(query) {
  const needle = queryText(query).toLowerCase();
  if (!needle || !/(blender|open movie|bunny|caminandes|coffee run|cosmos|elephants dream|glass half|hero|singularity|spring|sprite fright|tears of steel|dweebs|wing it|charge)/i.test(needle)) return [];
  return OPEN_MOVIES.filter((x) => x.title.toLowerCase().split(/\s+/).some((word) => word.length > 2 && needle.includes(word)) || /blender|open movie/i.test(needle))
    .map((x) => item(x.id, x.title, x.year, '', 'openmovie', x.license, { canonicalUrl: 'https://studio.blender.org/films/', rightsUrl: 'https://studio.blender.org/terms-and-conditions/', quality: { label: /4k/i.test(x.title) ? '4K' : 'unknown' } }));
}

async function openMovieTitle(id) {
  const found = OPEN_MOVIES.find((x) => x.id === id);
  if (!found) throw new Error('Unknown Open Movie asset');
  const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(found.filename)}`;
  const title = { ...item(id, found.title, found.year, '', 'openmovie', found.license, { canonicalUrl: 'https://studio.blender.org/films/', rightsUrl: 'https://studio.blender.org/terms-and-conditions/', quality: { label: /4k/i.test(found.title) ? '4K' : 'unknown' } }), overview: 'Official Blender Open Movie file mirrored on Wikimedia Commons. Preserve attribution and verify the item license before redistribution.', episodes: [], media: [{ url, kind: kind(url), headers: {} }] };
  return { ...title, id: `openmovie:${id}`, source: 'openmovie', title: found.title, year: found.year, rights: found.license };
}

async function searchBlender(query) {
  if (!/(elephants dream|blender|open movie|animated film)/i.test(queryText(query))) return [];
  return BLENDER.map((x) => item(x.id, x.title, x.year, x.poster, 'blender', x.license, { canonicalUrl: 'https://studio.blender.org/films/', rightsUrl: x.licenseUrl || 'https://studio.blender.org/terms-and-conditions/' }));
}
async function blenderTitle(id) {
  if (!BLENDER.some((x) => x.id === id)) throw new Error('Unknown Blender Open Movie asset');
  const response = await fetch(`https://studio.blender.org/projects/api/assets/${encodeURIComponent(id)}/?site_context=featured_artwork`, { headers: { accept: 'text/html', 'user-agent': UA }, signal: AbortSignal.timeout(12000) });
  if (!response.ok || !/text\/html/i.test(String(response.headers.get('content-type') || ''))) throw new Error(`Blender asset endpoint returned HTTP ${response.status}`);
  const html = await response.text();
  const matches = [...html.matchAll(/https:\/\/studio\.blender\.org\/files\/[^"'&<> ]+?\.mp4\?[^"'<> ]+/g)].map((m) => m[0].replace(/&amp;/g, '&'));
  const video = matches.find(validHttp);
  if (!video) throw new Error('Blender asset did not return a current signed MP4');
  const found = BLENDER.find((x) => x.id === id);
  return { ...item(found.id, found.title, found.year, found.poster, 'blender', found.license, { canonicalUrl: 'https://studio.blender.org/films/', rightsUrl: found.licenseUrl || 'https://studio.blender.org/terms-and-conditions/', quality: { label: 'unknown' } }), overview: 'Official Blender Open Movie asset. Preserve the project attribution and credit scroll.', episodes: [], media: [{ url: video, kind: 'file', headers: { referer: 'https://studio.blender.org/' } }] };
}

export function isOpenMediaId(id) { return /^(commons|openmovie|blender|loc|nasa):[^:]+$/i.test(String(id || '')); }
export async function searchOpenMedia(query, page = 1) {
  const cleanQuery = queryText(query); if (!cleanQuery) return [];
  const key = `search:${cleanQuery.toLowerCase()}:${pageNumber(page)}`; const hit = cached(key); if (hit) return hit;
  const sourceTimeout = (promise) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Open-media source timed out')), 5500)),
  ]);
  const results = await Promise.allSettled([
    sourceTimeout(searchCommons(cleanQuery, page)),
    sourceTimeout(searchLoc(cleanQuery, page)),
    sourceTimeout(searchNasa(cleanQuery, page)),
    sourceTimeout(searchBlender(cleanQuery)),
    sourceTimeout(searchOpenMovies(cleanQuery)),
  ]);
  const merged = results.flatMap((r) => r.status === 'fulfilled' ? r.value : []);
  const seen = new Set(); return store(key, merged.filter((x) => !seen.has(x.id) && seen.add(x.id)).slice(0, 60));
}
export async function getOpenMediaTitle(id) {
  const [source, value] = String(id).split(':', 2);
  if (!value) throw new Error('Invalid open media id');
  if (source === 'commons') return commonsTitle(value);
  if (source === 'openmovie') return openMovieTitle(value);
  if (source === 'loc') return locTitle(value);
  if (source === 'nasa') return nasaTitle(value);
  if (source === 'blender') return blenderTitle(value);
  throw new Error('Unknown open media source');
}
export async function resolveOpenMedia(id) {
  const title = await getOpenMediaTitle(id);
  return { streams: title.media || [], expectedDurationSeconds: null, title };
}
