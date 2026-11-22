const HTTP = new Set(['http:', 'https:']);
const ID = /^[a-z0-9][a-z0-9._-]{0,49}$/i;

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

function sourceVerdict(source) {
  const url = publicUrl(source?.url);
  if (!url) return { status: 'invalid', reason: 'Source URL must be HTTP or HTTPS.' };
  if (source?.authorized !== true) return { status: 'unverified', reason: 'The source is not explicitly marked as an authorized broadcaster or rights-holder feed.' };
  return { status: 'configured', reason: 'Authorized source configured; playback is available when the provider responds.' };
}

export function parseLiveChannelSources(raw = process.env.LIVE_CHANNEL_SOURCES_JSON || '[]') {
  let parsed;
  try { parsed = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw; } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((channel) => ID.test(String(channel?.id || ''))).map((channel) => ({
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
  const sources = channel.sources.filter((source) => source.status === 'configured' && source.url).map((source) => ({
    id: source.id,
    label: source.label,
    provider: source.provider,
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
