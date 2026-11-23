import { notFound, redirect } from "next/navigation";
import { guard, can } from "@/lib/auth";
import { supabase } from "@/lib/supabase/server";
import { aiReady } from "@/lib/ai";
import OmrMarking from "@/components/omr-marking";
import { Card, PageHeader, LinkBtn, Flash, str, first, type SP } from "@/components/ui";

async function saveOmr(examId: string, fd: FormData) {
  "use server";
  const p = await guard("exams", "add");
  const sb = await supabase();
  const { data: ex } = await sb.from("exams").select("total,campus_id,class_id,published").eq("id", examId).maybeSingle();
  if (!ex) redirect("/exams");
  if (ex.published && !(await can("exams", "approve"))) redirect(`/exams/${examId}/omr?msg=Results+are+published+and+locked`);
  let rows: { student_id: string; score: number; answers: string }[] = [];
  try { rows = JSON.parse(str(fd, "rows")); } catch { /* handled */ }
  const total = Math.max(1, Number(fd.get("total")) || 1), subject = str(fd, "subject_id");
  if (!rows.length || rows.length > 200) redirect(`/exams/${examId}/omr?msg=Nothing+to+save`);
  const data = rows.map((r) => ({ exam_id: examId, student_id: r.student_id, subject_id: subject, school_id: p.school_id, campus_id: ex.campus_id, class_id: ex.class_id,
    obtained: Math.round((Math.min(total, Math.max(0, Number(r.score) || 0)) / total) * Number(ex.total) * 2) / 2, reason: `OMR sheet: ${Math.round(Number(r.score))}/${total} correct. Read by AI, confirmed by a person.`, source: "omr" }));
  const { error } = await sb.from("marks").upsert(data, { onConflict: "exam_id,student_id,subject_id" });
  redirect(`/exams/${examId}/omr?msg=${error ? encodeURIComponent(error.message) : encodeURIComponent(`Saved ${data.length} results.`)}`);
}
export default async function Omr({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  await guard("exams", "add");
  const { id } = await params; const sp = await searchParams; const sb = await supabase();
  const { data: ex } = await sb.from("exams").select("id,name,class_id").eq("id", id).maybeSingle(); if (!ex) notFound();
  const [{ data: studs }, { data: subs }] = await Promise.all([
    sb.from("students").select("id,full_name,roll_no").eq("class_id", ex.class_id).eq("status", "active").order("roll_no"), sb.from("subjects").select("id,name").eq("class_id", ex.class_id).order("name")]);
  return (
    <>
      <PageHeader title={`Bubble sheets · ${ex.name}`} sub="Photograph each OMR sheet. The roll number and every bubble are read and marked against your key."><LinkBtn href={`/exams/${id}`} ghost>Back to marks</LinkBtn></PageHeader>
      <Flash msg={first(sp.msg)} />
      {!aiReady() ? <Card><p className="text-sm">AI is not set up (GEMINI_API_KEY).</p></Card> : !studs?.length || !subs?.length ? <Card><p className="text-sm text-mute">This exam's class needs students and subjects first.</p></Card> :
        <Card><OmrMarking students={(studs ?? []).map((s) => ({ id: s.id, name: s.full_name, roll: String(s.roll_no ?? "") }))} subjects={subs ?? []} save={saveOmr.bind(null, id)} /></Card>}
    </>
  );
}
