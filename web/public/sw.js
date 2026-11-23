// Schoolwell service worker.
// - After sign-in the app saves every screen the person may use (see components/offline-warmup.tsx), so the whole interface opens
//   without internet. Online, pages are always fetched fresh (the saved copy is only used if the network fails or is very slow).
// - Signing out wipes all of it from the device.
const PAGES = "sw-pages-v3", STATIC = "sw-static-v3";
const KEEP = ["/", "/attendance", "/students", "/classes", "/fees", "/notices", "/timetable", "/exams", "/portal", "/staff", "/staff-attendance", "/leave", "/payroll", "/admissions", "/account", "/audit"];
const LABELS = { "/": "Dashboard", "/attendance": "Attendance", "/students": "Students", "/students/new": "Add student", "/classes": "Classes", "/fees": "Fees", "/notices": "Notices", "/timetable": "Timetable", "/exams": "Exams", "/portal": "My children", "/staff": "Staff", "/staff/new": "Add staff", "/staff-attendance": "Staff attendance", "/leave": "Leave", "/payroll": "Payroll", "/admissions": "Admissions", "/account": "Account", "/audit": "Audit log" };
const MAX_PAGES = 80, SLOW_MS = 7000;
const cacheable = (u) => KEEP.some((p) => u.pathname === p || (p !== "/" && u.pathname.startsWith(p + "/")));
// The attendance sheet is saved per class, not per date: offline, any date finds the class's saved sheet.
const keyFor = (url) => { const u = new URL(url); if (u.pathname === "/attendance") { const c = u.searchParams.get("class_id"); return u.origin + "/attendance" + (c ? `?class_id=${c}` : ""); } return u.href; };

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== PAGES && k !== STATIC) await caches.delete(k);
  await self.clients.claim();
})()));

async function startPage() {
  const keys = (await (await caches.open(PAGES)).keys()).map((r) => new URL(r.url));
  const links = keys.filter((u) => u.pathname !== "/attendance" || u.search).sort((a, b) => a.pathname.localeCompare(b.pathname))
    .map((u) => `<li><a href="${u.pathname}${u.search}">${LABELS[u.pathname] ? LABELS[u.pathname] + (u.search ? " (class)" : "") : u.pathname}</a></li>`).join("");
  return new Response(
    "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>Schoolwell · offline</title>" +
    "<body style='font-family:system-ui,sans-serif;margin:0;background:#f6f7f5;color:#14201f'><div style='max-width:30rem;margin:0 auto;padding:2rem 1rem'>" +
    "<h2 style='color:#0f766e'>You're offline</h2><p>This screen isn't saved on this device. Fetching new data and saving changes need internet; the screens below are saved and open offline" +
    " (they show the data from the last time you were online). Attendance you mark is sent automatically when you're back online.</p>" +
    (links ? `<ul style='line-height:2'>${links}</ul>` : "<p><b>Nothing is saved yet.</b> Connect to the internet and sign in once; the app will then keep its screens on this device.</p>") +
    "<button onclick='location.reload()' style='background:#0f766e;color:#fff;border:0;border-radius:8px;padding:.6rem 1.2rem;font-size:1rem'>Try again</button></div>",
    { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 503 });
}

async function remember(url, response) {
  const cache = await caches.open(PAGES);
  await cache.put(keyFor(url), response);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_PAGES; i++) await cache.delete(keys[i]);   // keep the most recent screens only
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
    const saved = await (await caches.open(PAGES)).match(keyFor(req.url));
    const network = fetch(req).then((r) => {
      // Only a normal signed-in page is saved: never a redirect (e.g. to the login screen) or an error.
      if (r.ok && !r.redirected && r.headers.get("content-type")?.includes("text/html")) e.waitUntil(remember(req.url, r.clone()));
      return r;
    });
    try {
      if (!saved) return await network;
      return await Promise.race([network, new Promise((_, reject) => setTimeout(() => reject(new Error("slow")), SLOW_MS))]);   // slow network: use the saved copy
    } catch {
      return saved || startPage();
    }
  })());
});
