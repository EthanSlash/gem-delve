const CACHE_VERSION = 'gem-delve-v1';
const PRECACHE_URLS = ['./', './manifest.webmanifest', './icons/icon-192.png'];

const collectAssetUrls = (html) => {
  const urls = [];
  const pattern = /(?:src|href)\s*=\s*["']([^"']+)["']/g;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const raw = match[1];
    if (raw.startsWith('assets/') || raw.startsWith('./assets/')) {
      urls.push(new URL(raw, self.registration.scope).href);
    }
  }
  return urls;
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then(async (cache) => {
        await cache.addAll(PRECACHE_URLS);
        const pageResponse = await fetch('./');
        if (!pageResponse || !pageResponse.ok) {
          throw new Error('install failed: could not fetch the page');
        }
        await cache.put('./', pageResponse.clone());
        const assetUrls = collectAssetUrls(await pageResponse.text());
        await Promise.all(
          assetUrls.map(async (assetUrl) => {
            const assetResponse = await fetch(assetUrl);
            if (!assetResponse || !assetResponse.ok) {
              throw new Error(`install failed: could not fetch ${assetUrl}`);
            }
            await cache.put(assetUrl, assetResponse);
          })
        );
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_VERSION)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put('./', copy));
          }
          return response;
        })
        .catch(() =>
          caches
            .open(CACHE_VERSION)
            .then((cache) => cache.match('./'))
            .then((cached) => cached || Response.error())
        )
    );
    return;
  }

  event.respondWith(
    caches
      .open(CACHE_VERSION)
      .then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((response) => {
            if (response && response.ok) {
              const copy = response.clone();
              cache.put(request, copy);
            }
            return response;
          });
        })
      )
  );
});
