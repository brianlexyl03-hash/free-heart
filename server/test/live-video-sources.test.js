import test from 'node:test';
import assert from 'node:assert/strict';
import { getLiveChannelPlayback, liveChannelDiagnostics, parseLiveChannelSources, resolveVariants } from '../src/live-video-sources.js';

const mint = (url) => `/api/stream/token-${Buffer.from(url).toString('base64url').slice(0, 12)}`;
const response = (body, status = 200, headers = { 'content-type': 'application/vnd.apple.mpegurl' }) => new Response(body, { status, headers });
const master = (variants) => `#EXTM3U\n${variants.map(({ url, bandwidth }) => `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth}\n${url}`).join('\n')}`;

function source(url, extra = {}) { return { id: extra.id || 'source', label: extra.label || 'Official source', provider: extra.provider || 'Example', authorized: true, kind: extra.kind || 'hls', ...extra, url }; }

test('rejects sources missing kind as CONFIG_ERROR', () => {
  const channels = parseLiveChannelSources([{ id: 'club', sources: [{ url: 'https://example.test/live.m3u8', authorized: true }] }]);
  assert.equal(channels[0].sources[0].state, 'CONFIG_ERROR');
  assert.equal(channels[0].sources[0].reason, 'missing_kind');
});

test('resolves one live variant among dead variants and cache-busts the master', async () => {
  const seen = [];
  const channels = parseLiveChannelSources([{ id: 'club', sources: [source('https://master.test/live.m3u8', { deriveVariants: true })] }]);
  const fetchImpl = async (url, init = {}) => {
    seen.push({ url: String(url), init });
    if (String(url).startsWith('https://master.test')) return response(master([{ url: 'dead.m3u8', bandwidth: 3000 }, { url: 'live.m3u8', bandwidth: 1000 }]));
    if (String(url).includes('dead.m3u8')) return response('', 404);
    return response('', 206, { 'content-type': 'application/octet-stream' });
  };
  const result = await getLiveChannelPlayback(channels, 'club', mint, { fetchImpl, now: () => 12345 });
  assert.equal(result.status, 'available');
  assert.equal(result.sources[0].state, 'PLAYABLE_HLS');
  assert.match(result.sources[0].stream, /^\/api\/stream\//);
  assert.match(seen[0].url, /_=[0-9]+/);
  assert.equal(seen[0].init.headers['cache-control'], 'no-cache');
});

test('marks a master STALE when every freshly derived variant fails', async () => {
  const channels = parseLiveChannelSources([{ id: 'club', sources: [source('https://master.test/live.m3u8', { deriveVariants: true })] }]);
  const fetchImpl = async (url) => String(url).includes('/live.m3u8') ? response(master([{ url: 'dead.m3u8', bandwidth: 1000 }])) : response('', 404);
  const result = await getLiveChannelPlayback(channels, 'club', mint, { fetchImpl });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.sources[0].state, 'STALE');
  assert.match(result.sources[0].message, /out of date/i);
});

test('reports GEO_BLOCKED without dropping the source', async () => {
  const channels = parseLiveChannelSources([{ id: 'club', sources: [source('https://geo.test/live.m3u8', { cc: 'AT', publicUrl: 'https://provider.test/live' })] }]);
  const fetchImpl = async () => response('', 200, { 'x-geoblock': 'true' });
  const result = await getLiveChannelPlayback(channels, 'club', mint, { fetchImpl });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.sources[0].state, 'GEO_BLOCKED');
  assert.equal(result.sources[0].cc, 'AT');
  assert.equal(result.sources[0].providerUrl, 'https://provider.test/live');
});

test('renders iframe sources as PLAYABLE_IFRAME without proxying them', async () => {
  const channels = parseLiveChannelSources([{ id: 'club', sources: [source('https://www.youtube.com/embed/live_stream?channel=x', { kind: 'iframe' })] }]);
  const result = await getLiveChannelPlayback(channels, 'club', mint);
  assert.equal(result.mode, 'iframe');
  assert.equal(result.sources[0].state, 'PLAYABLE_IFRAME');
  assert.equal(result.sources[0].src.startsWith('/api/stream/'), false);
});

test('supports mixed-mode failover from HLS to iframe', async () => {
  const channels = parseLiveChannelSources([{ id: 'club', sources: [
    source('https://master.test/live.m3u8', { id: 'hls', deriveVariants: true }),
    source('https://www.youtube.com/embed/live_stream?channel=x', { id: 'embed', kind: 'iframe' }),
  ] }]);
  const result = await getLiveChannelPlayback(channels, 'club', mint, { fetchImpl: async (url) => String(url).includes('/live.m3u8') ? response(master([{ url: 'dead.m3u8', bandwidth: 1000 }])) : response('', 404) });
  assert.equal(result.sources[0].state, 'PLAYABLE_IFRAME');
  assert.equal(result.sources[1].state, 'STALE');
  assert.equal(result.mode, 'iframe');
});

test('CGTN remains configured as an HLS source', () => {
  const cgtn = parseLiveChannelSources().find((channel) => channel.id === 'cgtn');
  assert.equal(cgtn.sources[0].kind, 'hls');
  assert.equal(cgtn.sources[0].state, null);
});

test('diagnostics use the exact state vocabulary', () => {
  const channels = parseLiveChannelSources([{ id: 'club', sources: [
    source('https://example.test/a.m3u8'),
    source('https://youtube.test/embed/x', { kind: 'iframe' }),
    { url: 'https://bad.test/x', authorized: true },
  ] }]);
  const values = liveChannelDiagnostics(channels).club;
  assert.deepEqual(Object.keys(values).sort(), ['CONFIG_ERROR', 'DEAD', 'GEO_BLOCKED', 'PLAYABLE_HLS', 'PLAYABLE_IFRAME', 'STALE'].sort());
  assert.equal(values.PLAYABLE_IFRAME, 1);
});

test('resolveVariants returns bandwidth-sorted absolute URLs', async () => {
  let requested;
  const variants = await resolveVariants('https://master.test/live.m3u8', { now: () => 9, fetchImpl: async (url) => { requested = url; return response(master([{ url: 'low.m3u8', bandwidth: 100 }, { url: 'high.m3u8', bandwidth: 500 }])); } });
  assert.match(requested, /\?_\=9$/);
  assert.equal(variants[0].bandwidth, 500);
  assert.equal(variants[0].url, 'https://master.test/high.m3u8');
});
