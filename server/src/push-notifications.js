'use strict';

// Free-heart Web Push notification module.
// Required env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// Optional: PUSH_DB_FILE (default ./data/push-subscriptions.json)

import fs from 'node:fs';
import path from 'node:path';
import webpush from 'web-push';

// Deplexo's persistent volume is mounted at /data. In production, reject
// app-image and temporary paths even if an old environment variable points there.
const PRODUCTION = process.env.NODE_ENV === 'production';
const APP_WORKING_DIR = path.resolve(process.cwd());
const DEFAULT_DB = path.join(PRODUCTION ? '/data' : path.join(process.cwd(), 'data'), 'push-subscriptions.json');
const REQUESTED_DB = path.resolve(process.env.PUSH_DB_FILE || path.join(process.env.DATA_DIR || path.dirname(DEFAULT_DB), 'push-subscriptions.json'));
const isInside = (target, directory) => target === directory || target.startsWith(directory + path.sep);
const NON_DURABLE_CONFIG = isInside(REQUESTED_DB, APP_WORKING_DIR) || isInside(REQUESTED_DB, '/tmp');
const DB = PRODUCTION && NON_DURABLE_CONFIG ? path.resolve('/data/push-subscriptions.json') : REQUESTED_DB;
const LEGACY_DB = path.resolve(path.join(process.cwd(), 'data', 'push-subscriptions.json'));

if (PRODUCTION && NON_DURABLE_CONFIG) {
  console.warn('[push] Ignoring PUSH_DB_FILE under the application or temporary directory; using Deplexo persistent storage at /data.');
}
console.info(`[push] Subscription storage configured at ${DB}`);

// Environment values are often pasted with surrounding quotes or whitespace.
// VAPID keys must be unpadded base64url strings.
function envValue(name) {
  return String(process.env[name] || '').trim().replace(/^["']|["']$/g, '').trim();
}

function normalizePublicKey(value) {
  const key = value.replace(/\s+/g, '').replace(/=+$/, '');
  if (!/^[A-Za-z0-9_-]+$/.test(key)) return '';
  try {
    return Buffer.from(key, 'base64url').length === 65 ? key : '';
  } catch {
    return '';
  }
}

function normalizePrivateKey(value) {
  const key = value.replace(/\s+/g, '').replace(/=+$/, '');
  if (!/^[A-Za-z0-9_-]+$/.test(key)) return '';
  try {
    return Buffer.from(key, 'base64url').length === 32 ? key : '';
  } catch {
    return '';
  }
}

const PUBLIC_KEY = normalizePublicKey(envValue('VAPID_PUBLIC_KEY'));
const PRIVATE_KEY = normalizePrivateKey(envValue('VAPID_PRIVATE_KEY'));
const SUBJECT = envValue('VAPID_SUBJECT') || 'mailto:admin@example.com';

let vapidConfigured = false;

function assertConfig() {
  if (!PUBLIC_KEY || !PRIVATE_KEY) {
    console.warn('[push] Web Push disabled: VAPID keys are missing or malformed. Set valid VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY environment variables.');
    return false;
  }

  try {
    webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
    vapidConfigured = true;
    return true;
  } catch (error) {
    vapidConfigured = false;
    console.error('[push] Web Push disabled: VAPID configuration is invalid:', error.message);
    return false;
  }
}

function readFileIfPresent(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(parsed)) throw new Error('subscription store must contain a JSON array');
    return parsed;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(`[push] Cannot read subscription store ${file}: ${error.message}`, { cause: error });
  }
}

function read() {
  const current = readFileIfPresent(DB);
  if (current !== null) return current;

  // Migrate subscriptions from the old app-local path if it still exists.
  if (LEGACY_DB !== DB) {
    const legacy = readFileIfPresent(LEGACY_DB);
    if (legacy !== null) {
      write(legacy);
      console.info(`[push] Migrated ${legacy.length} subscriptions to persistent storage.`);
      return legacy;
    }
  }

  return [];
}

function write(items) {
  const directory = path.dirname(DB);
  const temporaryFile = `${DB}.${process.pid}.tmp`;
  const payload = JSON.stringify(items, null, 2);

  // Never fall back to disposable storage: failed writes must be visible.
  fs.mkdirSync(directory, { recursive: true });

  try {
    fs.writeFileSync(temporaryFile, payload, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporaryFile, DB);
  } catch (error) {
    try { fs.rmSync(temporaryFile, { force: true }); } catch {}
    throw new Error(`[push] Persistent subscription store write failed at ${DB}: ${error.message}`, { cause: error });
  }
}

export function registerPushRoutes(fastify) {
  const enabled = assertConfig();

  fastify.get('/api/push/public-key', async (_req, reply) => {
    if (!enabled) return reply.code(503).send({ error: 'push_not_configured', message: 'Web Push is not configured on this service.' });
    return { publicKey: PUBLIC_KEY };
  });

  fastify.post('/api/push/subscribe', async (req, reply) => {
    if (!enabled) return reply.code(503).send({ error: 'push_not_configured', message: 'Web Push is not configured on this service.' });
    const sub = req.body?.subscription || req.body;
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return reply.code(400).send({ error: 'Invalid push subscription' });
    const items = read();
    const now = Date.now();
    const existing = items.find(x => x.endpoint === sub.endpoint);
    if (existing) Object.assign(existing, { subscription: sub, updatedAt: now, enabled: true });
    else items.push({ endpoint: sub.endpoint, subscription: sub, createdAt: now, updatedAt: now, enabled: true, lastSentAt: 0 });
    write(items);
    return { ok: true };
  });

  fastify.post('/api/push/unsubscribe', async (req) => {
    const endpoint = req.body?.endpoint || req.body?.subscription?.endpoint;
    const items = read().filter(x => x.endpoint !== endpoint);
    write(items);
    return { ok: true };
  });

  fastify.post('/api/push/test', async (req, reply) => {
    if (!enabled) return reply.code(503).send({ error: 'push_not_configured', message: 'Web Push is not configured on this service.' });
    const title = req.body?.title || 'You might like this 🎬';
    const body = req.body?.body || 'A movie picked for you from what is trending now.';
    const url = req.body?.url || '/#/';
    const result = await sendToAll({ title, body, url, tag: 'free-heart-test' });
    return reply.send(result);
  });
}

export async function sendToAll({ title, body, url, image, tag, movieId, movieTitle }) {
  if (!vapidConfigured) return { ok: false, disabled: true, sent: 0, failed: 0, removed: 0 };
  const items = read();
  let sent = 0, removed = 0, failed = 0;
  for (const item of items) {
    if (!item.enabled) continue;
    try {
      await webpush.sendNotification(item.subscription, JSON.stringify({ title, body, url, image, tag, movieId, movieTitle, kind: movieId ? 'movie' : 'general' }));
      item.lastSentAt = Date.now();
      sent++;
    } catch (e) {
      failed++;
      if (e.statusCode === 404 || e.statusCode === 410) { item.enabled = false; removed++; }
    }
  }
  write(items);
  return { ok: true, sent, failed, removed };
}

// Targeted delivery for features such as followed live matches. The endpoint
// must already be registered through /api/push/subscribe; callers cannot inject
// an arbitrary Web Push subscription here.
export function hasSubscription(endpoint) {
  return read().some((item) => item.endpoint === endpoint && item.enabled);
}

export async function sendToEndpoint(endpoint, { title, body, url, image, tag, movieId, movieTitle }) {
  if (!vapidConfigured) return { ok: false, disabled: true };
  const items = read();
  const item = items.find((entry) => entry.endpoint === endpoint && entry.enabled);
  if (!item) return { ok: false, gone: true };
  try {
    await webpush.sendNotification(item.subscription, JSON.stringify({ title, body, url, image, tag, movieId, movieTitle, kind: movieId ? 'movie' : 'general' }));
    item.lastSentAt = Date.now();
    write(items);
    return { ok: true };
  } catch (error) {
    if (error.statusCode === 404 || error.statusCode === 410) {
      item.enabled = false;
      write(items);
      return { ok: false, gone: true };
    }
    return { ok: false, error: error.statusCode || 'error' };
  }
}
