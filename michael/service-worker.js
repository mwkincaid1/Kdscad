const CACHE = 'kds-michael-v1';
const ASSETS = [
  '/michael/',
  '/michael/index.html',
  '/michael/styles.css',
  '/michael/script.js',
  '/michael/manifest.webmanifest',
  '/michael/assets/kds-logo-mark.png',
  '/michael/assets/qr-kds.png',
  '/michael/assets/michael-kincaid.vcf',
  '/michael/assets/icon-192.png',
  '/michael/assets/icon-512.png'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match('/michael/')))
  );
});
