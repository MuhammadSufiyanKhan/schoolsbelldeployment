// Schoolwell service worker: installable app + works without internet for the attendance screen.
// Only the attendance page and static assets are cached; everything else always goes to the network.
const PAGES = "sw-pages-v2", STATIC = "sw-static-v2";
const CACHED_PAGES = ["/attendance"];
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== PAGES && k !== STATIC) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {           // cache-first: fingerprinted assets
    e.respondWith(caches.open(STATIC).then(async (c) => (await c.match(req)) || fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; })));
    return;
  }
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        if (r.ok && CACHED_PAGES.includes(url.pathname)) (await caches.open(PAGES)).put(url.pathname, r.clone());
        return r;
      } catch {
        const hit = CACHED_PAGES.includes(url.pathname) ? await (await caches.open(PAGES)).match(url.pathname) : undefined;
        return hit || new Response("<meta name=viewport content='width=device-width'><body style='font-family:sans-serif;padding:2rem'><h2>You're offline</h2><p>Open the Attendance page once while online and it will work offline. Everything else needs a connection.</p>", { headers: { "Content-Type": "text/html" } });
      }
    })());
  }
});
