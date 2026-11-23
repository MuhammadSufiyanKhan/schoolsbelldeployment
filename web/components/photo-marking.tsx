"use client";
import { useRef, useState } from "react";

type Opt = { id: string; name: string };
type Q = { number: string; student_answer: string; marks_awarded: number; max_marks: number; reason: string; legible?: boolean };

/** Shrinks a phone photo (often 5-10 MB) to a readable ~1600px JPEG so uploads are quick, even on a weak connection. */
async function shrink(file: File): Promise<File> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.82));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch { return file; }
}

export default function PhotoMarking({ examId, students, subjects, save }: { examId: string; students: Opt[]; subjects: Opt[]; save: (fd: FormData) => Promise<void> }) {
  const [student, setStudent] = useState(students[0]?.id ?? "");
  const [subject, setSubject] = useState(subjects[0]?.id ?? "");
  const [scheme, setScheme] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [qs, setQs] = useState<Q[] | null>(null);
  const [note, setNote] = useState("");
  const [examTotal, setExamTotal] = useState(100);
  const input = useRef<HTMLInputElement>(null);

  async function run() {
    setError(""); setQs(null);
    if (!files.length) return setError("Add at least one photo of the answer sheet.");
    if (scheme.trim().length < 10) return setError("Paste the model answers with the marks for each question.");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("exam_id", examId); fd.set("student_id", student); fd.set("subject_id", subject); fd.set("model_answer", scheme);
      for (const f of files) fd.append("images", await shrink(f));
      const r = await fetch("/api/ai/mark", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "The AI could not mark this sheet.");
      setQs(j.questions); setNote(j.note || ""); setExamTotal(j.examTotal);
    } catch (e) { setError((e as Error).message || "Something went wrong. Please try again."); }
    finally { setBusy(false); }
  }

  const sum = (qs ?? []).reduce((a, q) => a + q.marks_awarded, 0), max = (qs ?? []).reduce((a, q) => a + q.max_marks, 0);
  const scaled = max ? Math.round((sum / max) * examTotal * 2) / 2 : 0;
  const field = "w-full rounded-lg border border-line bg-card px-3 py-2 text-sm";
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-xs font-medium text-mute">Student<select value={student} onChange={(e) => setStudent(e.target.value)} className={field}>{students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="text-xs font-medium text-mute">Subject<select value={subject} onChange={(e) => setSubject(e.target.value)} className={field}>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      </div>
      <label className="block text-xs font-medium text-mute">Model answers and marks (type or paste)
        <textarea value={scheme} onChange={(e) => setScheme(e.target.value)} rows={6} placeholder={"Q1 (2 marks): Capital of Pakistan - Islamabad\nQ2 (3 marks): Photosynthesis makes food using sunlight, water and carbon dioxide"} className={field} /></label>
      <div>
        <input ref={input} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])].slice(0, 6))} />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => input.current?.click()} className="rounded-lg border border-line px-4 py-2 text-sm font-semibold">📷 Add photo of a page</button>
          {files.map((f, i) => <span key={i} className="flex items-center gap-1 rounded-full bg-line px-3 py-1 text-xs">{f.name.slice(0, 18)}<button type="button" aria-label="Remove photo" onClick={() => setFiles(files.filter((_, j) => j !== i))}>✕</button></span>)}
        </div>
        <p className="mt-1 text-xs text-mute">Up to 6 pages, in order. Use good light and keep the page flat. Photos are only used for this marking and are not stored.</p>
      </div>
      <button type="button" onClick={run} disabled={busy} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 dark:text-black">{busy ? "Reading the sheet…" : "✨ Mark with AI"}</button>
      {error && <div role="alert" className="rounded-lg bg-red-500/15 px-4 py-2 text-sm text-red-700 dark:text-red-300">{error}</div>}

      {qs && (
        <form action={save} className="space-y-3 rounded-xl border border-line p-3">
          <p className="text-sm font-semibold">Check the AI's marking. Change anything that is wrong, then confirm.</p>
          <input type="hidden" name="student_id" value={student} /><input type="hidden" name="subject_id" value={subject} />
          <input type="hidden" name="rows" value={JSON.stringify(qs)} />
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-line text-left text-xs uppercase text-mute"><th className="p-2">Q</th><th className="p-2">Student wrote</th><th className="p-2">Marks</th><th className="p-2">Reason</th></tr></thead>
            <tbody>{qs.map((q, i) => (
              <tr key={i} className="border-b border-line align-top">
                <td className="p-2 font-medium">{q.number}{q.legible === false && <span title="The AI could not read this" className="ml-1 text-amber-600">⚠</span>}</td>
                <td className="p-2 text-mute">{q.student_answer || "—"}</td>
                <td className="p-2 whitespace-nowrap"><input type="number" step="0.5" min={0} max={q.max_marks} value={q.marks_awarded} onChange={(e) => setQs(qs.map((x, j) => (j === i ? { ...x, marks_awarded: Math.min(x.max_marks, Math.max(0, Number(e.target.value))) } : x)))} className="!w-20 rounded border border-line bg-card px-2 py-1" /> / {q.max_marks}</td>
                <td className="p-2">{q.reason}</td></tr>))}</tbody></table></div>
          {note && <p className="rounded bg-amber-500/10 p-2 text-sm">AI note: {note}</p>}
          <p className="text-sm">Total <b>{sum} / {max}</b>{max !== examTotal && <> → will be saved as <b>{scaled} / {examTotal}</b> for this exam</>}</p>
          <button className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white dark:text-black">Confirm and save marks</button>
        </form>
      )}
    </div>
  );
}
