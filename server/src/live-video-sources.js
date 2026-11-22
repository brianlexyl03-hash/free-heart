const HTTP = new Set(['http:', 'https:']);
const ID = /^[a-z0-9][a-z0-9._-]{0,49}$/i;
const STATES = new Set(['PLAYABLE_HLS', 'PLAYABLE_IFRAME', 'GEO_BLOCKED', 'STALE', 'DEAD', 'CONFIG_ERROR']);
const DEFAULT_FEEDS = {
  'live-news': [
    { id: 'fr24-en', label: 'France 24 English', url: 'https://www.youtube.com/embed/live_stream?channel=UCQfwfsi5VrQ8yKZ-UWmAEFg', kind: 'iframe', provider: 'France 24', cc: 'FR', rights: 'broadcaster-embed', publicUrl: 'https://www.france24.com/en/live' },
    { id: 'fr24-en-hls', label: 'France 24 English HLS', url: 'https://static.france24.com/live/F24_EN_LO_HLS/live_web.m3u8', kind: 'hls', deriveVariants: true, provider: 'France 24', cc: 'FR', rights: 'broadcaster-direct', publicUrl: 'https://www.france24.com/en/live' },
    { id: 'fr24-fr-hls', label: 'France 24 Français HLS', url: 'https://static.france24.com/live/F24_FR_LO_HLS/live_web.m3u8', kind: 'hls', deriveVariants: true, provider: 'France 24', cc: 'FR', rights: 'broadcaster-direct', publicUrl: 'https://www.france24.com/fr/direct' },
    { id: 'fr24-ar-hls', label: 'France 24 Arabic HLS', url: 'https://static.france24.com/live/F24_AR_LO_HLS/live_web.m3u8', kind: 'hls', deriveVariants: true, provider: 'France 24', cc: 'FR', rights: 'broadcaster-direct', publicUrl: 'https://www.france24.com/ar/live' },
    { id: 'fr24-es-hls', label: 'France 24 Español HLS', url: 'https://static.france24.com/live/F24_ES_LO_HLS/live_web.m3u8', kind: 'hls', deriveVariants: true, provider: 'France 24', cc: 'FR', rights: 'broadcaster-direct', publicUrl: 'https://www.france24.com/es/en-vivo' },
    { id: 'cgtn-doc', label: 'CGTN Documentary', url: 'https://english-livebkali.cgtn.com/live/doccgtn.m3u8', kind: 'hls', provider: 'CGTN', cc: 'CN', rights: 'broadcaster-direct', publicUrl: 'https://www.cgtn.com/tv' },
  ],
  'live-sport': [
    { id: 'redbull', label: 'Red Bull TV', url: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8', kind: 'hls', provider: 'Red Bull TV', cc: 'AT', rights: 'broadcaster-direct', publicUrl: 'https://www.redbull.com/int-en/tv' },
    { id: 'cazetv', label: 'CazéTV', url: 'https://www.youtube.com/embed/live_stream?channel=UCZiTez1uFvyG3LYR4Ur2QDw', kind: 'iframe', provider: 'CazéTV', cc: 'BR', rights: 'broadcaster-embed', publicUrl: 'https://www.youtube.com/@CazeTV' },
  ],
};

function text(value, max = 240) { return String(value ?? '').trim().slice(0, max); }
function publicUrl(value) { try { const url = new URL(String(value || '')); return HTTP.has(url.protocol) ? url.href : ''; } catch { return ''; } }
function slug(value) { return text(value, 50).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'channel'; }
function sourceKind(value) { const kind = String(value || '').toLowerCase(); return ['iframe', 'hls', 'file'].includes(kind) ? kind : ''; }
function stateMessage(state, source) {
  const cc = text(source?.cc || 'provider region', 40);
  return state === 'GEO_BLOCKED' ? `Available in ${cc} only.`
    : state === 'STALE' ? 'Stream URL out of date.'
      : state === 'DEAD' ? 'Stream offline.'
        : state === 'CONFIG_ERROR' ? 'Source misconfigured (missing kind).' : '';
}
function sourceState(source) {
  const url = publicUrl(source?.url);
  const kind = sourceKind(source?.kind);
  if (!url || !kind || source?.authorized !== true) return { state: !kind ? 'CONFIG_ERROR' : 'DEAD', reason: !kind ? 'missing_kind' : !url ? 'invalid_url' : 'unverified_rights' };
  return { state: kind === 'iframe' ? 'PLAYABLE_IFRAME' : null, reason: kind === 'iframe' ? 'official_embed' : 'unprobed' };
}

export function parseLiveChannelSources(raw = process.env.LIVE_CHANNEL_SOURCES_JSON || DEFAULT_FEEDS) {
  let parsed;
  try { parsed = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw; } catch { return []; }
  const channels = Array.isArray(parsed) ? parsed : (() => {
    const grouped = new Map();
    for (const [group, feeds] of Object.entries(parsed || {})) for (const feed of Array.isArray(feeds) ? feeds : []) {
      const id = slug(feed?.provider);
      const channel = grouped.get(id) || { id, name: feed?.provider, sport: group === 'live-sport' ? 'Live sport' : 'Live news', region: feed?.cc, sources: [] };
      channel.sources.push({ ...feed, authorized: feed?.authorized ?? /^broadcaster-/i.test(String(feed?.rights || '')) });
      grouped.set(id, channel);
    }
    return [...grouped.values()];
  })();
  return channels.filter((channel) => ID.test(String(channel?.id || ''))).map((channel) => ({
    id: String(channel.id), name: text(channel.name || channel.id, 100), sport: text(channel.sport || 'Live sports', 80), region: text(channel.region || 'Provider region', 80),
    sources: Array.isArray(channel.sources) ? channel.sources.slice(0, 8).map((source) => {
      const url = publicUrl(source?.url); const verdict = sourceState(source);
      return { id: text(source?.id || source?.label || 'source', 50), label: text(source?.label || 'Authorized source', 80), provider: text(source?.provider || '', 100) || null, kind: sourceKind(source?.kind), deriveVariants: source?.deriveVariants === true, cc: text(source?.cc || channel.region || '', 8) || null, publicUrl: publicUrl(source?.publicUrl), rightsUrl: publicUrl(source?.rightsUrl), url, headers: source?.headers && typeof source.headers === 'object' ? source.headers : {}, authorized: source?.authorized === true, state: verdict.state, reason: verdict.reason, message: stateMessage(verdict.state, source) };
    }) : [],
  }));
}

export async function resolveVariants(masterUrl, { fetchImpl = fetch, now = Date.now } = {}) {
  const cacheBuster = `${masterUrl}${masterUrl.includes('?') ? '&' : '?'}_=${now()}`;
  const response = await fetchImpl(cacheBuster, { headers: { 'cache-control': 'no-cache', referer: 'https://www.google.com/', 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(6000) });
  if (!response.ok) return [];
  const body = await response.text();
  const lines = body.split(/\r?\n/).map((line) => line.trim());
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].startsWith('#EXT-X-STREAM-INF')) continue;
    const uri = lines.slice(i + 1).find((line) => line && !line.startsWith('#'));
    if (!uri) continue;
    out.push({ url: new URL(uri, masterUrl).toString(), bandwidth: Number(lines[i].match(/BANDWIDTH=(\d+)/)?.[1] ?? 0) });
  }
  return out.sort((a, b) => b.bandwidth - a.bandwidth);
}

async function probeVariant(url, { fetchImpl = fetch } = {}) {
  try {
    const response = await fetchImpl(url, { headers: { range: 'bytes=0-2047', 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(6000) });
    if (String(response.headers.get('x-geoblock') || '').toLowerCase() === 'true') return { state: 'GEO_BLOCKED' };
    return response.status >= 200 && response.status < 300 ? { state: 'PLAYABLE_HLS' } : { state: 'STALE' };
  } catch { return { state: 'STALE' }; }
}

async function resolveHlsSource(source, options) {
  const { fetchImpl = fetch } = options;
  if (!source.url) return { ...source, state: 'DEAD', reason: 'invalid_url', message: stateMessage('DEAD', source) };
  try {
    const masterUrl = `${source.url}${source.url.includes('?') ? '&' : '?'}_=${(options.now || Date.now)()}`;
    const response = await fetchImpl(masterUrl, { headers: { 'cache-control': 'no-cache', referer: 'https://www.google.com/', 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(6000) });
    if (String(response.headers.get('x-geoblock') || '').toLowerCase() === 'true') return { ...source, state: 'GEO_BLOCKED', reason: 'geo_blocked', message: stateMessage('GEO_BLOCKED', source), providerUrl: source.publicUrl };
    if (!response.ok) return { ...source, state: 'DEAD', reason: `http_${response.status}`, message: stateMessage('DEAD', source) };
    const body = await response.text();
    const variants = [];
    const lines = body.split(/\r?\n/).map((line) => line.trim());
    for (let i = 0; i < lines.length; i += 1) if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
      const uri = lines.slice(i + 1).find((line) => line && !line.startsWith('#'));
      if (uri) variants.push({ url: new URL(uri, source.url).toString(), bandwidth: Number(lines[i].match(/BANDWIDTH=(\d+)/)?.[1] ?? 0) });
    }
    if (!variants.length && !source.deriveVariants) {
      const result = await probeVariant(source.url, options);
      return { ...source, ...result, stream: result.state === 'PLAYABLE_HLS' ? options.mint(source.url, source.headers) : undefined, message: stateMessage(result.state, source), providerUrl: source.publicUrl };
    }
    for (const variant of variants.sort((a, b) => b.bandwidth - a.bandwidth)) {
      const result = await probeVariant(variant.url, options);
      if (result.state === 'PLAYABLE_HLS') return { ...source, ...result, variantUrl: variant.url, stream: options.mint(variant.url, source.headers), message: '', providerUrl: source.publicUrl };
      if (result.state === 'GEO_BLOCKED') return { ...source, ...result, message: stateMessage(result.state, source), providerUrl: source.publicUrl };
    }
    return { ...source, state: 'STALE', reason: 'variants_unavailable', message: stateMessage('STALE', source), providerUrl: source.publicUrl };
  } catch (error) {
    return { ...source, state: 'DEAD', reason: error?.name === 'TimeoutError' ? 'timeout' : 'fetch_failed', message: stateMessage('DEAD', source), providerUrl: source.publicUrl };
  }
}

export async function getLiveChannelPlayback(channels, id, mint, options = {}) {
  const channel = (channels || []).find((item) => item.id === String(id));
  if (!channel) return { status: 'unavailable', mode: 'none', id: String(id), sources: [], message: 'This channel is not configured.' };
  const resolved = [];
  for (const source of channel.sources) {
    if (source.state === 'CONFIG_ERROR' || source.state === 'DEAD') { resolved.push({ ...source, state: source.state, message: source.message || stateMessage(source.state, source) }); continue; }
    if (source.kind === 'iframe') { resolved.push({ ...source, state: 'PLAYABLE_IFRAME', mode: 'iframe', src: source.url, message: '' }); continue; }
    resolved.push(await resolveHlsSource(source, { ...options, mint }));
  }
  const order = { PLAYABLE_HLS: 0, PLAYABLE_IFRAME: 1, GEO_BLOCKED: 2, STALE: 3, DEAD: 4, CONFIG_ERROR: 5 };
  resolved.sort((a, b) => order[a.state] - order[b.state]);
  const first = resolved.find((source) => source.state === 'PLAYABLE_HLS' || source.state === 'PLAYABLE_IFRAME');
  return { status: first ? 'available' : 'unavailable', mode: first ? (first.mode || 'hls') : 'none', id: channel.id, channel: { name: channel.name, sport: channel.sport, region: channel.region }, sources: resolved.map((source) => ({ id: source.id, label: source.label, provider: source.provider, kind: source.kind, state: source.state, reason: source.reason, message: source.message, cc: source.cc, providerUrl: source.providerUrl || source.publicUrl, stream: source.stream, src: source.src })), message: first ? '' : (resolved[0]?.message || 'No playable authorized source is configured for this channel.') };
}

export function liveChannelDiagnostics(channels) { return Object.fromEntries((channels || []).map((channel) => [channel.id, Object.fromEntries([...STATES].map((state) => [state, channel.sources.filter((source) => source.state === state).length]))])); }
