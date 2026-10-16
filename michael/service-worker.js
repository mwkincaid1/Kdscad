// Network-first, finite cache: only this public business card is stored offline.
const CACHE_PREFIX = 'kds-michael-';
const CACHE = `${CACHE_PREFIX}v2`;
const ASSETS = [
  '/michael/',
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
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS.map(path => new Request(path, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  const isCardNavigation = request.mode === 'navigate' &&
    ['/michael', '/michael/', '/michael/index.html'].includes(url.pathname);
  // Ignore queries only for the fixed public static files below.
  const cacheKey = isCardNavigation ? '/michael/' : url.pathname;
  if (!isCardNavigation && !ASSETS.includes(cacheKey)) return;
  if (!isCardNavigation && cacheKey === '/michael/') return;

  event.respondWith((async () => {
    try {
      const response = await fetch(request, { cache: 'no-store' });
      if (response.ok && response.type === 'basic') {
        try {
          const cache = await caches.open(CACHE);
          // Persistence finishes within respondWith's lifetime. Quota failure
          // must not turn a successful network response into a failed page.
          await cache.put(cacheKey, response.clone());
        } catch (error) {
          console.warn('Business card offline cache write failed', error);
        }
      }
      return response;
    } catch {
      try {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(cacheKey);
        if (cached) return cached;
      } catch (error) {
        console.warn('Business card offline cache read failed', error);
      }
      // Only navigation gets HTML; missing assets remain failures.
      if (isCardNavigation) {
        return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline | KDSCAD</title><h1>You are offline</h1><p>Reconnect to open Michael’s business card.</p></html>', {
          status: 503,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }
      return Response.error();
    }
  })());
});
