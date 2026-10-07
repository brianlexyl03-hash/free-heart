'use strict';

// Free-heart Web Push notification module.
// Install: npm i web-push
// Required env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// Optional: PUSH_DB_FILE (default ./data/push-subscriptions.json)

import fs from 'node:fs';
import path from 'node:path';
import webpush from 'web-push';

const DB = process.env.PUSH_DB_FILE || path.join(process.cwd(), 'data', 'push-subscriptions.json');
const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

function assertConfig() {
  if (!PUBLIC_KEY || !PRIVATE_KEY) throw new Error('VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are required');
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
}
function read() {
  try { return JSON.parse(fs.readFileSync(DB, 'utf8')); } catch { return []; }
}
function write(items) {
  fs.mkdirSync(path.dirname(DB), { recursive: true });
  fs.writeFileSync(DB, JSON.stringify(items, null, 2));
}

export function registerPushRoutes(fastify) {
  assertConfig();
  fastify.get('/api/push/public-key', async () => ({ publicKey: PUBLIC_KEY }));

  fastify.post('/api/push/subscribe', async (req, reply) => {
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
    const title = req.body?.title || 'You might like this 🎬';
    const body = req.body?.body || 'A movie picked for you from what is trending now.';
    const url = req.body?.url || '/#/';
    const result = await sendToAll({ title, body, url, tag: 'free-heart-test' });
    return reply.send(result);
  });
}

export async function sendToAll({ title, body, url, image, tag }) {
  const items = read();
  let sent = 0, removed = 0, failed = 0;
  for (const item of items) {
    if (!item.enabled) continue;
    try {
      await webpush.sendNotification(item.subscription, JSON.stringify({ title, body, url, image, tag }));
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


