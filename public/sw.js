// Service Worker: game bundle cache (Cache Storage API).
// ---------------------------------------------------------------------------
// - This file lives in public/ so it is copied as-is to dist/ at build time.
// - Cache name comes from the `?v=` query at register time (see src/core/bootCache.js):
//     /sw.js?v=1.0.0  ->  cache "jungle-v1.0.0"
//   Every new build (version bump in package.json) creates a new cache,
//   the new SW skipWaits + cleans old caches -> never stuck on an old build.
// - Strategy:
//     + App shell (/, /index.html): precached at install.
//     + Same-origin GET (js/css bundle): cache-first, on miss go to network then
//       save it -> next visit opens near-instantly, offline still playable.
//     + Offline navigation: serve cached index.html.
//     + Other requests (external CDNs...): pass through, never cached.
//
// IMPORTANT NOTE ("is the cache built per device?"):
//   The bundle (js/css/html) is built exactly once via `npm run build`, IDENTICAL
//   for every device. This Cache Storage lives ON EACH BROWSER /
//   EACH DEVICE: every machine downloads the bundle and keeps its own copy after the
//   first visit. There is no "per-device cache build" step —
//   whichever device visits first caches for itself.

const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE_NAME = `jungle-v${VERSION}`;
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './generated/textures/manifest.json',
  './generated/textures/bark-color.svg',
  './generated/textures/bark-bump.svg',
  './generated/textures/leaf-color.svg',
  './generated/textures/leaf-bump.svg',
  './generated/textures/rock-color.svg',
  './generated/textures/rock-bump.svg',
  './generated/textures/cactus-color.svg',
  './generated/textures/cactus-bump.svg',
  './generated/textures/ground-color.svg',
  './generated/textures/ground-bump.svg',
  './generated/textures/sand-color.svg',
  './generated/textures/sand-bump.svg',
  './generated/textures/water-color.svg',
  './generated/textures/water-bump.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()), // offline on first visit: ignore precache errors
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('jungle-v') && k !== CACHE_NAME)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // external CDN: skip

  // Page navigation: network first, fall back to the cached app shell offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  // Bundle/assets: cache first, on miss go to network + save.
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((res) => {
          // Only cache valid responses (avoid locking 404/500 errors into cache).
          if (res && (res.status === 200 || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return res;
        }),
    ),
  );
});
