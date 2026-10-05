const V = 'free-shell-v6';
const SHELL = ['/', '/app.js', '/player.js', '/maturity.js', '/styles.css', '/manifest.webmanifest', '/icon.svg'];
const DB_NAME = 'free-downloads-v1';
const STORE = 'tasks';
const MAX_ACTIVE = 3;
const CHECKPOINT = 16 * 1024 * 1024; // commit partial data every 16 MB so a killed worker can resume
const running = new Map(); // taskId -> AbortController
const pending = [];        // { task, resolve }

self.addEventListener('install', (e) => e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== V).map((x) => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const c = r.clone(); caches.open(V).then((x) => x.put(e.request, c)); } return r; }).catch(() => caches.match(e.request).then((m) => m || caches.match('/'))));
});

// ---------- tiny IndexedDB layer (shared with the page) ----------
let dbPromise;
function openDb() {
  dbPromise ||= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'taskId' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}
const putTask = (task) => openDb().then((db) => new Promise((resolve, reject) => {
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put(task);
  tx.oncomplete = resolve;
  tx.onerror = () => reject(tx.error);
}));
const delTask = (id) => openDb().then((db) => new Promise((resolve, reject) => {
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).delete(id);
  tx.oncomplete = resolve;
  tx.onerror = () => reject(tx.error);
}));
async function tellClients(message) {
  const tabs = await clients.matchAll({ type: 'window', includeUncontrolled: true });
  tabs.forEach((tab) => tab.postMessage(message));
}
const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
});

// ---------- resolving a fresh stream token right before each download starts ----------
async function resolveStream(task, signal) {
  let last;
  for (let i = 0; i < 4; i += 1) {
    let final = false;
    try {
      const r = await fetch('/api/resolve', {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal,
        body: JSON.stringify({ id: task.id, episode: task.episode || undefined, resolution: task.resolution || undefined }),
      });
      const body = await r.json().catch(() => ({}));
      if (r.ok) return body;
      last = new Error(body.message || `Could not prepare this download (HTTP ${r.status})`);
      final = r.status < 500 && r.status !== 429;
    } catch (e) { if (signal.aborted) throw e; last = e; }
    if (final) throw last;
    await sleep(2000 * (i + 1), signal);
  }
  throw last || new Error('Could not prepare this download.');
}

async function runDownload(task) {
  const ac = new AbortController();
  running.set(task.taskId, ac);
  let t = { ...task };
  let lastSent = 0;
  const save = async (patch) => {
    t = { ...t, ...patch };
    t.pct = t.status === 'done' ? 100 : t.total > 0 ? Math.min(99, Math.floor((t.received / t.total) * 100)) : null;
    await putTask(t).catch(() => {});
    tellClients({ type: 'DOWNLOAD_UPDATE', task: t });
  };
  try {
    if (!navigator.storage?.getDirectory) throw new Error('Private storage is not supported by this browser.');
    await save({ status: 'resolving', error: null });
    let resolved = await resolveStream(t, ac.signal);
    let reResolved = false;
    if (resolved.kind !== 'file') throw new Error('This source is a live/HLS stream and cannot be saved as one file. Use Play instead.');
    const root = await navigator.storage.getDirectory();
    const file = t.file || `${t.taskId}.bin`;
    const handle = await root.getFileHandle(file, { create: true });
    let existing = (await handle.getFile()).size;
    let total = t.total || 0;
    let type = t.type || 'video/mp4';
    await save({ status: 'downloading', file, received: existing, selectedResolution: resolved.selectedResolution || null });
    let attempts = 0;
    for (;;) {
      attempts += 1;
      let response = null;
      try { response = await fetch(resolved.stream, { headers: existing > 0 ? { range: `bytes=${existing}-` } : {}, signal: ac.signal, credentials: 'same-origin' }); }
      catch (e) { if (ac.signal.aborted) throw e; }
      if (!response || response.status >= 500 || response.status === 429) {
        const bj = response ? await response.json().catch(() => ({})) : {};
        if (attempts >= 5) throw new Error(response ? (bj.message || `The server kept failing (HTTP ${response.status}). Try again later.`) : 'Connection lost. Try again when you are online.');
        await sleep(1500 * attempts, ac.signal);
        existing = (await handle.getFile()).size;
        continue;
      }
      if (response.status === 416 && existing > 0) break; // everything is already on disk
      if ([401, 403, 410].includes(response.status) && !reResolved) { // signed link expired: get a fresh one once
        reResolved = true;
        try { await response.body?.cancel(); } catch { /* ignore */ }
        resolved = await resolveStream(t, ac.signal);
        continue;
      }
      if (!response.ok) {
        const b = await response.json().catch(() => ({}));
        const base = b.message || (response.status === 402 ? 'The source is asking for payment or a subscription for this file (HTTP 402).' : `The source rejected the download (HTTP ${response.status}).`);
        throw new Error(`${base}${/HTTP \d+/.test(base) ? '' : ` (HTTP ${response.status})`} Try another quality or title.`);
      }
      const partial = response.status === 206;
      if (existing > 0 && !partial) existing = 0; // server ignored Range: start over
      const cr = response.headers.get('content-range');
      const len = Number(response.headers.get('content-length')) || 0;
      total = partial ? (Number((cr || '').split('/')[1]) || existing + len) : len;
      { const ct = response.headers.get('content-type') || ''; if (/^video\//.test(ct)) type = ct; else if (!/^video\//.test(type)) type = 'video/mp4'; }
      let writable = await handle.createWritable({ keepExistingData: existing > 0 });
      if (existing > 0) await writable.seek(existing); else await writable.truncate(0);
      const reader = response.body.getReader();
      let received = existing;
      let sinceCheckpoint = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          await writable.write(value);
          received += value.length;
          sinceCheckpoint += value.length;
          if (sinceCheckpoint >= CHECKPOINT) {
            await writable.close();
            writable = await handle.createWritable({ keepExistingData: true });
            await writable.seek(received);
            sinceCheckpoint = 0;
          }
          if (Date.now() - lastSent > 400) { lastSent = Date.now(); await save({ received, total, type }); }
        }
        await writable.close();
      } catch (e) {
        await writable.close().catch(() => {}); // keep what we have for resuming
        if (ac.signal.aborted) throw e;
        if (attempts >= 5) throw new Error('The connection kept dropping. Tap Retry to resume where it stopped.');
        existing = (await handle.getFile()).size;
        await sleep(1500 * attempts, ac.signal);
        continue;
      }
      existing = received;
      if (total && received < total) {
        if (attempts >= 5) throw new Error('The download ended early. Tap Retry to resume.');
        continue;
      }
      break;
    }
    const finalSize = (await handle.getFile()).size;
    await save({ status: 'done', received: finalSize, total: finalSize, size: finalSize, type, finishedAt: Date.now(), error: null });
    notifyDone(t);
  } catch (error) {
    if (ac.signal.aborted) return; // cancelled: the cancel handler cleans up
    await save({ status: 'error', error: error.message || 'Download failed' });
  } finally {
    running.delete(task.taskId);
  }
}
async function notifyDone(task) {
  try {
    if (Notification.permission !== 'granted') return;
    const tabs = await clients.matchAll({ type: 'window' });
    if (tabs.some((c) => c.visibilityState === 'visible')) return;
    await self.registration.showNotification('Download complete', { body: task.name, icon: '/icon-192.png', tag: `dl-${task.taskId}`, data: { url: '/#/downloads' } });
  } catch { /* notifications are best effort */ }
}

function enqueue(task) {
  if (running.has(task.taskId) || pending.some((p) => p.task.taskId === task.taskId)) return Promise.resolve();
  const queued = { ...task, status: 'queued', error: null };
  putTask(queued).then(() => tellClients({ type: 'DOWNLOAD_UPDATE', task: queued })).catch(() => {});
  return new Promise((resolve) => { pending.push({ task: queued, resolve }); pump(); });
}
function pump() {
  while (running.size < MAX_ACTIVE && pending.length) {
    const item = pending.shift();
    runDownload(item.task).finally(() => { item.resolve(); pump(); });
  }
}
async function cancelTask(taskId) {
  running.get(taskId)?.abort();
  const i = pending.findIndex((p) => p.task.taskId === taskId);
  if (i >= 0) { pending[i].resolve(); pending.splice(i, 1); }
  try {
    const db = await openDb();
    const task = await new Promise((res) => { const r = db.transaction(STORE).objectStore(STORE).get(taskId); r.onsuccess = () => res(r.result); r.onerror = () => res(null); });
    if (task?.file && navigator.storage?.getDirectory) { const root = await navigator.storage.getDirectory(); await root.removeEntry(task.file).catch(() => {}); }
  } catch { /* ignore */ }
  await delTask(taskId).catch(() => {});
  tellClients({ type: 'DOWNLOAD_REMOVED', taskId });
}

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'DOWNLOAD') event.waitUntil(enqueue(data.task));
  else if (data.type === 'DOWNLOAD_BATCH') event.waitUntil(Promise.all((data.tasks || []).map(enqueue)));
  else if (data.type === 'CANCEL') event.waitUntil(cancelTask(data.taskId));
  else if (data.type === 'SYNC') {
    // The page pings us while it is open: restart anything that was interrupted and keep the worker alive.
    const work = (data.tasks || []).map(enqueue);
    event.waitUntil(Promise.all(work).then(() => {}));
    if (running.size || pending.length) event.waitUntil(sleep(25000));
  }
});

self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data?.json() || {}; } catch { data = { body: e.data?.text() || 'A new pick is waiting.' }; }
  e.waitUntil(self.registration.showNotification(data.title || 'A new pick for you', { body: data.body || 'Open free❤️‍🔥 to see what is new.', icon: '/icon-192.png', badge: '/icon-192.png', tag: data.tag || 'free-recommendation', data: { url: data.url || '/#/' } }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((tabs) => {
    const target = new URL(e.notification.data?.url || '/#/', self.location.origin).href;
    const tab = tabs.find((client) => 'focus' in client);
    return tab ? tab.focus().then(() => tab.navigate(target)) : clients.openWindow(target);
  }));
});
