"use client";
import { useEffect, useState } from "react";

/** Tells the person when there is no connection, and stops changes that cannot be saved offline from failing in confusing ways.
 *  Forms marked data-offline-ok (attendance) keep their own offline queue and are left alone. */
export default function OfflineBanner() {
  const [online, setOnline] = useState(true);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => { setOnline(true); setBlocked(false); }, down = () => setOnline(false);
    const guard = (e: Event) => {
      if (navigator.onLine) return;
      const form = e.target as HTMLFormElement | null;
      if (form && form.dataset && form.dataset.offlineOk !== undefined) return;
      e.preventDefault(); e.stopPropagation(); setBlocked(true);
    };
    window.addEventListener("online", up); window.addEventListener("offline", down);
    document.addEventListener("submit", guard, true);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); document.removeEventListener("submit", guard, true); };
  }, []);
  if (online) return null;
  return (
    <div role="status" className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm">
      <b>You're offline.</b> You can read pages you've opened before, and mark attendance (it is sent when you're back online).
      {blocked && <div className="mt-1 font-semibold text-red-700 dark:text-red-300">That change needs an internet connection, so it was not sent. Please try again when you're online.</div>}
    </div>
  );
}
