"use client";
import { useEffect, useRef, useState } from "react";

type Entry = { subject_id: string; subject: string; classwork_en: string; classwork_ur: string; homework_en: string; homework_ur: string };
type Rec = { lang: string; interimResults: boolean; continuous: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>; resultIndex: number }) => void; onend: () => void; onerror: () => void; start(): void; stop(): void };
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export default function DiaryRecorder({ classes, save }: { classes: { id: string; label: string }[]; save: (fd: FormData) => Promise<void> }) {
  const [cls, setCls] = useState(classes[0]?.id ?? ""); const [date, setDate] = useState(today());
  const [lang, setLang] = useState("ur-PK"); const [text, setText] = useState(""); const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [entries, setEntries] = useState<Entry[] | null>(null);
  const rec = useRef<Rec | null>(null); const base = useRef("");
  const [supported, setSupported] = useState(false);
  useEffect(() => setSupported("SpeechRecognition" in window || "webkitSpeechRecognition" in window), []);

  function toggle() {
    if (listening) { rec.current?.stop(); return; }
    const W = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const R = W.SpeechRecognition ?? W.webkitSpeechRecognition; if (!R) return;
    const r = new R(); r.lang = lang; r.interimResults = true; r.continuous = true; base.current = text ? text + " " : "";
    r.onresult = (e) => { let t = ""; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; setText(base.current + t); };
    r.onend = () => setListening(false); r.onerror = () => { setListening(false); setErr("The microphone could not be used. Type instead, or allow microphone access."); };
    rec.current = r; setErr(""); setListening(true); r.start();
  }
  async function generate() {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/ai/diary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ class_id: cls, text }) });
      const j = await r.json();
      if (!r.ok) setErr(j.error || "Failed"); else if (!j.entries.length) setErr("I couldn't find any subject in that. Mention the subject names."); else setEntries(j.entries);
    } catch { setErr("No connection. The AI needs internet."); }
    setBusy(false);
  }
  const edit = (i: number, k: keyof Entry, v: string) => setEntries((x) => x!.map((e, j) => (j === i ? { ...e, [k]: v } : e)));
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-sm">Class<select value={cls} onChange={(e) => setCls(e.target.value)}>{classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
        <label className="text-sm">Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="text-sm">I will speak in<select value={lang} onChange={(e) => setLang(e.target.value)}><option value="ur-PK">Urdu</option><option value="en-US">English</option></select></label>
      </div>
      <div data-online-only="">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {supported ? <button type="button" onClick={toggle} className={`rounded-lg px-4 py-2 text-sm font-semibold ${listening ? "bg-red-600 text-white" : "bg-brand text-white dark:text-black"}`}>{listening ? "⏹ Stop" : "🎙 Speak the diary"}</button> : <span className="text-xs text-mute">This browser cannot listen. Type the diary below.</span>}
          {listening && <span className="text-sm text-mute">Listening… say each subject’s classwork and homework.</span>}
        </div>
        <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="Example: Maths mein aaj fractions parhaye, homework page 45 ke sawal 1 se 5. English mein poem recite karwai…" />
        <div className="mt-2 flex items-center gap-3"><button type="button" disabled={busy || text.trim().length < 5} onClick={generate} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 dark:text-black">{busy ? "Writing…" : "✨ Write the diary"}</button>{err && <span className="text-sm text-red-600">{err}</span>}</div>
      </div>
      {entries && (
        <form action={save} className="space-y-3">
          <input type="hidden" name="class_id" value={cls} /><input type="hidden" name="date" value={date} /><input type="hidden" name="rows" value={JSON.stringify(entries)} />
          <p className="text-sm text-mute">Read and fix each entry. Parents see it only after you save.</p>
          {entries.map((e, i) => (
            <div key={e.subject_id} className="rounded-xl border border-line p-3">
              <div className="mb-2 flex justify-between"><b>{e.subject}</b><button type="button" className="text-xs text-red-600" onClick={() => setEntries((x) => x!.filter((_, j) => j !== i))}>Remove</button></div>
              <div className="grid gap-2 md:grid-cols-2">
                <label className="text-xs">Classwork (English)<textarea rows={2} value={e.classwork_en} onChange={(v) => edit(i, "classwork_en", v.target.value)} /></label>
                <label className="text-xs">کلاس ورک<textarea rows={2} dir="rtl" lang="ur" value={e.classwork_ur} onChange={(v) => edit(i, "classwork_ur", v.target.value)} /></label>
                <label className="text-xs">Homework (English)<textarea rows={2} value={e.homework_en} onChange={(v) => edit(i, "homework_en", v.target.value)} /></label>
                <label className="text-xs">ہوم ورک<textarea rows={2} dir="rtl" lang="ur" value={e.homework_ur} onChange={(v) => edit(i, "homework_ur", v.target.value)} /></label>
              </div>
            </div>))}
          {entries.length > 0 && <button className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white dark:text-black">Save to the diary</button>}
        </form>)}
    </div>
  );
}
