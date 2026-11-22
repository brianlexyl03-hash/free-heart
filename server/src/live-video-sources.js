const HTTP = new Set(['http:', 'https:']);
const ID = /^[a-z0-9][a-z0-9._-]{0,49}$/i;
const DEFAULT_FEEDS = {
  'live-news': [
    { id: 'fr24-en', label: 'France 24 English', url: 'https://www.youtube.com/embed/live_stream?channel=UCQfwfsi5VrQ8yKZ-UWmAEFg', kind: 'iframe', provider: 'France 24', cc: 'FR', rights: 'broadcaster-embed' },
    { id: 'fr24-en-hls', label: 'France 24 English HLS', url: 'https://static.france24.com/live/F24_EN_LO_HLS/live_web.m3u8', kind: 'hls', provider: 'France 24', cc: 'FR', rights: 'broadcaster-direct' },
    { id: 'fr24-fr-hls', label: 'France 24 Français HLS', url: 'https://static.france24.com/live/F24_FR_LO_HLS/live_web.m3u8', kind: 'hls', provider: 'France 24', cc: 'FR', rights: 'broadcaster-direct' },
    { id: 'fr24-ar-hls', label: 'France 24 Arabic HLS', url: 'https://static.france24.com/live/F24_AR_LO_HLS/live_web.m3u8', kind: 'hls', provider: 'France 24', cc: 'FR', rights: 'broadcaster-direct' },
    { id: 'fr24-es-hls', label: 'France 24 Español HLS', url: 'https://static.france24.com/live/F24_ES_LO_HLS/live_web.m3u8', kind: 'hls', provider: 'France 24', cc: 'FR', rights: 'broadcaster-direct' },
    { id: 'cgtn-doc', label: 'CGTN Documentary', url: 'https://english-livebkali.cgtn.com/live/doccgtn.m3u8', kind: 'hls', provider: 'CGTN', cc: 'CN', rights: 'broadcaster-direct' },
  ],
  'live-sport': [
    { url: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8', kind: 'hls', provider: 'Red Bull TV', cc: 'AT', rights: 'broadcaster-direct' },
    { url: 'https://www.youtube.com/embed/live_stream?channel=UCZiTez1uFvyG3LYR4Ur2QDw', kind: 'iframe', provider: 'CazéTV', cc: 'BR', rights: 'broadcaster-embed' },
  ],
};

function text(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function publicUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return HTTP.has(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function sourceKind(value, url) {
  const kind = String(value || '').toLowerCase();
  if (kind === 'iframe' || kind === 'hls' || kind === 'file') return kind;
  return /\.m3u8(?:$|\?)/i.test(url) ? 'hls' : 'file';
}

function slug(value) {
  return text(value, 50).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'channel';
}

function sourceVerdict(source) {
  const url = publicUrl(source?.url);
  if (!url) return { status: 'invalid', reason: 'Source URL must be HTTP or HTTPS.' };
  if (source?.authorized !== true) return { status: 'unverified', reason: 'The source is not explicitly marked as an authorized broadcaster or rights-holder feed.' };
  return { status: 'configured', reason: 'Authorized source configured; playback is available when the provider responds.' };
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
    id: String(channel.id),
    name: text(channel.name || channel.id, 100),
    sport: text(channel.sport || 'Live sports', 80),
    region: text(channel.region || 'Provider region', 80),
    sources: Array.isArray(channel.sources) ? channel.sources.slice(0, 8).map((source) => {
      const verdict = sourceVerdict(source);
      return {
        id: text(source?.id || source?.label || 'source', 50),
        label: text(source?.label || 'Authorized source', 80),
        provider: text(source?.provider || '', 100) || null,
        kind: sourceKind(source?.kind, publicUrl(source?.url)),
        rightsUrl: publicUrl(source?.rightsUrl) || null,
        url: publicUrl(source?.url),
        headers: source?.headers && typeof source.headers === 'object' ? source.headers : {},
        status: verdict.status,
        reason: verdict.reason,
      };
    }) : [],
  }));
}

export function getLiveChannelPlayback(channels, id, mint) {
  const channel = (channels || []).find((item) => item.id === String(id));
  if (!channel) return { status: 'unavailable', id: String(id), sources: [], message: 'This channel is not configured.' };
  const sources = channel.sources.filter((source) => source.status === 'configured' && source.url && source.kind !== 'iframe').map((source) => ({
    id: source.id,
    label: source.label,
    provider: source.provider,
    kind: source.kind,
    rightsUrl: source.rightsUrl,
    stream: mint(source.url, source.headers),
  }));
  if (!sources.length) return { status: 'unavailable', id: channel.id, channel: { name: channel.name, sport: channel.sport, region: channel.region }, sources: [], message: 'No authorized playback source is configured for this channel.' };
  return { status: 'available', id: channel.id, channel: { name: channel.name, sport: channel.sport, region: channel.region }, sources };
}

export function liveChannelDiagnostics(channels) {
  return Object.fromEntries((channels || []).map((channel) => [channel.id, {
    configured: channel.sources.filter((source) => source.status === 'configured').length,
    unverified: channel.sources.filter((source) => source.status === 'unverified').length,
    invalid: channel.sources.filter((source) => source.status === 'invalid').length,
  }]));
}
