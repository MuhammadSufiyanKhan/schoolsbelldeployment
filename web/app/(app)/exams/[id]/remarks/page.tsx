import { notFound, redirect } from "next/navigation";
import { guard, can } from "@/lib/auth";
import { supabase } from "@/lib/supabase/server";
import { draftRemarks } from "@/lib/remarks";
import { Card, PageHeader, Btn, Flash, Badge, LinkBtn, first, type SP } from "@/components/ui";

async function context(examId: string) {
  const p = await guard("exams", "add");
  const sb = await supabase();
  const { data: ex } = await sb.from("exams").select("id,class_id,campus_id,total").eq("id", examId).maybeSingle();
  if (!ex) redirect("/exams");
  return { p, sb, ex };
}
async function draftAll(examId: string) {
  "use server";
  const { p, sb, ex } = await context(examId);
  const [{ data: studs }, { data: subs }, { data: mk }, { data: att }, { data: have }] = await Promise.all([
    sb.from("students").select("id,full_name").eq("class_id", ex.class_id).eq("status", "active"),
    sb.from("subjects").select("id,name").eq("class_id", ex.class_id),
    sb.from("marks").select("student_id,subject_id,obtained").eq("exam_id", examId),
    sb.from("attendance").select("student_id,status").eq("class_id", ex.class_id),
    sb.from("report_remarks").select("student_id,source").eq("exam_id", examId),
  ]);
  const manual = new Set((have ?? []).filter((r) => r.source === "manual").map((r) => r.student_id));   // never overwrite a teacher's own words
  const rows = [];
  for (const s of studs ?? []) {
    if (manual.has(s.id)) continue;
    const mine = (mk ?? []).filter((m) => m.student_id === s.id).map((m) => ({ name: subs?.find((u) => u.id === m.subject_id)?.name ?? "", pct: (Number(m.obtained) / Number(ex.total)) * 100 }));
    const pct = mine.length ? mine.reduce((a, b) => a + b.pct, 0) / mine.length : null;
    const sorted = [...mine].sort((a, b) => b.pct - a.pct);
    const a = (att ?? []).filter((x) => x.student_id === s.id);
    const d = draftRemarks({ name: s.full_name, pct, best: sorted[0]?.name, worst: sorted.at(-1)?.name, attendance: a.length ? (a.filter((x) => x.status === "P").length / a.length) * 100 : null });
    rows.push({ exam_id: examId, student_id: s.id, school_id: p.school_id, campus_id: ex.campus_id, class_id: ex.class_id, remark_en: d.en, remark_ur: d.ur, source: "template" });
  }
  if (rows.length) await sb.from("report_remarks").upsert(rows, { onConflict: "exam_id,student_id" });
  redirect(`/exams/${examId}/remarks?msg=Drafted+${rows.length}+remarks.+Please+read+and+edit+them.`);
}
async function saveAll(examId: string, fd: FormData) {
  "use server";
  const { p, sb, ex } = await context(examId);
  const ids = new Set<string>();
  for (const k of fd.keys()) { const m = /^en_([0-9a-f-]{36})$/i.exec(k); if (m) ids.add(m[1]); }
  const rows = [...ids].map((sid) => ({ exam_id: examId, student_id: sid, school_id: p.school_id, campus_id: ex.campus_id, class_id: ex.class_id, remark_en: String(fd.get(`en_${sid}`) ?? "").trim(), remark_ur: String(fd.get(`ur_${sid}`) ?? "").trim(), source: "manual" }));
  const { error } = await sb.from("report_remarks").upsert(rows, { onConflict: "exam_id,student_id" });
  redirect(`/exams/${examId}/remarks?msg=${error ? encodeURIComponent(error.message) : "Remarks+saved"}`);
}

export default async function Remarks({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  await guard("exams");
  const { id } = await params;
  const sp = await searchParams;
  const sb = await supabase();
  const { data: ex } = await sb.from("exams").select("id,name,class_id").eq("id", id).maybeSingle();
  if (!ex) notFound();
  const [{ data: studs }, { data: rem }] = await Promise.all([
    sb.from("students").select("id,full_name").eq("class_id", ex.class_id).eq("status", "active").order("full_name"),
    sb.from("report_remarks").select("student_id,remark_en,remark_ur,source").eq("exam_id", id),
  ]);
  const by = new Map((rem ?? []).map((r) => [r.student_id, r]));
  const w = await can("exams", "add");
  return (
    <>
      <PageHeader title={`Remarks · ${ex.name}`} sub="English and Urdu. Drafts come from each student's marks and attendance; always read before printing.">
        <LinkBtn href={`/exams/${id}`} ghost>Back to marks</LinkBtn>{w && <form action={draftAll.bind(null, id)}><Btn variant="ghost">Draft from marks</Btn></form>}
      </PageHeader>
      <Flash msg={first(sp.msg)} />
      <form action={saveAll.bind(null, id)} className="space-y-3">
        {(studs ?? []).map((s) => { const r = by.get(s.id); return (
          <Card key={s.id}><div className="mb-2 flex items-center gap-2"><b>{s.full_name}</b>{r && <Badge tone={r.source === "manual" ? "ok" : "warn"}>{r.source === "manual" ? "edited" : "draft"}</Badge>}</div>
            <div className="grid gap-2 md:grid-cols-2"><textarea name={`en_${s.id}`} rows={3} defaultValue={r?.remark_en ?? ""} placeholder="English remark" disabled={!w} />
              <textarea name={`ur_${s.id}`} rows={3} dir="rtl" lang="ur" defaultValue={r?.remark_ur ?? ""} placeholder="اردو ریمارکس" disabled={!w} className="text-base leading-loose" /></div></Card>); })}
        {w && (studs?.length ?? 0) > 0 && <Btn>Save remarks</Btn>}
      </form>
    </>
  );
}
