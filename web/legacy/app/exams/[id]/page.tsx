import { notFound, redirect } from "next/navigation";
import { guard } from "@/lib/auth";
import { all, one, run } from "@/lib/db";
import { can } from "@/lib/perm";
import { Card, PageHeader, Btn, Flash, Badge, first, type SP } from "@/components/ui";
import { grade } from "@/lib/grade";

async function saveMarks(examId: number, fd: FormData) {
  "use server";
  await guard("exams", true);
  const ex = one<{ total: number }>("SELECT total FROM exams WHERE id=?", examId)!;
  for (const [k, v] of fd.entries()) {
    const m = /^m_(\d+)_(\d+)$/.exec(k);
    if (!m) continue;
    const val = String(v).trim();
    if (val === "") { run("DELETE FROM marks WHERE exam_id=? AND student_id=? AND subject_id=?", examId, Number(m[1]), Number(m[2])); continue; }
    const n = Math.min(Math.max(Number(val), 0), ex.total);
    if (Number.isFinite(n)) run("INSERT INTO marks(exam_id,student_id,subject_id,obtained) VALUES(?,?,?,?) ON CONFLICT(exam_id,student_id,subject_id) DO UPDATE SET obtained=excluded.obtained", examId, Number(m[1]), Number(m[2]), n);
  }
  redirect(`/exams/${examId}?msg=Marks+saved`);
}

export default async function ExamPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const s = await guard("exams");
  const { id } = await params;
  const sp = await searchParams;
  const ex = one<{ id: number; name: string; class_id: number; total: number; date: string }>("SELECT * FROM exams WHERE id=?", Number(id));
  if (!ex) notFound();
  const subs = all<{ id: number; name: string }>("SELECT id,name FROM subjects WHERE class_id=? ORDER BY name", ex.class_id);
  const studs = all<{ id: number; name: string }>("SELECT id,name FROM students WHERE class_id=? AND status='active' ORDER BY name", ex.class_id);
  const marks = new Map(all<{ student_id: number; subject_id: number; obtained: number }>("SELECT * FROM marks WHERE exam_id=?", ex.id).map((m) => [`${m.student_id}_${m.subject_id}`, m.obtained]));
  const w = can(s.role, "exams", true);
  const totals = studs.map((st) => { const got = subs.map((su) => marks.get(`${st.id}_${su.id}`)); const have = got.filter((x) => x !== undefined) as number[]; return { id: st.id, sum: have.reduce((a, b) => a + b, 0), max: have.length * ex.total }; });
  const ranked = [...totals].filter((t) => t.max).sort((a, b) => b.sum / b.max - a.sum / a.max).map((t, i) => [t.id, i + 1] as const);
  const rank = new Map(ranked);
  return (
    <>
      <PageHeader title={ex.name} sub={`${ex.date} · each subject out of ${ex.total}`} />
      <Flash msg={first(sp.msg)} />
      <Card className="overflow-x-auto"><form action={saveMarks.bind(null, ex.id)}>
        <table className="w-full text-sm"><thead><tr className="border-b border-line text-left text-xs uppercase text-mute"><th className="p-2">Student</th>{subs.map((su) => <th key={su.id} className="p-2">{su.name}</th>)}<th className="p-2">Total</th><th className="p-2">%</th><th className="p-2">Grade</th><th className="p-2">Rank</th></tr></thead>
          <tbody>{studs.map((st, i) => { const t = totals[i]; const pct = t.max ? (t.sum / t.max) * 100 : null; return (
            <tr key={st.id} className="border-b border-line"><td className="p-2 font-medium">{st.name}</td>
              {subs.map((su) => <td key={su.id} className="p-2">{w ? <input type="number" step="0.5" min={0} max={ex.total} name={`m_${st.id}_${su.id}`} defaultValue={marks.get(`${st.id}_${su.id}`)} className="!w-20" /> : marks.get(`${st.id}_${su.id}`) ?? "—"}</td>)}
              <td className="p-2">{t.max ? `${t.sum}/${t.max}` : "—"}</td><td className="p-2">{pct === null ? "—" : pct.toFixed(1)}</td><td className="p-2">{pct === null ? "—" : <Badge tone={pct < 40 ? "bad" : "ok"}>{grade(pct)}</Badge>}</td><td className="p-2">{rank.get(st.id) ?? "—"}</td></tr>); })}</tbody></table>
        {w && <div className="mt-4"><Btn>Save marks</Btn></div>}</form></Card>
    </>
  );
}
