// Add this logic to the existing service worker; do not register a second service worker.
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {}
  const title = data.title || 'You might like this 🎬';
  const options = {
    body: data.body || 'Something new is waiting for you.',
    icon: data.image || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    image: data.image,
    tag: data.tag || 'free-heart-recommendation',
    renotify: true,
    vibrate: [120, 60, 120],
    data: { url: data.url || '/#/' },
    actions: [{ action: 'open', title: 'Watch' }]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data?.url || '/#/';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const existing = list.find(c => 'focus' in c);
    if (existing) { existing.navigate(target); return existing.focus(); }
    return clients.openWindow(target);
  }));
});
