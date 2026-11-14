import test from 'node:test';
import assert from 'node:assert/strict';
import { mapArchiveDoc, selectArchiveVideoFiles, searchArchive, getArchiveTitle, resolveArchive } from '../src/archive-org.js';

test('maps archive movie documents to Free Heart movie cards', () => {
  assert.deepEqual(mapArchiveDoc({ identifier: 'sample_film', title: 'Sample Film', year: 1931 }), {
    id: 'archive:sample_film', title: 'Sample Film', year: '1931',
    poster: 'https://archive.org/services/img/sample_film', type: 'movie',
  });
  assert.equal(mapArchiveDoc({ identifier: '../bad', title: 'Bad' }), null);
});

test('selects direct video files and excludes private/derivative/torrent files', () => {
  const files = selectArchiveVideoFiles([
    { name: 'movie_360p.mp4', source: 'original', size: '100' },
    { name: 'movie_1080p.mp4', source: 'original', size: '300' },
    { name: 'movie_1080p.mp4', source: 'derivative', size: '300' },
    { name: 'private.mp4', private: true },
    { name: 'movie.torrent', source: 'original' },
    { name: 'poster.jpg', source: 'original' },
  ]);
  assert.deepEqual(files.map((file) => file.name), ['movie_1080p.mp4', 'movie_360p.mp4']);
});

test('searches Archive.org and maps result documents', async () => {
  const fetcher = async (url) => {
    assert.match(String(url), /advancedsearch\.php/);
    return { ok: true, json: async () => ({ response: { docs: [{ identifier: 'bbb', title: 'Big Buck Bunny', year: 2008 }] } }) };
  };
  const result = await searchArchive('Big Buck Bunny', 1, fetcher);
  assert.equal(result[0].id, 'archive:bbb');
});

test('loads title metadata and resolves direct downloadable media', async () => {
  const fetcher = async (url) => ({
    ok: true,
    json: async () => url.includes('/metadata/')
      ? { metadata: { title: 'Sample Film', year: '1940', description: 'A classic.' }, files: [{ name: 'sample_720p.mp4', source: 'original', size: '12345' }] }
      : {},
  });
  const title = await getArchiveTitle('sample_film', fetcher);
  assert.equal(title.title, 'Sample Film');
  const resolved = await resolveArchive('sample_film', fetcher);
  assert.equal(resolved.streams.length, 1);
  assert.equal(resolved.streams[0].url, 'https://archive.org/download/sample_film/sample_720p.mp4');
  assert.equal(resolved.streams[0].kind, 'file');
});
