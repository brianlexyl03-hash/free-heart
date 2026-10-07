process.env.ALLOW_PRIVATE_STREAM_HOSTS = '1';

const assert = require('node:assert/strict');
const http = require('node:http');

const PAYLOAD = Buffer.from(
  Array.from({ length: 256 * 1024 }, (_, i) => i % 251)
);

const seen = [];
let primaryRangeRequests = 0;

const upstream = http.createServer((req, res) => {
  seen.push({
    url: req.url,
    range: req.headers.range || null,
    userAgent: req.headers['user-agent'] || null,
    referer: req.headers.referer || null
  });

  if (req.url === '/forbidden') {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('forbidden');
  }

  if (req.url === '/bad-gateway') {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    return res.end('bad gateway');
  }

  const isPrimary = req.url === '/primary.mp4';
  const isBackup = req.url === '/backup.mp4';

  if (!isPrimary && !isBackup) {
    res.writeHead(404);
    return res.end();
  }

  // Primary is healthy during probe, but fails when the player actually
  // asks for media. The relay must switch to the already-probed backup.
  if (isPrimary && req.headers.range) {
    primaryRangeRequests += 1;
    if (primaryRangeRequests >= 2) {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      return res.end('primary unavailable');
    }
  }

  const range = req.headers.range;
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('ETag', '"test-etag"');

  if (!range) {
    res.setHeader('Content-Length', String(PAYLOAD.length));
    res.writeHead(200);
    return res.end(PAYLOAD);
  }

  const match = /^bytes=(\d+)-(\d*)$/.exec(range);
  if (!match) {
    res.writeHead(416, { 'Content-Range': `bytes */${PAYLOAD.length}` });
    return res.end();
  }

  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : PAYLOAD.length - 1;
  const end = Math.min(requestedEnd, PAYLOAD.length - 1);

  if (start >= PAYLOAD.length || start > end) {
    res.writeHead(416, { 'Content-Range': `bytes */${PAYLOAD.length}` });
    return res.end();
  }

  const body = PAYLOAD.subarray(start, end + 1);

  res.writeHead(206, {
    'Content-Length': String(body.length),
    'Content-Range': `bytes ${start}-${end}/${PAYLOAD.length}`
  });
  return res.end(body);
});

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

(async () => {
  const upstreamPort = await listen(upstream);
  const { createServer } = require('../server/server');
  const relay = createServer().listen(0, '127.0.0.1');
  await new Promise((resolve) => relay.once('listening', resolve));

  const relayPort = relay.address().port;
  const base = `http://127.0.0.1:${upstreamPort}`;

  const resolveResponse = await fetch(`http://127.0.0.1:${relayPort}/api/streams/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sources: [
        { url: `${base}/forbidden`, quality: '1080p' },
        { url: `${base}/bad-gateway`, quality: '1080p' },
        {
          url: `${base}/primary.mp4`,
          quality: '1080p',
          headers: {
            'User-Agent': 'MovieBox-TUI-Test',
            'Referer': 'https://example.test/'
          }
        },
        { url: `${base}/backup.mp4`, quality: '720p' }
      ]
    })
  });

  assert.equal(resolveResponse.status, 200);
  const resolved = await resolveResponse.json();
  assert.equal(resolved.ok, true);
  assert.equal(resolved.stream.quality, '1080p');
  assert.match(resolved.stream.url, /^\/api\/stream\//);

  // First actual range request goes to primary.
  const first = await fetch(
    `http://127.0.0.1:${relayPort}${resolved.stream.url}`,
    { headers: { Range: 'bytes=100-199' } }
  );

  assert.equal(first.status, 206);
  assert.equal(first.headers.get('content-range'), `bytes 100-199/${PAYLOAD.length}`);
  assert.deepEqual(Buffer.from(await first.arrayBuffer()), PAYLOAD.subarray(100, 200));

  // Second request causes the primary to return 503; relay must fail over.
  const second = await fetch(
    `http://127.0.0.1:${relayPort}${resolved.stream.url}`,
    { headers: { Range: 'bytes=1000-1199' } }
  );

  assert.equal(second.status, 206);
  assert.equal(second.headers.get('content-range'), `bytes 1000-1199/${PAYLOAD.length}`);
  assert.deepEqual(
    Buffer.from(await second.arrayBuffer()),
    PAYLOAD.subarray(1000, 1200)
  );

  const primaryRequests = seen.filter((x) => x.url === '/primary.mp4');
  assert.ok(primaryRequests.length >= 2);
  assert.ok(primaryRequests.some((x) => x.range === 'bytes=0-1'));
  assert.ok(primaryRequests.some((x) => x.range === 'bytes=100-199'));
  assert.ok(primaryRequests.every((x) => x.userAgent === 'MovieBox-TUI-Test'));
  assert.ok(primaryRequests.every((x) => x.referer === 'https://example.test/'));

  const backupRequests = seen.filter((x) => x.url === '/backup.mp4');
  assert.ok(backupRequests.some((x) => x.range === 'bytes=0-1'));
  assert.ok(backupRequests.some((x) => x.range === 'bytes=1000-1199'));

  const health = await fetch(`http://127.0.0.1:${relayPort}/api/health`);
  assert.equal(health.status, 200);
  const healthBody = await health.json();
  assert.equal(healthBody.ok, true);
  assert.equal(healthBody.streamMode, 'range-preserving');

  await close(relay);
  await close(upstream);

  console.log('All stream relay smoke tests passed.');
})().catch(async (error) => {
  console.error(error);
  try { await close(upstream); } catch {}
  process.exitCode = 1;
});
