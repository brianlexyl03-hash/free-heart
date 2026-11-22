import test from 'node:test';
import assert from 'node:assert/strict';
import { getLiveChannelPlayback, liveChannelDiagnostics, parseLiveChannelSources } from '../src/live-video-sources.js';

test('parses only explicitly authorized public playback sources', () => {
  const channels = parseLiveChannelSources(JSON.stringify([{ id: 'premier-league', name: 'League feed', sources: [
    { id: 'official', label: 'Official broadcaster', provider: 'Example Sports', authorized: true, url: 'https://video.example.test/live.m3u8', rightsUrl: 'https://example.test/rights' },
    { id: 'unknown', label: 'Unverified mirror', url: 'https://mirror.example.test/live.m3u8' },
    { id: 'bad', authorized: true, url: 'ftp://example.test/live.m3u8' },
  ] }]));
  assert.equal(channels.length, 1);
  assert.equal(channels[0].sources[0].status, 'configured');
  assert.equal(channels[0].sources[1].status, 'unverified');
  assert.equal(channels[0].sources[2].status, 'invalid');
});

test('returns only opaque minted URLs for authorized sources', () => {
  const channels = parseLiveChannelSources([{ id: 'club', sources: [{ id: 'one', authorized: true, url: 'https://video.example.test/live.m3u8' }] }]);
  const result = getLiveChannelPlayback(channels, 'club', (url) => `/api/stream/token-${url.length}`);
  assert.equal(result.status, 'available');
  assert.equal(result.sources[0].stream.startsWith('/api/stream/token-'), true);
  assert.equal(result.sources[0].url, undefined);
});

test('reports an explicit unavailable state when no authorized source exists', () => {
  const channels = parseLiveChannelSources([{ id: 'club', sources: [{ authorized: false, url: 'https://mirror.example.test/live.m3u8' }] }]);
  const result = getLiveChannelPlayback(channels, 'club', () => '/api/stream/never');
  assert.equal(result.status, 'unavailable');
  assert.match(result.message, /No authorized playback source/);
});

test('exposes source diagnostics without exposing origin URLs', () => {
  const channels = parseLiveChannelSources([{ id: 'club', sources: [
    { authorized: true, url: 'https://video.example.test/live.m3u8' },
    { authorized: false, url: 'https://mirror.example.test/live.m3u8' },
  ] }]);
  assert.deepEqual(liveChannelDiagnostics(channels), { club: { configured: 1, unverified: 1, invalid: 0 } });
  assert.equal(JSON.stringify(liveChannelDiagnostics(channels)).includes('example.test/live'), false);
});

test('groups supplied broadcaster feeds and keeps iframe embeds out of native playback', () => {
  const channels = parseLiveChannelSources({
    'live-news': [
      { url: 'https://www.youtube.com/embed/live_stream?channel=news', kind: 'iframe', provider: 'France 24', cc: 'FR', rights: 'broadcaster-embed' },
      { url: 'https://video.example.test/france24.m3u8', kind: 'hls', provider: 'France 24', cc: 'FR', rights: 'broadcaster-direct' },
    ],
    'live-sport': [
      { url: 'https://video.example.test/redbull.m3u8', kind: 'hls', provider: 'Red Bull TV', cc: 'AT', rights: 'broadcaster-direct' },
    ],
  });
  assert.equal(channels.length, 2);
  assert.equal(channels.find((x) => x.id === 'france-24').sources.length, 2);
  const playback = getLiveChannelPlayback(channels, 'france-24', (url) => `/api/stream/${url.length}`);
  assert.equal(playback.status, 'available');
  assert.deepEqual(playback.sources.map((x) => x.kind), ['hls']);
});
