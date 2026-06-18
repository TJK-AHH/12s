/* 12s service worker — network-first for same-origin GETs so updates show when
 * online, with a cache fallback for offline. Firebase/Google/CDN requests are
 * left untouched. Bump CACHE to force a clean refresh. */
const CACHE = '12s-v2';
const ASSETS = ['./','index.html','game.html','engine.js','net.js','12s.png','icon-512.png','manifest.json','start.mp3','turn.mp3','win.mp3'];
self.addEventListener('install', (e) => { e.waitUntil((async () => {
  const c = await caches.open(CACHE);
  await Promise.allSettled(ASSETS.map((a) => c.add(a)));
  self.skipWaiting();
})()); });
self.addEventListener('activate', (e) => { e.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
  self.clients.claim();
})()); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith((async () => {
    try {
      const fresh = await fetch(e.request);
      const c = await caches.open(CACHE); c.put(e.request, fresh.clone());
      return fresh;
    } catch (err) {
      const cached = await caches.match(e.request);
      if (cached) return cached;
      throw err;
    }
  })());
});
