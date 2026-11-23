"use client";
import { useState } from "react";

type Cls = { id: string; label: string; subjects: { id: string; name: string }[] };
type Gen = { title: string; body: Record<string, unknown> };
const LABEL = { paper: "Exam paper", plan: "Lesson plan", test: "MCQ test" } as const;

export default function AcademicsGenerator({ kind, classes, save }: { kind: "paper" | "plan" | "test"; classes: Cls[]; save: (fd: FormData) => Promise<void> }) {
  const [cls, setCls] = useState(classes[0]?.id ?? ""); const [sub, setSub] = useState(""); const [text, setText] = useState(""); const [extra, setExtra] = useState(kind === "plan" ? "daily" : "");
  const [count, setCount] = useState(10); const [files, setFiles] = useState<File[]>([]); const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [res, setRes] = useState<Gen | null>(null);
  const subs = classes.find((c) => c.id === cls)?.subjects ?? [];
  async function go() {
    setBusy(true); setErr(""); setRes(null);
    const fd = new FormData(); fd.set("kind", kind); fd.set("class_id", cls); fd.set("subject_id", sub); fd.set("text", text); fd.set("extra", kind === "plan" ? `Plan type: ${extra}.` : extra); fd.set("count", String(count));
    files.forEach((f) => fd.append("files", f));
    try { const r = await fetch("/api/ai/academics", { method: "POST", body: fd }); const j = await r.json(); if (!r.ok) setErr(j.error || "Failed"); else setRes(j); }
    catch { setErr("No connection. The AI needs internet."); }
    setBusy(false);
  }
  const b = res?.body as { sections?: { name: string; marks_each: number; questions: { q: string; answer: string; marks?: number }[] }[]; items?: { when: string; topic: string; objectives: string; activities: string; homework: string }[]; questions?: { q: string; options: string[]; answer: number; explanation: string }[] } | undefined;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-sm">Class<select value={cls} onChange={(e) => { setCls(e.target.value); setSub(""); }}>{classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
        <label className="text-sm">Subject<select value={sub} onChange={(e) => setSub(e.target.value)}><option value="">—</option>{subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        {kind === "plan" ? <label className="text-sm">Plan<select value={extra} onChange={(e) => setExtra(e.target.value)}><option value="daily">Daily lessons</option><option value="month">Monthly (by week)</option><option value="year">Year plan</option></select></label>
          : <label className="text-sm">{kind === "test" ? "Number of questions" : "Approx. questions"}<input type="number" min={3} max={40} value={count} onChange={(e) => setCount(Number(e.target.value))} /></label>}
      </div>
      <div data-online-only="" className="space-y-2">
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === "plan" ? "Paste the textbook chapters / contents list, or add photos of the contents pages" : "Chapters or topics (for example: Chapter 3 Fractions, Chapter 4 Decimals), or paste the text"} />
        <label className="block text-xs text-mute">Photos or PDF of the book pages (optional, up to 6)<input type="file" accept="image/*,application/pdf" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 6))} /></label>
        <div className="flex items-center gap-3"><button type="button" disabled={busy || !cls} onClick={go} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 dark:text-black">{busy ? "Writing… (up to a minute)" : `✨ Write the ${LABEL[kind].toLowerCase()}`}</button>{err && <span className="text-sm text-red-600">{err}</span>}</div>
      </div>
      {res && b && (
        <form action={save} className="space-y-3 rounded-xl border border-line p-4">
          <input type="hidden" name="kind" value={kind} /><input type="hidden" name="class_id" value={cls} /><input type="hidden" name="subject_id" value={sub} /><input type="hidden" name="chapters" value={text.slice(0, 500)} /><input type="hidden" name="period" value={kind === "plan" ? extra : ""} />
          <input type="hidden" name="body" value={JSON.stringify(res.body)} />
          <label className="block text-sm font-semibold">Title<input name="title" defaultValue={res.title} required /></label>
          <p className="text-xs text-mute">Check every question and answer before you save. The AI can be wrong.</p>
          {b.sections?.map((s, i) => <div key={i}><h3 className="font-semibold">{s.name}</h3><ol className="ml-5 list-decimal space-y-1 text-sm">{s.questions.map((q, j) => <li key={j}>{q.q}<div className="text-xs text-teal-700 dark:text-teal-300">Answer: {q.answer} ({q.marks ?? s.marks_each} marks)</div></li>)}</ol></div>)}
          {b.items?.map((it, i) => <div key={i} className="rounded border border-line p-2 text-sm"><b>{it.when} · {it.topic}</b><p>{it.objectives}</p><p className="text-mute">{it.activities}</p>{it.homework && <p>Homework: {it.homework}</p>}</div>)}
          {b.questions?.map((q, i) => <div key={i} className="text-sm"><b>{i + 1}. {q.q}</b><ul className="ml-5 list-[upper-alpha]">{q.options.map((o, j) => <li key={j} className={j === q.answer ? "font-semibold text-teal-700 dark:text-teal-300" : ""}>{o}</li>)}</ul><div className="text-xs text-mute">{q.explanation}</div></div>)}
          <button className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white dark:text-black">Save</button>
        </form>)}
    </div>
  );
}
