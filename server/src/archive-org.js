/**
 * Internet Archive movie catalogue and direct-file resolver.
 *
 * Only public Archive.org metadata and downloadable video files are returned.
 * No account cookies, paywall bypass, iframe scraping, or third-party embeds.
 */
const API = 'https://archive.org';
const CACHE_TTL = 5 * 60 * 1000;
const cache = new Map();
const VIDEO_EXTENSIONS = new Set(['.mp4', '.m4v', '.webm', '.ogv', '.ogg', '.mov', '.avi', '.mkv', '.mpg', '.mpeg', '.ts', '.m3u8']);

function validIdentifier(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9._-]{1,120}$/.test(value);
}

function descriptionText(value) {
  if (Array.isArray(value)) return value.map(descriptionText).filter(Boolean).join(' ').slice(0, 4000);
  if (typeof value !== 'string') return '';
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000);
}

function poster(identifier) {
  return `${API}/services/img/${encodeURIComponent(identifier)}`;
}

function archiveMetadata(meta = {}) {
  const rights = descriptionText(meta.rights || meta.license || '') || null;
  const creator = descriptionText(meta.creator || meta.contributor || '') || null;
  const canonicalUrl = `${API}/details/${encodeURIComponent(String(meta.identifier || ''))}`;
  return {
    rights: rights || 'Internet Archive item-level rights/license review required; verify before redistribution.',
    rightsStatus: 'review-required',
    rightsBasis: 'item-level Internet Archive metadata; uploader rights are not independently verified',
    rightsUrl: canonicalUrl,
    canonicalUrl,
    attribution: creator,
    quality: { label: 'unknown' },
    availability: 'source-hosted',
  };
}

export function mapArchiveDoc(doc) {
  if (!doc || !validIdentifier(doc.identifier) || !String(doc.title || '').trim()) return null;
  const metadata = archiveMetadata({ ...doc, identifier: doc.identifier });
  return {
    id: `archive:${doc.identifier}`,
    title: String(doc.title).trim().slice(0, 240),
    year: doc.year == null ? null : String(doc.year).slice(0, 4),
    poster: poster(doc.identifier),
    type: 'movie',
    ...metadata,
  };
}

async function getJson(url, fetcher = fetch) {
  const response = await fetcher(url, {
    headers: { accept: 'application/json', 'user-agent': 'FreeHeart/1.0 (Internet Archive catalogue)' },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Internet Archive returned HTTP ${response.status}`);
  return response.json();
}

function cached(key) {
  const item = cache.get(key);
  if (!item || item.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return item.value;
}

function store(key, value) {
  if (cache.size > 300) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL });
  return value;
}

export async function searchArchive(query, page = 1, fetcher = fetch) {
  const clean = String(query || '').trim().replace(/[\u0000-\u001f]/g, '').slice(0, 100);
  const phrase = clean.replace(/[^a-z0-9\s'-]/gi, ' ').replace(/\s+/g, ' ').trim();
  if (!phrase) return [];
  const safePage = Math.max(1, Math.min(50, Number(page) || 1));
  const key = `search:${clean.toLowerCase()}:${safePage}`;
  const hit = cached(key);
  if (hit) return hit;

  const params = new URLSearchParams();
  params.set('q', `mediatype:movies AND title:("${phrase}")`);
  for (const field of ['identifier', 'title', 'year', 'description']) params.append('fl[]', field);
  params.set('rows', '20');
  params.set('page', String(safePage));
  params.set('output', 'json');

  const data = await getJson(`${API}/advancedsearch.php?${params}`, fetcher);
  const docs = Array.isArray(data?.response?.docs) ? data.response.docs : [];
  return store(key, docs.map(mapArchiveDoc).filter(Boolean));
}

export async function getArchiveTitle(identifier, fetcher = fetch) {
  if (!validIdentifier(identifier)) throw new Error('Invalid Internet Archive identifier');
  const key = `title:${identifier}`;
  const hit = cached(key);
  if (hit) return hit;
  const data = await getJson(`${API}/metadata/${encodeURIComponent(identifier)}`, fetcher);
  const meta = data?.metadata || {};
  if (!meta.title) throw new Error('Internet Archive item was not found');
  const metadata = archiveMetadata({ ...meta, identifier });
  return store(key, {
    id: `archive:${identifier}`,
    title: String(meta.title).slice(0, 240),
    year: meta.year == null ? null : String(meta.year).slice(0, 4),
    poster: poster(identifier),
    type: 'movie',
    overview: descriptionText(meta.description) || null,
    episodes: [],
    ...metadata,
  });
}

function extension(name) {
  const match = String(name || '').toLowerCase().match(/\.[a-z0-9]{2,5}$/);
  return match ? match[0] : '';
}

function qualityRank(name) {
  const match = String(name || '').match(/(?:^|[^0-9])(2160|1440|1080|720|576|480|360)p(?:[^0-9]|$)/i);
  return match ? Number(match[1]) : 0;
}

function formatRank(name) {
  const value = extension(name);
  return value === '.mp4' ? 5 : value === '.webm' ? 4 : value === '.ogv' || value === '.ogg' ? 3 : value === '.m4v' ? 2 : value === '.mov' ? 1 : 0;
}

export function selectArchiveVideoFiles(files) {
  if (!Array.isArray(files)) return [];
  return files
    .filter((file) => {
      if (!file || typeof file.name !== 'string' || ['true', '1'].includes(String(file.private).toLowerCase())) return false;
      if (file.format && /metadata|text|thumbnail|image|torrent|archive bit torrent/i.test(String(file.format))) return false;
      if (file.source === 'derivative' && !/(video|h\.264|mpeg|quicktime|webm|ogg|avc)/i.test(String(file.format || ''))) return false;
      return VIDEO_EXTENSIONS.has(extension(file.name)) && !file.name.includes('../');
    })
    .sort((a, b) => {
      const source = Number(b.source === 'original') - Number(a.source === 'original');
      return source || qualityRank(b.name) - qualityRank(a.name) || formatRank(b.name) - formatRank(a.name) || Number(b.size || 0) - Number(a.size || 0);
    })
    .slice(0, 12);
}

export async function resolveArchive(identifier, fetcher = fetch) {
  if (!validIdentifier(identifier)) throw new Error('Invalid Internet Archive identifier');
  const data = await getJson(`${API}/metadata/${encodeURIComponent(identifier)}`, fetcher);
  const files = selectArchiveVideoFiles(data?.files);
  const streams = files.map((file) => {
    const path = file.name.split('/').map(encodeURIComponent).join('/');
    return {
      url: `${API}/download/${encodeURIComponent(identifier)}/${path}`,
      kind: extension(file.name) === '.m3u8' ? 'hls' : 'file',
      headers: { referer: `${API}/details/${encodeURIComponent(identifier)}` },
      quality: qualityRank(file.name) || null,
      title: file.name,
    };
  });
  const runtime = Number(data?.metadata?.runtime);
  return {
    streams,
    expectedDurationSeconds: Number.isFinite(runtime) && runtime > 0 ? Math.round(runtime) : null,
  };
}
