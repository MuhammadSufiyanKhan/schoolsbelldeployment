"use client";
import { useState } from "react";

type Stu = { id: string; name: string; roll: string };
type Row = { key: number; file: string; student_id: string; roll: string; answers: string[]; note: string; error?: string };
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file); const s = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s); c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.85));
}

export default function OmrMarking({ students, subjects, save }: { students: Stu[]; subjects: { id: string; name: string }[]; save: (fd: FormData) => Promise<void> }) {
  const [key, setKey] = useState(""); const [options, setOptions] = useState(4); const [subject, setSubject] = useState(subjects[0]?.id ?? "");
  const [rows, setRows] = useState<Row[]>([]); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const answerKey = key.toUpperCase().replace(/[^A-F]/g, "").split("");
  const score = (r: Row) => r.answers.filter((a, i) => a && a === answerKey[i]).length;

  async function read(files: File[]) {
    if (answerKey.length < 1) { setErr("Type the answer key first, for example ABCDDCBA…"); return; }
    setBusy(true); setErr("");
    for (const f of files.slice(0, 40)) {
      const fd = new FormData(); fd.set("image", await shrink(f), "sheet.jpg"); fd.set("questions", String(answerKey.length)); fd.set("options", String(options));
      try {
        const r = await fetch("/api/ai/omr", { method: "POST", body: fd }); const j = await r.json();
        setRows((x) => [...x, r.ok ? { key: Date.now() + Math.random(), file: f.name, student_id: students.find((s) => s.roll && s.roll === j.roll_no)?.id ?? "", roll: j.roll_no, answers: j.answers, note: j.note } : { key: Date.now() + Math.random(), file: f.name, student_id: "", roll: "", answers: [], note: "", error: j.error }]);
      } catch { setErr("No connection. The AI needs internet."); break; }
    }
    setBusy(false);
  }
  const ready = rows.filter((r) => r.student_id && !r.error);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-sm md:col-span-2">Answer key (one letter per question)<input value={key} onChange={(e) => setKey(e.target.value)} placeholder="ABCDDCBAABCD" className="font-mono tracking-widest" /><span className="text-xs text-mute">{answerKey.length} questions</span></label>
        <label className="text-sm">Options per question<select value={options} onChange={(e) => setOptions(Number(e.target.value))}>{[2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></label>
        <label className="text-sm">Subject<select value={subject} onChange={(e) => setSubject(e.target.value)}>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      </div>
      <div data-online-only=""><label className="block text-sm">Photograph the sheets (one photo per student)<input type="file" accept="image/*" multiple capture="environment" disabled={busy} onChange={(e) => void read(Array.from(e.target.files ?? []))} /></label>
        {busy && <p className="mt-1 text-sm text-mute">Reading the sheets…</p>}{err && <p className="mt-1 text-sm text-red-600">{err}</p>}</div>
      {rows.length > 0 && (
        <form action={save} className="space-y-3">
          <input type="hidden" name="subject_id" value={subject} /><input type="hidden" name="total" value={answerKey.length} />
          <input type="hidden" name="rows" value={JSON.stringify(ready.map((r) => ({ student_id: r.student_id, score: score(r), answers: r.answers.join("") })))} />
          <table className="w-full text-sm"><thead><tr className="text-left text-mute"><th>Sheet</th><th>Roll read</th><th>Student</th><th>Score</th><th>Wrong / blank</th></tr></thead><tbody>
            {rows.map((r) => <tr key={r.key} className="border-t border-line align-top"><td>{r.file}</td><td>{r.error ? <span className="text-red-600">{r.error}</span> : r.roll || "?"}</td>
              <td>{!r.error && <select value={r.student_id} onChange={(e) => setRows((x) => x.map((y) => (y.key === r.key ? { ...y, student_id: e.target.value } : y)))}><option value="">— choose —</option>{students.map((s) => <option key={s.id} value={s.id}>{s.roll ? s.roll + " · " : ""}{s.name}</option>)}</select>}</td>
              <td className="font-semibold">{r.error ? "" : `${score(r)} / ${answerKey.length}`}</td>
              <td className="font-mono text-xs">{r.answers.map((a, i) => (a === answerKey[i] ? null : <span key={i} className="mr-1 text-red-600">{i + 1}:{a || "–"}</span>))}{r.note && <div className="font-sans text-mute">{r.note}</div>}</td></tr>)}
          </tbody></table>
          <p className="text-xs text-mute">Check each row against the sheet. Sheets without a student chosen are not saved.</p>
          <button disabled={!ready.length} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 dark:text-black">Confirm and save {ready.length} results</button>
        </form>)}
    </div>
  );
}
