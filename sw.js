const CACHE = 'mashwer-shell-v6';
const SHELL = [
  '/', '/index.html', '/styles.css', '/app.js', '/navigation.js', '/config.js',
  '/manifest.webmanifest', '/icon.svg', '/logo-official-transparent.png', '/intro.mp4',
  '/routes/customer-orders.js', '/routes/customer-cart.js', '/routes/customer-account.js', '/routes/customer-notifications.js',
  '/routes/driver-orders.js', '/routes/driver-earnings.js', '/routes/driver-notifications.js',
  '/routes/admin-orders.js', '/routes/admin-drivers.js', '/routes/admin-shops.js', '/routes/admin-notifications.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match('/index.html'))));
});
