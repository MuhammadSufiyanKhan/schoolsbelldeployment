// Schoolwell service worker.
// - Installable app shell; static assets cached for instant, offline-safe loads.
// - Pages you open are saved. Online you always get the fresh page (the saved copy is only used if the network fails
//   or is very slow); offline you see the last copy you opened. Signing out clears all of it.
const PAGES = "sw-pages-v3", STATIC = "sw-static-v3";
const KEEP = ["/", "/attendance", "/students", "/classes", "/fees", "/notices", "/timetable", "/exams", "/portal", "/staff", "/leave", "/payroll", "/admissions", "/account"];
const MAX_PAGES = 60, SLOW_MS = 7000;
const cacheable = (u) => KEEP.some((p) => u.pathname === p || (p !== "/" && u.pathname.startsWith(p + "/")));

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== PAGES && k !== STATIC) await caches.delete(k);
  await self.clients.claim();
})()));

const offlinePage = () => new Response(
  "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>Offline</title>" +
  "<body style='font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f6f7f5;color:#14201f'>" +
  "<div style='max-width:26rem;padding:2rem;text-align:center'><h2 style='color:#0f766e'>You're offline</h2>" +
  "<p>This page hasn't been opened on this device yet, so it isn't saved. Pages you have opened before still work offline, and attendance you mark is sent when you're back online.</p>" +
  "<button onclick='location.reload()' style='background:#0f766e;color:#fff;border:0;border-radius:8px;padding:.6rem 1.2rem;font-size:1rem'>Try again</button></div>",
  { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 503 });

async function remember(url, response) {
  const cache = await caches.open(PAGES);
  await cache.put(url, response);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_PAGES; i++) await cache.delete(keys[i]);   // keep the most recent pages only
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {      // fingerprinted assets: cache first
    e.respondWith(caches.open(STATIC).then(async (c) => (await c.match(req)) || fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; })));
    return;
  }
  if (req.mode !== "navigate" || !cacheable(url)) return;

  e.respondWith((async () => {
    const saved = await (await caches.open(PAGES)).match(req.url);
    const network = fetch(req).then((r) => {
      // Only a normal signed-in page is saved: never a redirect (e.g. to the login screen) or an error.
      if (r.ok && !r.redirected && r.headers.get("content-type")?.includes("text/html")) e.waitUntil(remember(req.url, r.clone()));
      return r;
    });
    try {
      if (!saved) return await network;
      return await Promise.race([network, new Promise((_, reject) => setTimeout(() => reject(new Error("slow")), SLOW_MS))]);   // slow network: use the saved copy
    } catch {
      return saved || offlinePage();
    }
  })());
});
