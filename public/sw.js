const CACHE_VERSION = 'gem-delve-__BUILD_ID__';
const PRECACHE_URLS = ['./manifest.webmanifest', './icons/icon-192.png'];

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
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      try {
        const pageResponse = await fetch('./', { cache: 'reload' });
        if (!pageResponse || !pageResponse.ok) throw new Error('install failed: could not fetch the page');
        const assetUrls = collectAssetUrls(await pageResponse.clone().text());
        const responses = await Promise.all(
          [...assetUrls, ...PRECACHE_URLS].map(async (url) => {
            const response = await fetch(url, { cache: 'reload' });
            if (!response || !response.ok) throw new Error(`install failed: could not fetch ${url}`);
            return [url, response];
          })
        );
        await cache.put('./', pageResponse);
        for (const [url, response] of responses) await cache.put(url, response);
      } catch (error) {
        await caches.delete(CACHE_VERSION);
        throw error;
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('gem-delve-') && key !== CACHE_VERSION)
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
        .catch(() => caches.match('./', { ignoreVary: true }).then((cached) => cached || Response.error()))
    );
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreVary: true }).then((cached) => cached || fetch(request))
  );
});
