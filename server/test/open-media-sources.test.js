import test from 'node:test';
import assert from 'node:assert/strict';
import { getOpenMediaTitle, isOpenMediaId, qualityLabel, rightsPolicy } from '../src/open-media-sources.js';

test('recognizes all lawful open-media source namespaces', () => {
  for (const id of [
    'commons:61604907',
    'openmovie:40108642',
    'blender:1065',
    'loc:00694131',
    'nasa:NDTV000908',
  ]) {
    assert.equal(isOpenMediaId(id), true, id);
  }
});

test('does not route malformed or unsupported provider IDs to open media', () => {
  for (const id of [
    'loc:',
    'loc:one:two',
    'torrent:123',
    'https://example.com/video.mp4',
  ]) {
    assert.equal(isOpenMediaId(id), false, id);
  }
});

test('resolves Blender asset 1065 as Elephants Dream and preserves signed media URLs', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(
    '<html><title>Elephants Dream</title><a href="https://studio.blender.org/files/elephants.mp4?X-Amz-Signature=abc&amp;X-Amz-Expires=3600">video</a></html>',
    { status: 200, headers: { 'content-type': 'text/html' } },
  );
  try {
    const title = await getOpenMediaTitle('blender:1065');
    assert.equal(title.title, 'Elephants Dream');
    assert.equal(title.year, '2006');
    assert.match(title.media[0].url, /elephants\.mp4\?X-Amz-Signature=abc&X-Amz-Expires=3600/);
    assert.equal(title.rightsUrl, 'https://orange.blender.org/blog/creative-commons-license-2/');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('resolves LOC nested item and video_stream fields', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.match(String(url), /loc\.gov\/item\/abc/);
    return new Response(JSON.stringify({
      item: { title: 'Authorized Film', date: '1901', rights_advisory: 'No known restrictions', description: 'Catalog record' },
      resources: [{ video_stream: 'https://tile.loc.gov/media/authorized.mp4' }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const title = await getOpenMediaTitle('loc:abc');
    assert.equal(title.title, 'Authorized Film');
    assert.equal(title.rights, 'No known restrictions');
    assert.equal(title.media[0].url, 'https://tile.loc.gov/media/authorized.mp4');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps rights review explicit for every catalog source', () => {
  for (const source of ['commons', 'loc', 'nasa', 'blender', 'openmovie']) {
    const policy = rightsPolicy(source);
    assert.equal(policy.status, 'review-required', source);
    assert.ok(policy.basis.length > 10, source);
    assert.match(policy.sourceUrl, /^https:\/\//, source);
  }
});

test('maps source dimensions to conservative quality labels', () => {
  assert.equal(qualityLabel(3840, 2160), '4K');
  assert.equal(qualityLabel(1920, 1080), '1080p');
  assert.equal(qualityLabel(1280, 720), '720p');
  assert.equal(qualityLabel(0, 0), 'unknown');
});
