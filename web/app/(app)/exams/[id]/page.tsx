import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { guard, can } from "@/lib/auth";
import { supabase } from "@/lib/supabase/server";
import { grade } from "@/lib/grade";
import { Card, PageHeader, Btn, Flash, Badge, LinkBtn, first, type SP } from "@/components/ui";

async function saveMarks(examId: string, fd: FormData) {
  "use server";
  const p = await guard("exams", "add");
  const sb = await supabase();
  const { data: ex } = await sb.from("exams").select("total,campus_id,class_id,published").eq("id", examId).maybeSingle();
  if (!ex) redirect("/exams");
  if (ex.published && !(await can("exams", "approve"))) redirect(`/exams/${examId}?msg=Results+are+published+and+locked`);
  const keep: Record<string, unknown>[] = [], drop: [string, string][] = [];
  for (const [k, v] of fd.entries()) {
    const m = /^m_([0-9a-f-]{36})_([0-9a-f-]{36})$/i.exec(k);
    if (!m) continue;
    const val = String(v).trim();
    if (val === "") { drop.push([m[1], m[2]]); continue; }
    const n = Number(val);
    if (!Number.isFinite(n) || n < 0 || n > Number(ex.total)) redirect(`/exams/${examId}?msg=${encodeURIComponent(`Marks must be between 0 and ${ex.total}`)}`);
    keep.push({ exam_id: examId, student_id: m[1], subject_id: m[2], school_id: p.school_id, campus_id: ex.campus_id, class_id: ex.class_id, obtained: n, source: "manual" });
  }
  if (keep.length) { const { error } = await sb.from("marks").upsert(keep, { onConflict: "exam_id,student_id,subject_id" }); if (error) redirect(`/exams/${examId}?msg=${encodeURIComponent(error.message)}`); }
  for (const [s, sub] of drop) await sb.from("marks").delete().eq("exam_id", examId).eq("student_id", s).eq("subject_id", sub);
  redirect(`/exams/${examId}?msg=Marks+saved`);
}
async function setPublished(examId: string, publish: boolean) {
  "use server";
  await guard("exams", "approve");
  await (await supabase()).from("exams").update({ published: publish }).eq("id", examId);
  redirect(`/exams/${examId}?msg=${publish ? "Results+published+to+parents" : "Results+unpublished"}`);
}

export default async function ExamPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  await guard("exams");
  const { id } = await params;
  const sp = await searchParams;
  const sb = await supabase();
  const { data: ex } = await sb.from("exams").select("id,name,exam_date,total,published,class_id").eq("id", id).maybeSingle();
  if (!ex) notFound();
  const [{ data: subs }, { data: studs }, { data: mk }] = await Promise.all([
    sb.from("subjects").select("id,name").eq("class_id", ex.class_id).order("name"),
    sb.from("students").select("id,full_name").eq("class_id", ex.class_id).eq("status", "active").order("full_name"),
    sb.from("marks").select("student_id,subject_id,obtained").eq("exam_id", id),
  ]);
  const marks = new Map((mk ?? []).map((m) => [`${m.student_id}_${m.subject_id}`, Number(m.obtained)]));
  const total = Number(ex.total);
  const canEnter = await can("exams", "add"), canPublish = await can("exams", "approve");
  const rows = (studs ?? []).map((s) => {
    const got = (subs ?? []).map((u) => marks.get(`${s.id}_${u.id}`)).filter((x): x is number => x !== undefined);
    const sum = got.reduce((a, b) => a + b, 0), max = got.length * total;
    return { s, sum, max, pct: max ? (sum / max) * 100 : null };
  });
  const ranked = [...rows].filter((r) => r.pct !== null).sort((a, b) => (b.pct as number) - (a.pct as number));
  const rank = new Map(ranked.map((r, i) => [r.s.id, i > 0 && r.pct === ranked[i - 1].pct ? (ranked.findIndex((x) => x.pct === r.pct) + 1) : i + 1]));  // ties share a position
  const locked = ex.published && !canPublish;
  return (
    <>
      <PageHeader title={ex.name} sub={`${ex.exam_date ?? ""} · each subject out of ${total}`}>
        <Badge tone={ex.published ? "ok" : "warn"}>{ex.published ? "Published" : "Draft"}</Badge>
        {canEnter && <LinkBtn href={`/exams/${id}/mark`} ghost>📷 Mark from photos</LinkBtn>}{canEnter && <LinkBtn href={`/exams/${id}/omr`} ghost>🔵 Bubble sheets</LinkBtn>}<LinkBtn href={`/exams/${id}/remarks`} ghost>Remarks</LinkBtn><LinkBtn href={`/exams/${id}/report`} ghost>Report cards</LinkBtn>
        {canPublish && <form action={setPublished.bind(null, id, !ex.published)}><Btn variant={ex.published ? "ghost" : "primary"}>{ex.published ? "Unpublish" : "Publish to parents"}</Btn></form>}
      </PageHeader>
      <Flash msg={first(sp.msg)} />
      <Card className="overflow-x-auto"><form action={saveMarks.bind(null, id)}>
        <table className="w-full text-sm"><thead><tr className="border-b border-line text-left text-xs uppercase text-mute"><th className="p-2">Student</th>{(subs ?? []).map((u) => <th key={u.id} className="p-2">{u.name}</th>)}<th className="p-2">Total</th><th className="p-2">%</th><th className="p-2">Grade</th><th className="p-2">Position</th></tr></thead>
          <tbody>{rows.map(({ s, sum, max, pct }) => (
            <tr key={s.id} className="border-b border-line"><td className="p-2 font-medium"><Link className="hover:underline" href={`/exams/${id}/report?student=${s.id}`}>{s.full_name}</Link></td>
              {(subs ?? []).map((u) => <td key={u.id} className="p-2">{canEnter && !locked ? <input type="number" step="0.5" min={0} max={total} name={`m_${s.id}_${u.id}`} defaultValue={marks.get(`${s.id}_${u.id}`)} className="!w-20" /> : marks.get(`${s.id}_${u.id}`) ?? "—"}</td>)}
              <td className="p-2">{max ? `${sum}/${max}` : "—"}</td><td className="p-2">{pct === null ? "—" : pct.toFixed(1)}</td><td className="p-2">{pct === null ? "—" : <Badge tone={pct < 40 ? "bad" : "ok"}>{grade(pct)}</Badge>}</td><td className="p-2">{rank.get(s.id) ?? "—"}</td></tr>))}</tbody></table>
        {canEnter && !locked && <div className="mt-4"><Btn>Save marks</Btn></div>}{locked && <p className="mt-3 text-sm text-mute">Published results are locked. Ask someone with approval rights to unpublish before editing.</p>}
      </form></Card>
    </>
  );
}
