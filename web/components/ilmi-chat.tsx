"use client";
import { useRef, useState } from "react";

type Proposal = { kind: string; summary: string; [k: string]: unknown };
type Msg = { from: "me" | "ilmi"; text: string; proposal?: Proposal; state?: "pending" | "done" | "cancelled" };
const IDEAS = ["Mark Class 1-A present except two children", "Which students are under 75% attendance?", "Write a notice: school closes early on Friday at 12", "Arrange cover for a teacher who is away today"];
const localToday = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export default function IlmiChat() {
  const [msgs, setMsgs] = useState<Msg[]>([{ from: "ilmi", text: "Hello! I'm Ilmi. Tell me what you need in a sentence. I prepare it, you check it, and nothing happens until you press Confirm." }]);
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const push = (m: Msg) => { setMsgs((x) => [...x, m]); setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth" }), 50); };

  async function send(t = text) {
    t = t.trim(); if (!t || busy) return;
    setText(""); push({ from: "me", text: t }); setBusy(true);
    try {
      const r = await fetch("/api/ilmi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: t, today: localToday() }) });
      const j = await r.json();
      push(r.ok ? { from: "ilmi", text: j.reply, proposal: j.proposal, state: j.proposal ? "pending" : undefined } : { from: "ilmi", text: j.error || "Sorry, that did not work." });
    } catch { push({ from: "ilmi", text: "I couldn't reach the server. Check your connection. (Ilmi needs internet.)" }); }
    setBusy(false);
  }
  async function confirm(i: number) {
    const m = msgs[i]; if (!m.proposal) return;
    const r = await fetch("/api/ilmi/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(m.proposal) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : { ok: false, message: "No connection." };
    setMsgs((x) => x.map((y, k) => (k === i ? { ...y, state: j.ok ? "done" : "pending" } : y)));
    push({ from: "ilmi", text: (j.ok ? "✅ " : "⚠️ ") + (j.message || "Done.") });
  }
  return (
    <div className="flex h-[70vh] flex-col rounded-xl border border-line bg-card">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {msgs.map((m, i) => (
          <div key={i} className={m.from === "me" ? "flex justify-end" : "flex justify-start"}>
            <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${m.from === "me" ? "bg-brand text-white dark:text-black" : "bg-line"}`}>
              {m.text}
              {m.proposal && (
                <div className="mt-2 rounded-lg border border-line bg-card p-3 text-fg">
                  <div className="text-xs font-semibold uppercase text-mute">Prepared for you</div><div className="my-1">{m.proposal.summary}</div>
                  {m.state === "pending" && <div className="mt-2 flex gap-2"><button onClick={() => confirm(i)} className="rounded-lg bg-brand px-3 py-1 text-sm font-semibold text-white dark:text-black">Confirm</button><button onClick={() => setMsgs((x) => x.map((y, k) => (k === i ? { ...y, state: "cancelled" } : y)))} className="rounded-lg border border-line px-3 py-1 text-sm">Cancel</button></div>}
                  {m.state === "done" && <div className="text-xs font-semibold text-teal-700 dark:text-teal-300">Confirmed</div>}
                  {m.state === "cancelled" && <div className="text-xs text-mute">Cancelled. Nothing was changed.</div>}
                </div>)}
            </div>
          </div>))}
        {busy && <div className="text-sm text-mute">Ilmi is thinking…</div>}
        <div ref={end} />
      </div>
      <div className="border-t border-line p-3">
        {msgs.length < 2 && <div className="mb-2 flex flex-wrap gap-2">{IDEAS.map((x) => <button key={x} onClick={() => send(x)} className="rounded-full border border-line px-3 py-1 text-xs">{x}</button>)}</div>}
        <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="flex gap-2" data-online-only="">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask Ilmi…" maxLength={800} className="flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm" />
          <button disabled={busy} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 dark:text-black">Send</button>
        </form>
      </div>
    </div>
  );
}
