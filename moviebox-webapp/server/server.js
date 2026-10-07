'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dns = require('node:dns').promises;
const { Readable } = require('node:stream');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || path.join(process.cwd(), 'downloads');
const MAX_BODY_BYTES = 1024 * 1024;
const STREAM_TTL_MS = 15 * 60 * 1000;
const MAX_REDIRECTS = 5;
const MAX_RESOLVE_CANDIDATES = 12;
const PROBE_TIMEOUT_MS = 12_000;
const FETCH_TIMEOUT_MS = 45_000;

fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

const streamRegistry = new Map();
const QUALITY_SCORE = {
  '4k': 2160,
  '2160p': 2160,
  '1440p': 1440,
  '1080p': 1080,
  '720p': 720,
  '576p': 576,
  '480p': 480,
  '360p': 360
};

const PASS_RESPONSE_HEADERS = [
  'accept-ranges',
  'cache-control',
  'content-disposition',
  'content-encoding',
  'content-language',
  'content-length',
  'content-range',
  'content-type',
  'etag',
  'expires',
  'last-modified',
  'vary'
];

const FORWARD_REQUEST_HEADERS = [
  'range',
  'if-range',
  'if-none-match',
  'if-modified-since'
];

const PROVIDER_HEADERS = [
  'accept',
  'accept-language',
  'authorization',
  'cookie',
  'origin',
  'referer',
  'user-agent'
];

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Range, If-Range, If-None-Match, If-Modified-Since, Content-Type'
  );
  res.setHeader(
    'Access-Control-Expose-Headers',
    'Accept-Ranges, Content-Length, Content-Range, Content-Type, ETag, Last-Modified'
  );
}

function json(res, status, body) {
  const payload = Buffer.from(JSON.stringify(body));
  setCors(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', String(payload.length));
  res.end(payload);
}

function normalizeQuality(value) {
  return String(value || '').trim().toLowerCase();
}

function qualityScore(value) {
  const normalized = normalizeQuality(value);
  if (QUALITY_SCORE[normalized]) return QUALITY_SCORE[normalized];
  const match = normalized.match(/(\d{3,4})p/);
  return match ? Number(match[1]) : 0;
}

function isUnsafeHostname(hostname) {
  if (process.env.ALLOW_PRIVATE_STREAM_HOSTS === '1') return false;

  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (
    host === 'localhost' ||
    host === 'localhost.localdomain' ||
    host === '0.0.0.0' ||
    host === '::1'
  ) return true;

  const parts = host.split('.');
  if (parts.length !== 4 || parts.some((x) => !/^\d+$/.test(x))) return false;
  const octets = parts.map(Number);
  if (octets.some((x) => x < 0 || x > 255)) return true;

  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

async function assertSafeUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid stream URL');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only HTTP and HTTPS stream URLs are supported');
  }

  if (isUnsafeHostname(parsed.hostname)) {
    throw new Error('Private or loopback stream hosts are blocked');
  }

  if (!/^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname)) {
    try {
      const records = await dns.lookup(parsed.hostname, { all: true });
      if (records.some((record) => isUnsafeHostname(record.address))) {
        throw new Error('Stream host resolves to a private address');
      }
    } catch (error) {
      if (error.message === 'Stream host resolves to a private address') throw error;
      // fetch() performs its own DNS resolution; transient resolver errors
      // should not make every legitimate CDN hostname unusable.
    }
  }

  return parsed.toString();
}

function normalizeSource(source) {
  if (typeof source === 'string') {
    return { url: source.trim(), quality: null, headers: {} };
  }

  if (!source || typeof source !== 'object') return null;
  if (typeof source.url !== 'string' || !source.url.trim()) return null;

  const headers = {};
  if (source.headers && typeof source.headers === 'object') {
    for (const [name, value] of Object.entries(source.headers)) {
      const lower = name.toLowerCase();
      if (
        PROVIDER_HEADERS.includes(lower) &&
        typeof value === 'string' &&
        value.length <= 8192
      ) {
        headers[lower] = value;
      }
    }
  }

  return {
    url: source.url.trim(),
    quality: typeof source.quality === 'string' ? source.quality : null,
    headers
  };
}

function createHeaders(sourceHeaders, requestHeaders) {
  const headers = new Headers();

  for (const [name, value] of Object.entries(sourceHeaders || {})) {
    headers.set(name, value);
  }
  for (const [name, value] of Object.entries(requestHeaders || {})) {
    if (value != null && value !== '') headers.set(name, value);
  }

  // Prevent an upstream from gzip-encoding a range response that must be
  // passed through byte-for-byte.
  headers.set('accept-encoding', 'identity');
  return headers;
}

async function fetchWithRedirects(source, requestHeaders = {}, externalSignal) {
  let currentUrl = source.url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertSafeUrl(currentUrl);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const forwardAbort = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort();
      else externalSignal.addEventListener('abort', forwardAbort, { once: true });
    }

    try {
      const response = await fetch(currentUrl, {
        method: 'GET',
        headers: createHeaders(source.headers, requestHeaders),
        redirect: 'manual',
        signal: controller.signal
      });

      if (![301, 302, 303, 307, 308].includes(response.status)) {
        return { response, finalUrl: currentUrl };
      }

      const location = response.headers.get('location');
      if (!location) return { response, finalUrl: currentUrl };
      currentUrl = new URL(location, currentUrl).toString();

      if (response.body) response.body.cancel().catch(() => {});
    } finally {
      clearTimeout(timeout);
      if (externalSignal) externalSignal.removeEventListener('abort', forwardAbort);
    }
  }

  throw new Error('Too many upstream redirects');
}

function collectForwardHeaders(req) {
  const result = {};
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = req.headers[name];
    if (value) result[name] = value;
  }
  return result;
}

function copyResponseHeaders(upstream, res) {
  for (const name of PASS_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value != null) res.setHeader(name, value);
  }
  setCors(res);
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function looksLikeMediaResponse(response) {
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (!contentType) return true;
  return (
    contentType.startsWith('video/') ||
    contentType.startsWith('audio/') ||
    contentType.includes('application/octet-stream') ||
    contentType.includes('application/vnd.apple.mpegurl') ||
    contentType.includes('application/x-mpegurl') ||
    contentType.includes('application/dash+xml')
  );
}

async function cancelBody(response) {
  if (response?.body) {
    try { await response.body.cancel(); } catch {}
  }
}

async function probeSource(source) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const { response, finalUrl } = await fetchWithRedirects(
      source,
      { range: 'bytes=0-1' },
      controller.signal
    );

    const status = response.status;
    const range = response.headers.get('content-range');
    const media = looksLikeMediaResponse(response);

    if (status === 206 && range && media) {
      await cancelBody(response);
      return {
        ok: true,
        seekable: true,
        status,
        finalUrl,
        contentType: response.headers.get('content-type') || null,
        contentRange: range,
        contentLength: response.headers.get('content-length') || null
      };
    }

    await cancelBody(response);
    return {
      ok: false,
      seekable: false,
      status,
      finalUrl,
      reason:
        status === 401 || status === 403 || status === 410
          ? 'forbidden-or-expired'
          : status >= 500
            ? 'upstream-error'
            : status === 200
              ? 'range-not-supported'
              : !media
                ? 'not-media'
                : 'not-seekable'
    };
  } catch (error) {
    return {
      ok: false,
      seekable: false,
      status: 0,
      reason: controller.signal.aborted ? 'timeout' : 'network',
      message: error.message
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveCandidates(sources) {
  const normalized = sources
    .map(normalizeSource)
    .filter(Boolean)
    .slice(0, MAX_RESOLVE_CANDIDATES);

  if (!normalized.length) throw new Error('No stream sources supplied');

  const results = [];
  for (let i = 0; i < normalized.length; i += 4) {
    const batch = normalized.slice(i, i + 4);
    const batchResults = await Promise.all(
      batch.map(async (source) => ({ source, probe: await probeSource(source) }))
    );
    results.push(...batchResults);
  }

  results.sort((a, b) => {
    if (a.probe.seekable !== b.probe.seekable) return a.probe.seekable ? -1 : 1;
    return qualityScore(b.source.quality) - qualityScore(a.source.quality);
  });

  const seekable = results.filter((item) => item.probe.seekable);
  const winner = seekable[0];

  if (!winner) {
    return {
      ok: false,
      sources: results.map(({ source, probe }) => ({
        url: source.url,
        quality: source.quality,
        status: probe.status,
        reason: probe.reason,
        message: probe.message
      }))
    };
  }

  const candidates = seekable.map((item) => item.source);
  const id = crypto.randomBytes(18).toString('base64url');
  const expiresAt = Date.now() + STREAM_TTL_MS;

  streamRegistry.set(id, {
    candidates,
    activeIndex: 0,
    expiresAt
  });

  return {
    ok: true,
    stream: {
      id,
      url: `/api/stream/${id}`,
      quality: winner.source.quality || null,
      contentType: winner.probe.contentType,
      contentRange: winner.probe.contentRange,
      contentLength: winner.probe.contentLength,
      expiresAt: new Date(expiresAt).toISOString()
    }
  };
}

async function pipeWebResponse(upstream, res) {
  if (!upstream.body) {
    res.end();
    return;
  }

  const nodeStream = Readable.fromWeb(upstream.body);
  await new Promise((resolve, reject) => {
    nodeStream.once('error', reject);
    res.once('error', reject);
    res.once('finish', resolve);
    nodeStream.pipe(res);
  });
}

async function relayStream(req, res, entry) {
  const requestHeaders = collectForwardHeaders(req);
  const startIndex = entry.activeIndex % entry.candidates.length;
  let lastError = null;

  for (let offset = 0; offset < entry.candidates.length; offset++) {
    const index = (startIndex + offset) % entry.candidates.length;
    const source = entry.candidates[index];
    const controller = new AbortController();

    const clientClosed = () => controller.abort();
    req.once('aborted', clientClosed);
    req.once('close', clientClosed);

    try {
      const { response, finalUrl } = await fetchWithRedirects(
        source,
        requestHeaders,
        controller.signal
      );

      const status = response.status;
      const requestedRange = Boolean(requestHeaders.range);
      const contentRange = response.headers.get('content-range');
      const contentType = response.headers.get('content-type') || '';

      const badStatus = [401, 403, 404, 410, 416, 429, 500, 502, 503, 504].includes(status);
      const badRange = requestedRange && status === 200 && !contentRange;
      const htmlChallenge = /text\/html/i.test(contentType);

      if (badStatus || badRange || htmlChallenge) {
        lastError = new Error(
          htmlChallenge
            ? `Upstream returned HTML (${status})`
            : `Upstream returned HTTP ${status}`
        );
        await cancelBody(response);
        continue;
      }

      if (status !== 200 && status !== 206) {
        lastError = new Error(`Unexpected upstream HTTP ${status}`);
        await cancelBody(response);
        continue;
      }

      copyResponseHeaders(response, res);
      res.statusCode = status;
      res.setHeader('Cache-Control', 'no-store');

      if (!looksLikeMediaResponse(response)) {
        lastError = new Error(`Upstream response is not media (${status})`);
        await cancelBody(response);
        continue;
      }

      entry.activeIndex = index;
      entry.expiresAt = Date.now() + STREAM_TTL_MS;

      await pipeWebResponse(response, res);
      return;
    } catch (error) {
      lastError = error;
      if (res.headersSent) return;
    } finally {
      req.off('aborted', clientClosed);
      req.off('close', clientClosed);
    }
  }

  if (!res.headersSent) {
    json(res, 502, {
      ok: false,
      error: 'No upstream source could serve the requested media range',
      code: 'UPSTREAM_STREAM_UNAVAILABLE',
      detail: lastError?.message || 'unknown upstream failure'
    });
  }
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(Object.assign(new Error('Invalid JSON body'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function cleanupRegistry() {
  const now = Date.now();
  for (const [id, entry] of streamRegistry) {
    if (entry.expiresAt <= now) streamRegistry.delete(id);
  }
}

setInterval(cleanupRegistry, 60_000).unref();

function safePublicPath(requestPath) {
  const pathname = decodeURIComponent(requestPath.split('?')[0]);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const full = path.resolve(PUBLIC_DIR, relative);
  if (!full.startsWith(PUBLIC_DIR + path.sep)) return null;
  return full;
}

function sendStatic(req, res) {
  const file = safePublicPath(req.url || '/');
  if (!file) return json(res, 400, { ok: false, error: 'Invalid path' });

  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) {
      if ((req.url || '').split('?')[0].startsWith('/api/')) {
        return json(res, 404, { ok: false, error: 'Not found' });
      }
      const fallback = path.join(PUBLIC_DIR, 'index.html');
      return fs.createReadStream(fallback).on('error', () => {
        json(res, 404, { ok: false, error: 'Not found' });
      }).pipe(res);
    }

    const ext = path.extname(file).toLowerCase();
    const contentTypes = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.ico': 'image/x-icon'
    };

    setCors(res);
    res.statusCode = 200;
    res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream');
    res.setHeader('Content-Length', String(stat.size));

    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

async function handler(req, res) {
  setCors(res);
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') return res.end();

  const parsed = new URL(req.url || '/', 'http://localhost');
  const pathname = parsed.pathname;

  if (pathname === '/api/health' && req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      service: 'moviebox-web-stream-relay',
      streamMode: 'range-preserving',
      activeStreams: streamRegistry.size
    });
  }

  if (pathname === '/api/streams/resolve' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const result = await resolveCandidates(Array.isArray(body.sources) ? body.sources : []);
      if (!result.ok) {
        return json(res, 502, {
          ok: false,
          error: 'No seekable stream source available',
          code: 'NO_SEEKABLE_SOURCE',
          candidates: result.sources
        });
      }
      return json(res, 200, result);
    } catch (error) {
      return json(res, error.statusCode || 400, {
        ok: false,
        error: error.message
      });
    }
  }

  const streamMatch = pathname.match(/^\/api\/stream\/([A-Za-z0-9_-]+)$/);
  if (streamMatch && (req.method === 'GET' || req.method === 'HEAD')) {
    cleanupRegistry();
    const entry = streamRegistry.get(streamMatch[1]);

    if (!entry) {
      return json(res, 404, {
        ok: false,
        error: 'Stream session expired or does not exist',
        code: 'STREAM_SESSION_NOT_FOUND'
      });
    }

    entry.expiresAt = Date.now() + STREAM_TTL_MS;

    if (req.method === 'HEAD') {
      const source = entry.candidates[entry.activeIndex];
      const probe = await probeSource(source);
      if (!probe.ok) return json(res, 502, { ok: false, error: 'Upstream stream unavailable' });
      setCors(res);
      res.statusCode = 200;
      res.setHeader('Accept-Ranges', 'bytes');
      if (probe.contentType) res.setHeader('Content-Type', probe.contentType);
      if (probe.contentLength) res.setHeader('Content-Length', probe.contentLength);
      if (probe.contentRange) res.setHeader('Content-Range', probe.contentRange);
      return res.end();
    }

    return relayStream(req, res, entry);
  }

  // The previous app exposed a fake /api/download contract. Keep it explicit
  // rather than pretending a nonexistent worker can produce files.
  if (pathname === '/api/download') {
    return json(res, 501, {
      ok: false,
      error: 'File downloading is not enabled by the stream relay',
      code: 'DOWNLOAD_WORKER_NOT_CONFIGURED'
    });
  }

  return sendStatic(req, res);
}

const app = (req, res) => handler(req, res).catch((error) => {
  if (!res.headersSent) json(res, 500, { ok: false, error: 'Internal server error' });
});

function createServer() {
  return http.createServer(app);
}

if (require.main === module) {
  createServer().listen(PORT, '0.0.0.0', () => {
    console.log(`Stream relay listening on 0.0.0.0:${PORT}`);
  });
}

module.exports = {
  app,
  createServer,
  resolveCandidates,
  probeSource,
  streamRegistry
};
