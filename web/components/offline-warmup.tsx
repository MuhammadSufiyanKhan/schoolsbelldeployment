"use client";
import { useEffect } from "react";

const CACHE = "sw-pages-v3", STATIC = "sw-static-v3", STAMP = "sw_warm";
/** The attendance sheet is saved per class (not per date), so any date picked offline finds the class's page. */
export const keyFor = (u: string) => {
  const x = new URL(u, location.origin);
  if (x.pathname === "/attendance") { const c = x.searchParams.get("class_id"); return x.origin + "/attendance" + (c ? `?class_id=${c}` : ""); }
  return x.href;
};

/** After sign-in (and again after a reconnect, at most every few hours) saves every screen this person may use on the device,
 *  so the whole interface opens without internet. Data shown offline is the copy from the last time it was online. */
export default function OfflineWarmup({ uid }: { uid: string }) {
  useEffect(() => {
    if (!("caches" in window)) return;
    let stopped = false;
    async function run(force: boolean) {
      if (!navigator.onLine || stopped) return;
      const last = JSON.parse(localStorage.getItem(STAMP) || "{}");
      if (!force && last.uid === uid && Date.now() - last.at < 4 * 3600e3) return;
      try {
        const r = await fetch("/api/offline-urls", { cache: "no-store" });
        if (!r.ok) return;
        const { urls } = (await r.json()) as { urls: string[] };
        const cache = await caches.open(CACHE);
        const assets = new Set<string>();     // the scripts/styles each screen needs: without them a saved screen loads and then crashes offline
        let i = 0;
        const worker = async () => {
          while (i < urls.length && !stopped) {
            const u = urls[i++];
            try {
              const res = await fetch(u, { credentials: "same-origin", cache: "no-store" });
              if (res.ok && !res.redirected && res.headers.get("content-type")?.includes("text/html")) {
                const copy = res.clone();
                await cache.put(keyFor(u), res);
                for (const m of (await copy.text()).matchAll(/static\/[\w\-./%~]+\.(?:js|css|woff2?)/g)) assets.add("/_next/" + m[0]);
              }
            } catch { /* one page failing must not stop the rest */ }
          }
        };
        await Promise.all([worker(), worker()]);
        const files = await caches.open(STATIC);
        const todo = [...assets];
        const loader = async () => {
          for (let u = todo.pop(); u && !stopped; u = todo.pop()) {
            try { if (!(await files.match(u))) { const res = await fetch(u); if (res.ok) await files.put(u, res); } } catch { /* fetched later when needed */ }
          }
        };
        await Promise.all([loader(), loader(), loader(), loader(), loader()]);
        localStorage.setItem(STAMP, JSON.stringify({ uid, at: Date.now() }));
      } catch { /* try again next time */ }
    }
    const t = setTimeout(() => void run(false), 2500);
    const online = () => void run(false);
    window.addEventListener("online", online);
    return () => { stopped = true; clearTimeout(t); window.removeEventListener("online", online); };
  }, [uid]);
  return null;
}
