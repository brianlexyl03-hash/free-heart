import test from 'node:test';
import assert from 'node:assert/strict';
import { isOpenMediaId } from '../src/open-media-sources.js';

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
