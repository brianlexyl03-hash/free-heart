const V = 'free-shell-v4';
const SHELL = ['/', '/app.js', '/styles.css', '/manifest.webmanifest', '/icon.svg'];
const DB_NAME = 'free-downloads-v1';
const STORE = 'tasks';
const MAX_ACTIVE = 3;
let active = 0;
const pending = [];

self.addEventListener('install', (e) => e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== V).map((x) => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(V).then((x) => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request).then((m) => m || caches.match('/'))));
});

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'taskId' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function putTask(task) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(task);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  }));
}
async function tellClients(message) {
  const tabs = await clients.matchAll({ type: 'window', includeUncontrolled: true });
  tabs.forEach((tab) => tab.postMessage(message));
}
function safeName(value) {
  return String(value || 'download').replace(/[^a-z0-9._ -]/gi, '_').slice(0, 100) || 'download';
}
async function runDownload(task) {
  const update = (patch) => putTask({ ...task, ...patch }).then(() => tellClients({ type: 'DOWNLOAD_UPDATE', task: { ...task, ...patch } }));
  await update({ status: 'downloading', received: 0 });
  try {
    if (task.kind !== 'file') throw new Error('This source is HLS and cannot be saved as one file. Use Play instead.');
    if (!navigator.storage?.getDirectory) throw new Error('Background private storage is not supported by this browser.');
    let response;
    for (let i = 0; i < 4; i += 1) {
      try { response = await fetch(task.stream, { credentials: 'same-origin' }); if (response.ok || response.status < 500) break; }
      catch (e) { if (i === 3) throw e; }
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
    if (!response) throw new Error('Could not reach the server. Try again.');
    if (!response.ok) throw new Error(`The source rejected the download (HTTP ${response.status}). Try another quality.`);
    const total = Number(response.headers.get('content-length')) || 0;
    const root = await navigator.storage.getDirectory();
    const file = `${task.taskId}.bin`;
    const writable = await (await root.getFileHandle(file, { create: true })).createWritable();
    const reader = response.body.getReader();
    let received = 0; let last = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        await writable.write(value);
        received += value.length;
        if (Date.now() - last > 700) { last = Date.now(); await update({ status: 'downloading', file, received, total }); }
      }
      await writable.close();
    } catch (error) {
      await writable.abort().catch(() => {});
      await root.removeEntry(file).catch(() => {});
      throw error;
    }
    await update({ status: 'done', file, received, total, type: response.headers.get('content-type') || 'video/mp4', finishedAt: Date.now() });
  } catch (error) {
    await update({ status: 'error', error: error.message || 'Background download failed' });
  }
}
function enqueue(task) {
  return new Promise((resolve) => {
    pending.push({ task, resolve });
    pump();
  });
}
function pump() {
  while (active < MAX_ACTIVE && pending.length) {
    const item = pending.shift();
    active += 1;
    runDownload(item.task).finally(() => { active -= 1; item.resolve(); pump(); });
  }
}
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'DOWNLOAD') event.waitUntil(enqueue(data.task));
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
