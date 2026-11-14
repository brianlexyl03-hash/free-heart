// Add this logic to the existing service worker; do not register a second service worker.
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {}
  const image = /^https?:\/\//i.test(String(data.image || '')) ? String(data.image) : '';
  const title = data.title || (data.movieTitle ? `🎬 ${data.movieTitle}` : 'free❤️‍🔥');
  const options = {
    body: data.body || (data.movieTitle ? `New on free❤️‍🔥 · Tap to see ${data.movieTitle}.` : 'Open free❤️‍🔥 to see what is new.'),
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    image: image || undefined,
    tag: data.tag || (data.movieId ? `free-heart-movie-${data.movieId}` : 'free-heart-recommendation'),
    renotify: false,
    vibrate: [120, 60, 120],
    data: { url: data.url || '/#/', movieId: data.movieId || null, movieTitle: data.movieTitle || null },
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
