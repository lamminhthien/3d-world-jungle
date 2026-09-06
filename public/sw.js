// Service Worker: bundle cache cho game (Cache Storage API).
// ---------------------------------------------------------------------------
// - File này nằm trong public/ nên được copy nguyên vẹn ra dist/ khi build.
// - Tên cache lấy từ query `?v=` lúc register (xem src/core/bootCache.js):
//     /sw.js?v=1.0.0  ->  cache "jungle-v1.0.0"
//   Mỗi bản build mới (bump version trong package.json) sẽ tạo cache mới,
//   SW mới tự skipWaiting + dọn cache cũ -> không bao giờ kẹt bản cũ.
// - Chiến lược:
//     + App shell (/, /index.html): precache lúc install.
//     + Same-origin GET (js/css bundle): cache-first, miss thì lên mạng rồi
//       lưu lại -> lần chơi sau mở gần như tức thì, rớt mạng vẫn chơi được.
//     + Navigation khi offline: trả index.html trong cache.
//     + Request khác (CDN ngoài...): cho đi thẳng, không cache.
//
// LƯU Ý QUAN TRỌNG (trả lời câu hỏi "cache có build riêng từng thiết bị?"):
//   Bundle (js/css/html) chỉ build 1 lần duy nhất lúc `npm run build`, GIỐNG
//   NHAU cho mọi thiết bị. Còn Cache Storage này nằm TRÊN TỪNG TRÌNH DUYỆT /
//   TỪNG THIẾT BỊ: mỗi máy tải bundle về và giữ một bản copy riêng sau lần
//   vào đầu tiên. Không có bước "build cache riêng cho từng thiết bị" —
//   thiết bị nào vào trước thì máy đó tự cache cho chính nó.

const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE_NAME = `jungle-v${VERSION}`;
const SHELL = ['./', './index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()), // offline ngay lần đầu: bỏ qua lỗi precache
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
  if (url.origin !== self.location.origin) return; // CDN ngoài: bỏ qua

  // Điều hướng trang: mạng trước, rớt mạng thì trả app shell trong cache.
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

  // Bundle/assets: cache trước, miss thì lên mạng + lưu lại.
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((res) => {
          // Chỉ cache response hợp lệ (tránh khóa lỗi 404/500 vào cache).
          if (res && (res.status === 200 || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return res;
        }),
    ),
  );
});
