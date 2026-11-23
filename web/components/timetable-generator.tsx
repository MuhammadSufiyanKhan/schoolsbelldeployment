"use client";
import { useState } from "react";

type Res = { cfg: { days: number; periods: number }; classes: { id: string; label: string; subjects: Record<string, { name: string; teacher: string }> }[]; placed: { class_id: string; day: number; period: number; subject_id: string }[]; unplaced: { class: string; subject: string; missing: number }[] };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function TimetableGenerator({ classes, save }: { classes: { id: string; label: string }[]; save: (fd: FormData) => Promise<void> }) {
  const [sel, setSel] = useState<string[]>(classes.map((c) => c.id)); const [rules, setRules] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [res, setRes] = useState<Res | null>(null);
  async function go() {
    setBusy(true); setErr(""); setRes(null);
    try { const r = await fetch("/api/ai/timetable", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rules, class_ids: sel }) }); const j = await r.json(); if (!r.ok) setErr(j.error || "Failed"); else setRes(j); }
    catch { setErr("No connection. The AI needs internet."); }
    setBusy(false);
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 text-sm">{classes.map((c) => <label key={c.id} className="flex items-center gap-1"><input type="checkbox" checked={sel.includes(c.id)} onChange={(e) => setSel((x) => (e.target.checked ? [...x, c.id] : x.filter((y) => y !== c.id)))} />{c.label}</label>)}</div>
      <div data-online-only="">
        <textarea rows={5} value={rules} onChange={(e) => setRules(e.target.value)} placeholder={"Write your rules the way you would tell a colleague. Example:\nMonday to Friday, 7 periods. Maths in the first two periods. Maths 6 periods a week, English 5. Friday has no more than 2 of the same subject. Mr Ahmed is not available on Thursday."} />
        <div className="mt-2 flex items-center gap-3"><button type="button" disabled={busy || !sel.length} onClick={go} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 dark:text-black">{busy ? "Building…" : "✨ Build the timetable"}</button>{err && <span className="text-sm text-red-600">{err}</span>}</div>
      </div>
      {res && (
        <form action={save} className="space-y-4">
          <input type="hidden" name="placed" value={JSON.stringify(res.placed)} /><input type="hidden" name="class_ids" value={JSON.stringify(res.classes.map((c) => c.id))} />
          {res.unplaced.length > 0 && <div className="rounded-lg border border-amber-500 p-3 text-sm">Could not fit: {res.unplaced.map((u) => `${u.class} ${u.subject} (${u.missing} period${u.missing > 1 ? "s" : ""})`).join("; ")}. Relax a rule, or save and fill the rest by hand.</div>}
          {res.classes.map((c) => (
            <div key={c.id} className="overflow-x-auto"><h3 className="mb-1 font-semibold">{c.label}</h3>
              <table className="w-full text-xs"><thead><tr><th></th>{DAYS.slice(0, res.cfg.days).map((d) => <th key={d}>{d}</th>)}</tr></thead><tbody>
                {Array.from({ length: res.cfg.periods }, (_, i) => i + 1).map((p) => <tr key={p}><td className="pr-2 text-mute">{p}</td>{DAYS.slice(0, res.cfg.days).map((_, d) => { const s = res.placed.find((x) => x.class_id === c.id && x.day === d && x.period === p); const sb = s && c.subjects[s.subject_id]; return <td key={d} className="border border-line p-1">{sb ? <>{sb.name}<div className="text-mute">{sb.teacher}</div></> : "—"}</td>; })}</tr>)}
              </tbody></table></div>))}
          <p className="text-sm text-mute">Saving replaces the current timetable of these classes. Nothing changes until you press Save. The database refuses any clash.</p>
          <button className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white dark:text-black">Save this timetable</button>
        </form>)}
    </div>
  );
}
