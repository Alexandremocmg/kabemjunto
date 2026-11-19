/* global CACHE_NAME, PRECACHE, caches, fetch, self, URL, Request */

const scope = self.registration.scope;
const shell = new URL('index.html', scope).href;
const assets = new Set(PRECACHE.map((file) => new URL(file, scope).href));

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        cache.addAll(
          [...assets].map(
            (url) => new Request(url, { cache: 'reload', credentials: 'omit', redirect: 'error' }),
          ),
        ),
      ),
  );
});

// The browser activates an update when the previous version has no open clients.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('kabemjunto-pwa-') && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.headers.has('range')) return;

  const url = new URL(request.url);
  const navigation = request.mode === 'navigate';
  if (navigation) {
    url.search = '';
    if (url.href !== scope && url.href !== shell) return;
  } else if (!assets.has(url.href)) {
    return;
  }

  // Serve the shell and assets from the same build. Other requests go to the network.
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(navigation ? shell : url.href);
      return cached ?? fetch(request);
    }),
  );
});
