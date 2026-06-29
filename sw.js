const CACHE_VERSION = 'v1';
const CACHE_NAME = `haushaltsplan-${CACHE_VERSION}`;

const LOCAL_FILES = [
  '/',
  '/index.html',
  '/css/base.css',
  '/css/layout.css',
  '/css/components.css',
  '/js/app.js',
  '/js/auth.js',
  '/js/push.js',
  '/js/realtime.js',
  '/js/settings.js',
  '/js/supabase-client.js',
  '/js/tabs/tasks.js',
  '/js/tabs/mealplan.js',
  '/js/tabs/shopping.js',
  '/js/tabs/recipes.js',
  '/js/tabs/balance.js',
  '/manifest.json',
];

// ─── Install: cache local files ───────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(LOCAL_FILES))
  );
  self.skipWaiting();
});

// ─── Activate: delete old caches, notify clients ──────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
     .then(() =>
       self.clients.matchAll({ includeUncontrolled: true }).then(clients =>
         clients.forEach(client => client.postMessage({ type: 'SW_UPDATED' }))
       )
     )
  );
});

// ─── Fetch: serve local files from cache, pass CDN through ───────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Never cache: cross-origin or CDN requests
  if (url.origin !== self.location.origin || url.hostname === 'cdnjs.cloudflare.com') {
    return; // browser handles it
  }

  // Cache-first for local app files
  event.respondWith(
    caches.match(event.request).then(cached => cached ?? fetch(event.request))
  );
});

// ─── Push ─────────────────────────────────────────────────────────────────────
self.addEventListener('push', event => {
  let data = { title: '🏠 Haushaltsplan', body: 'Neue Benachrichtigung' };
  try { data = event.data?.json() ?? data; } catch {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url ?? '/' },
    })
  );
});

// ─── Notification click ───────────────────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const existing = clients.find(c => c.url === url && 'focus' in c);
      return existing ? existing.focus() : self.clients.openWindow(url);
    })
  );
});
