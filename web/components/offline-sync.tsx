"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type State = "queued" | "sending" | "done" | "failed" | "unknown";
type Item = { id: string; at: number; path: string; entries: [string, string][]; label: string; state: State; note?: string };

const KEY = "sw_queue_v1";
// Never possible offline: signing in/out, passwords, creating logins, joining. (Forms inside the side menu are online-only too.)
const ONLINE_ONLY_PATHS = ["/login", "/join", "/account", "/staff/new"];
const read = (): Item[] => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } };
const write = (q: Item[]) => { try { localStorage.setItem(KEY, JSON.stringify(q)); } catch { /* storage full or blocked */ } };
const newId = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now());

/** Only ONE window may send the saved changes at a time: every window of the app shares the same list, and two windows sending together
 *  would send each change twice. Uses the browser's Web Locks; falls back to a short lease in localStorage where those are missing. */
async function withLock<T>(fn: () => Promise<T>, ifAvailable = false): Promise<T | undefined> {
  if (navigator.locks) return navigator.locks.request("schoolwell-queue", { ifAvailable }, async (lock) => (lock ? fn() : undefined));
  const LEASE = "sw_queue_lock", me = newId();
  try {
    const cur = JSON.parse(localStorage.getItem(LEASE) || "null");
    if (cur && Date.now() - cur.at < 60000) return undefined;
    localStorage.setItem(LEASE, JSON.stringify({ me, at: Date.now() }));
    await new Promise((r) => setTimeout(r, 60));
    if (JSON.parse(localStorage.getItem(LEASE) || "{}").me !== me) return undefined;
    try { return await fn(); } finally { localStorage.removeItem(LEASE); }
  } catch { return undefined; }
}

/** Posts one saved change exactly as the browser would have posted the form. The page's own address is the target, and the
 *  hidden $ACTION fields in the form data identify the action, so no special server code is needed. */
async function send(item: Item): Promise<Item> {
  const body = new FormData();
  for (const [k, v] of item.entries) body.append(k, v);
  try {
    const r = await fetch(item.path, { method: "POST", body, credentials: "same-origin", redirect: "follow" });
    const u = new URL(r.url);
    const said = u.searchParams.get("msg") || u.searchParams.get("err") || "";
    if (u.pathname === "/login") return { ...item, state: "failed", note: "You were signed out. Sign in again, then use Retry." };
    if (u.searchParams.get("denied")) return { ...item, state: "failed", note: "Your account is not allowed to do this." };
    if (r.status >= 500) return { ...item, state: "failed", note: "The server had a problem. Use Retry in a moment." };
    // every action ends in a redirect; none means the action did not run (for example the app was updated after this was saved)
    if (!r.redirected) return { ...item, state: "unknown", note: "Could not confirm this was saved. Check the record, then Retry or Discard." };
    return { ...item, state: "done", note: said || "Saved." };
  } catch {
    return { ...item, state: "unknown", note: "The connection dropped while sending. It may or may not have been saved: check the record, then Retry or Discard." };
  }
}

/** Offline support for every form: while offline, a change is kept on this device; when the connection returns it is sent in order. */
export default function OfflineSync() {
  const router = useRouter();
  const [online, setOnline] = useState(true);
  const [items, setItems] = useState<Item[]>([]);
  const [notice, setNotice] = useState("");
  const busy = useRef(false);

  const run = useCallback(async () => {
    if (busy.current || !navigator.onLine) return;
    busy.current = true;
    let sentAny = false;
    try {
      await withLock(async () => {
        for (;;) {
          const next = read().find((i) => i.state === "queued");                 // always the current shared list, oldest first
          if (!next) break;
          let q = read().map((i) => (i.id === next.id ? { ...i, state: "sending" as State } : i)); write(q); setItems(q);
          const result = await send({ ...next, state: "sending" });
          q = read().map((i) => (i.id === result.id ? result : i)); write(q); setItems(q);
          if (result.state === "done") sentAny = true;
          if (result.state === "unknown") break;                                 // do not pile more changes on top of an uncertain one
        }
      });
    } finally { busy.current = false; }
    if (sentAny) { router.refresh(); window.dispatchEvent(new Event("sw-refresh")); }
  }, [router]);

  useEffect(() => {
    setOnline(navigator.onLine);
    setItems(read());
    // a change that was mid-send when the app closed has an unknown result: never resend it automatically.
    // (Only when no other window is sending right now, otherwise this would wrongly mark a live send.)
    void withLock(async () => {
      const q0 = read().map((i) => (i.state === "sending" ? { ...i, state: "unknown" as State, note: "The app closed while sending. It may or may not have been saved: check the record, then Retry or Discard." } : i));
      write(q0); setItems(q0);
    }, true).then(() => { if (navigator.onLine) void run(); });
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) setItems(read()); };        // another window changed the list
    window.addEventListener("storage", onStorage);
    const up = () => { setOnline(true); setNotice(""); void run(); }, down = () => setOnline(false);
    const onSubmit = (e: Event) => {
      if (navigator.onLine) return;
      const form = e.target as HTMLFormElement | null;
      if (!form || form.dataset?.offlineOk !== undefined) return;                 // attendance has its own queue
      const submitter = (e as SubmitEvent).submitter as HTMLElement | null;
      let data: FormData; try { data = new FormData(form, submitter ?? undefined); } catch { data = new FormData(form); }
      const entries = [...data.entries()].filter((x): x is [string, string] => typeof x[1] === "string");
      if (!entries.some(([k]) => k.startsWith("$ACTION_"))) return;             // a search/filter form is not a change: let it navigate
      e.preventDefault(); e.stopPropagation();
      if (form.closest("aside") || form.dataset?.onlineOnly !== undefined || ONLINE_ONLY_PATHS.includes(location.pathname)) {
        setNotice("This needs an internet connection (signing in or out, passwords, new staff logins). Please try again when you're online."); return;
      }
      const title = document.querySelector("main h1")?.textContent?.trim() || document.title;
      const hint = entries.filter(([k, v]) => !k.startsWith("$") && v && v.length < 40 && !/^[0-9a-f-]{36}$/i.test(v)).slice(0, 2).map(([, v]) => v).join(", ");
      const item: Item = { id: newId(), at: Date.now(), path: location.pathname + location.search, entries, label: hint ? `${title}: ${hint}` : title, state: "queued" };
      const q = [...read(), item]; write(q); setItems(q);
      setNotice("Saved on this device. It will be sent automatically when you're back online.");
    };
    window.addEventListener("online", up); window.addEventListener("offline", down);
    document.addEventListener("submit", onSubmit, true);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); document.removeEventListener("submit", onSubmit, true); window.removeEventListener("storage", onStorage); };
  }, [run]);

  const update = (fn: (q: Item[]) => Item[]) => { const q = fn(read()); write(q); setItems(q); };
  const retry = (id: string) => { update((q) => q.map((i) => (i.id === id ? { ...i, state: "queued", note: undefined } : i))); void run(); };
  const discard = (id: string) => update((q) => q.filter((i) => i.id !== id));
  const pending = items.filter((i) => i.state === "queued" || i.state === "sending").length;
  const badge = (s: State) => ({ queued: "bg-amber-500/15 text-amber-800 dark:text-amber-300", sending: "bg-sky-500/15 text-sky-800 dark:text-sky-300", done: "bg-teal-500/15 text-teal-800 dark:text-teal-300", failed: "bg-red-500/15 text-red-700 dark:text-red-300", unknown: "bg-red-500/15 text-red-700 dark:text-red-300" }[s]);
  const word = (s: State) => ({ queued: "waiting", sending: "sending…", done: "sent", failed: "failed", unknown: "check" }[s]);

  return (
    <>
      {!online && (
        <div role="status" className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm">
          <b>You're offline.</b> Every screen opens from this device with the data from your last visit. Changes you save are kept on this device and sent when you're back online.
          {notice && <div className="mt-1 font-semibold">{notice}</div>}
        </div>
      )}
      {online && notice && <div role="status" className="mb-4 rounded-lg bg-red-500/10 px-4 py-2 text-sm">{notice}</div>}
      {items.length > 0 && (
        <div className="mb-4 rounded-xl border border-line bg-card p-3 text-sm" aria-live="polite">
          <div className="mb-2 flex items-center justify-between gap-2">
            <b>{pending ? `${pending} change${pending > 1 ? "s" : ""} waiting to be sent` : "Changes saved on this device"}</b>
            <span className="flex gap-2">
              {pending > 0 && online && <button type="button" onClick={() => void run()} className="rounded-lg bg-brand px-3 py-1 text-xs font-semibold text-white dark:text-black">Send now</button>}
              {items.some((i) => i.state === "done") && <button type="button" onClick={() => update((q) => q.filter((i) => i.state !== "done"))} className="rounded-lg border border-line px-3 py-1 text-xs">Clear sent</button>}
            </span>
          </div>
          <ul className="space-y-1">
            {items.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-2 border-t border-line pt-1">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge(i.state)}`}>{word(i.state)}</span>
                <span className="min-w-0 flex-1 truncate">{i.label}</span>
                {i.note && <span className="w-full text-xs text-mute">{i.note}</span>}
                {(i.state === "failed" || i.state === "unknown") && <><button type="button" onClick={() => retry(i.id)} className="text-xs text-brand underline">Retry</button><button type="button" onClick={() => discard(i.id)} className="text-xs text-red-600 underline">Discard</button></>}
                {i.state === "queued" && <button type="button" onClick={() => discard(i.id)} className="text-xs text-red-600 underline">Discard</button>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
